import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'gmcauto.db');

mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');

// ========== 테이블 생성 + 마이그레이션 ==========

// schedules: 기존 DB가 (time)만 PK인 경우 (time, date) 복합 PK로 마이그레이션
const schedulesInfo = db.prepare(`PRAGMA table_info(schedules)`).all();
const hasBadPK = schedulesInfo.length > 0 &&
  schedulesInfo.filter(c => c.pk > 0).length === 1 &&
  schedulesInfo.find(c => c.pk === 1)?.name === 'time';

if (hasBadPK) {
  db.exec(`ALTER TABLE schedules RENAME TO schedules_old;`);
  console.log('[DB] schedules 마이그레이션 시작 (PK: time → time+date)');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    time          TEXT NOT NULL,
    date          TEXT NOT NULL,
    session_id    TEXT NOT NULL,
    student_no    TEXT NOT NULL,
    time_code     TEXT NOT NULL,
    teacher_id    TEXT NOT NULL,
    reason        TEXT DEFAULT '',
    executed      INTEGER DEFAULT 0,
    result_ok     INTEGER DEFAULT NULL,
    result_msg    TEXT DEFAULT NULL,
    registered_at TEXT NOT NULL,
    executed_at   TEXT DEFAULT NULL,
    PRIMARY KEY (time, date)
  )
`);

if (hasBadPK) {
  db.exec(`
    INSERT OR IGNORE INTO schedules
      SELECT time, date, session_id, student_no, time_code, teacher_id,
             reason, executed, result_ok, result_msg, registered_at, executed_at
      FROM schedules_old WHERE date >= date('now', 'localtime', '-1 day');
    DROP TABLE schedules_old;
  `);
  console.log('[DB] schedules 마이그레이션 완료');
}

// 7일 이상 지난 스케줄 자동 정리 (서버 시작 시 1회)
db.prepare(`DELETE FROM schedules WHERE date < date('now', 'localtime', '-7 day')`).run();

// 사용 통계
db.exec(`
  CREATE TABLE IF NOT EXISTS usage_stats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_no    TEXT NOT NULL,
    grade         TEXT NOT NULL,
    class         TEXT NOT NULL,
    number        TEXT NOT NULL,
    teacher_id    TEXT NOT NULL,
    time_code     TEXT NOT NULL,
    schedule_time TEXT NOT NULL,
    apply_date    TEXT NOT NULL,
    success       INTEGER NOT NULL,
    message       TEXT DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// 학생 인증 정보 (자동 로그인용)
db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    student_no TEXT PRIMARY KEY,
    password   TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// role 컬럼 마이그레이션 (기존 DB 호환)
const credColInfo = db.prepare('PRAGMA table_info(credentials)').all();
if (!credColInfo.find(c => c.name === 'role')) {
  db.exec('ALTER TABLE credentials ADD COLUMN role INTEGER DEFAULT 0');
  console.log('[DB] credentials 테이블 role 컬럼 추가');
}

// 재시도 큐 (예약 현황과 분리, Unix ms 단위)
db.exec(`
  CREATE TABLE IF NOT EXISTS retries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    retry_at    INTEGER NOT NULL,
    student_no  TEXT NOT NULL,
    time_code   TEXT NOT NULL,
    reason      TEXT DEFAULT '',
    apply_date  TEXT NOT NULL,
    origin_time TEXT NOT NULL,
    attempt     INTEGER DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_retries_at ON retries(retry_at)`);

// teacher_id 일괄 'gmcauto' 마이그레이션 (기존 DB 데이터 보존, 값만 변경)
const updatedSched = db.prepare(`UPDATE schedules SET teacher_id = 'gmcauto' WHERE teacher_id != 'gmcauto'`).run();
const updatedStats = db.prepare(`UPDATE usage_stats SET teacher_id = 'gmcauto' WHERE teacher_id != 'gmcauto'`).run();
if (updatedSched.changes || updatedStats.changes) {
  console.log(`[DB] teacher_id 마이그레이션: schedules ${updatedSched.changes}건, usage_stats ${updatedStats.changes}건`);
}

// 오래된 retries 정리 (7일 이상, 서버 시작 시 1회)
db.prepare(`DELETE FROM retries WHERE apply_date < date('now', 'localtime', '-7 day')`).run();

// ========== Prepared Statements ==========

const stmtUpsertCred = db.prepare(`
  INSERT INTO credentials (student_no, password, updated_at)
  VALUES (?, ?, datetime('now', 'localtime'))
  ON CONFLICT(student_no) DO UPDATE SET password = excluded.password, updated_at = excluded.updated_at
`);
const stmtGetCred = db.prepare(`SELECT * FROM credentials WHERE student_no = ?`);
const stmtDeleteCred = db.prepare(`DELETE FROM credentials WHERE student_no = ?`);
const stmtSetUserRole = db.prepare(`
  INSERT INTO credentials (student_no, password, role, updated_at)
  VALUES (?, '', ?, datetime('now', 'localtime'))
  ON CONFLICT(student_no) DO UPDATE SET role = excluded.role, updated_at = datetime('now', 'localtime')
`);
const stmtGetUserRole = db.prepare(`SELECT COALESCE(role, 0) AS role FROM credentials WHERE student_no = ?`);
const stmtGetAllCredentials = db.prepare(`
  SELECT student_no, COALESCE(role, 0) AS role, updated_at
  FROM credentials
  ORDER BY COALESCE(role, 0) DESC, student_no
`);

const stmtInsertSchedule = db.prepare(`
  INSERT OR REPLACE INTO schedules (time, date, session_id, student_no, time_code, teacher_id, reason, executed, registered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
`);
const stmtGetSchedule = db.prepare(`SELECT * FROM schedules WHERE time = ? AND date = ?`);
const stmtGetMySchedule = db.prepare(`SELECT * FROM schedules WHERE student_no = ? AND date = ? ORDER BY executed ASC, time ASC LIMIT 1`);
const stmtGetTodaySchedules = db.prepare(`SELECT * FROM schedules WHERE date = ?`);
const stmtGetPendingByTime = db.prepare(`SELECT * FROM schedules WHERE time = ? AND date = ? AND executed = 0`);
const stmtGetSchedulesByDate = db.prepare(`SELECT * FROM schedules WHERE date = ?`);
const stmtDeleteSchedule = db.prepare(`DELETE FROM schedules WHERE time = ? AND date = ? AND student_no = ?`);
const stmtMarkExecuted = db.prepare(`
  UPDATE schedules SET executed = 1, result_ok = ?, result_msg = ?, executed_at = ? WHERE time = ? AND date = ?
`);
const stmtUpdateSessionId = db.prepare(`UPDATE schedules SET session_id = ? WHERE student_no = ? AND date = ?`);

const stmtInsertStat = db.prepare(`
  INSERT INTO usage_stats (student_no, grade, class, number, teacher_id, time_code, schedule_time, apply_date, success, message)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetStats = db.prepare(`SELECT * FROM usage_stats ORDER BY id DESC LIMIT ?`);
const stmtGetStatsByDate = db.prepare(`SELECT * FROM usage_stats WHERE apply_date = ? ORDER BY id DESC`);
const stmtGetStatsSummary = db.prepare(`
  SELECT apply_date, COUNT(*) AS total,
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
         SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count
  FROM usage_stats GROUP BY apply_date ORDER BY apply_date DESC LIMIT 30
`);

const stmtAddRetry = db.prepare(`
  INSERT INTO retries (retry_at, student_no, time_code, reason, apply_date, origin_time, attempt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetDueRetry = db.prepare(`SELECT * FROM retries WHERE retry_at <= ? ORDER BY retry_at ASC LIMIT 1`);
const stmtDeleteRetry = db.prepare(`DELETE FROM retries WHERE id = ?`);

// ========== 인증 정보 ==========

export function saveCredentials(studentNo, password) { stmtUpsertCred.run(studentNo, password); }
export function getCredentials(studentNo) { return stmtGetCred.get(studentNo); }
export function deleteCredentials(studentNo) { stmtDeleteCred.run(studentNo); }

export function getUserRole(studentNo) {
  const row = stmtGetUserRole.get(studentNo);
  return row ? (row.role ?? 0) : 0;
}
export function setUserRole(studentNo, role) { stmtSetUserRole.run(studentNo, role); }
export function getAllCredentials() { return stmtGetAllCredentials.all(); }

// ========== 스케줄 ==========

export function registerSchedule(time, date, sessionId, studentNo, timeCode, teacherId, reason) {
  stmtInsertSchedule.run(time, date, sessionId, studentNo, timeCode, teacherId, reason, new Date().toISOString());
}
export function getScheduleAt(time, date) { return stmtGetSchedule.get(time, date); }
export function getMySchedule(studentNo, date) { return stmtGetMySchedule.get(studentNo, date); }
export function getTodaySchedules(date) { return stmtGetTodaySchedules.all(date); }
export function getSchedulesByDate(date) { return stmtGetSchedulesByDate.all(date); }
export function getPendingSchedule(time, date) { return stmtGetPendingByTime.get(time, date); }
export function cancelSchedule(time, date, studentNo) { return stmtDeleteSchedule.run(time, date, studentNo); }
export function markScheduleExecuted(time, date, success, message) {
  stmtMarkExecuted.run(success ? 1 : 0, message, new Date().toISOString(), time, date);
}
export function updateScheduleSessionId(studentNo, date, newSessionId) {
  stmtUpdateSessionId.run(newSessionId, studentNo, date);
}

// ========== 재시도 큐 ==========

export function addRetry(retryAtMs, studentNo, timeCode, reason, applyDate, originTime, attempt = 1) {
  stmtAddRetry.run(retryAtMs, studentNo, timeCode, reason, applyDate, originTime, attempt);
}
export function getDueRetry() { return stmtGetDueRetry.get(Date.now()); }
export function deleteRetry(id) { stmtDeleteRetry.run(id); }

// ========== 통계 ==========

export function parseStudentNo(studentNo) {
  const s = String(studentNo);
  if (s.length === 5) {
    return { grade: s[0], class: s.substring(1, 3), number: s.substring(3, 5) };
  }
  return { grade: '-', class: '-', number: '-' };
}

export function recordUsage(studentNo, teacherId, timeCode, scheduleTime, applyDate, success, message) {
  const { grade, class: cls, number } = parseStudentNo(studentNo);
  stmtInsertStat.run(studentNo, grade, cls, number, teacherId, timeCode, scheduleTime, applyDate, success ? 1 : 0, message || '');
}

export function getUsageStats(limit = 100) { return stmtGetStats.all(limit); }
export function getUsageStatsByDate(date) { return stmtGetStatsByDate.all(date); }
export function getUsageStatsSummary() { return stmtGetStatsSummary.all(); }

export function getAdminStats({ grade, cls, dateFrom, dateTo } = {}) {
  const conditions = [];
  const params = [];
  if (grade)    { conditions.push('grade = ?');        params.push(grade); }
  if (cls)      { conditions.push('class = ?');        params.push(cls); }
  if (dateFrom) { conditions.push('apply_date >= ?');  params.push(dateFrom); }
  if (dateTo)   { conditions.push('apply_date <= ?');  params.push(dateTo); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM usage_stats ${where} ORDER BY id DESC`).all(...params);
}

export function deleteFailedStats({ grade, cls, dateFrom, dateTo } = {}) {
  const conditions = ['success = 0'];
  const params = [];
  if (grade)    { conditions.push('grade = ?');       params.push(grade); }
  if (cls)      { conditions.push('class = ?');       params.push(cls); }
  if (dateFrom) { conditions.push('apply_date >= ?'); params.push(dateFrom); }
  if (dateTo)   { conditions.push('apply_date <= ?'); params.push(dateTo); }
  const result = db.prepare(`DELETE FROM usage_stats WHERE ${conditions.join(' AND ')}`).run(...params);
  return result.changes;
}

// ========== 백업 ==========

/**
 * DB 무결성 백업 (better-sqlite3의 native backup API 사용)
 * 트랜잭션 중에도 안전하게 일관된 스냅샷을 생성
 */
export function backupDb(destPath) {
  return db.backup(destPath);
}

// ========== 정기 정리 ==========

// 7일 지난 schedules 삭제 (usage_stats는 관리자 수동 삭제만 허용)
export function cleanupOldSchedules() {
  const result = db.prepare(`DELETE FROM schedules WHERE date < date('now', 'localtime', '-7 day')`).run();
  return result.changes;
}

export default db;
