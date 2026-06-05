import mysql from 'mysql2/promise';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, copyFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ========== 커넥션 풀 ==========
export const pool = mysql.createPool({
  host:             process.env.GMC_DB_HOST     || 'localhost',
  port:             parseInt(process.env.GMC_DB_PORT || '3306', 10),
  user:             process.env.GMC_DB_USER     || 'gmcauto',
  password:         process.env.GMC_DB_PASSWORD || '',
  database:         process.env.GMC_DB_NAME     || 'gmcauto',
  waitForConnections: true,
  connectionLimit:  10,
  charset:          'utf8mb4',
  timezone:         '+09:00',
  ssl:              process.env.GMC_DB_SSL === 'true' ? {} : undefined,
});

// 모든 새 커넥션에 KST 세션 타임존 설정
// → MySQL NOW(), CURRENT_TIMESTAMP 등이 UTC+9(KST) 기준으로 동작
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+09:00'", (err) => {
    if (err) console.warn('[DB] time_zone 설정 실패:', err.message);
  });
});

// ========== 테이블 초기화 ==========
export async function initDb() {
  // 사용자 테이블 (Going HAFS 계정 + Akademiya 연동)
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS gmc_users (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      student_no          VARCHAR(20),
      password            TEXT,
      role                INT DEFAULT 0,
      akademiya_user_id   INT UNSIGNED,
      akademiya_email     VARCHAR(255),
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_student_no (student_no),
      UNIQUE KEY uq_akademiya_user (akademiya_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 스케줄 테이블
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schedules (
      time          VARCHAR(5)   NOT NULL,
      date          VARCHAR(10)  NOT NULL,
      session_id    VARCHAR(100) NOT NULL,
      student_no    VARCHAR(20)  NOT NULL,
      time_code     VARCHAR(5)   NOT NULL,
      teacher_id    VARCHAR(50)  NOT NULL,
      reason        TEXT,
      executed      TINYINT  DEFAULT 0,
      result_ok     TINYINT  DEFAULT NULL,
      result_msg    TEXT     DEFAULT NULL,
      registered_at DATETIME NOT NULL,
      executed_at   DATETIME DEFAULT NULL,
      PRIMARY KEY (time, date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 사용 통계 테이블
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      student_no    VARCHAR(20)  NOT NULL,
      grade         VARCHAR(5)   NOT NULL,
      class         VARCHAR(5)   NOT NULL,
      number        VARCHAR(5)   NOT NULL,
      teacher_id    VARCHAR(50)  NOT NULL,
      time_code     VARCHAR(5)   NOT NULL,
      schedule_time VARCHAR(5)   NOT NULL,
      apply_date    VARCHAR(10)  NOT NULL,
      success       TINYINT      NOT NULL,
      message       TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 재시도 큐 테이블
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS retries (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      retry_at    BIGINT       NOT NULL,
      student_no  VARCHAR(20)  NOT NULL,
      time_code   VARCHAR(5)   NOT NULL,
      reason      TEXT,
      apply_date  VARCHAR(10)  NOT NULL,
      origin_time VARCHAR(5)   NOT NULL,
      attempt     INT DEFAULT  1,
      created_at  BIGINT DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000),
      INDEX idx_retry_at (retry_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 개인정보 처리방침 동의 이력 테이블
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS privacy_consents (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      gmc_user_id  INT NOT NULL,
      version      INT NOT NULL,
      consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_gmc_user (gmc_user_id),
      FOREIGN KEY (gmc_user_id) REFERENCES gmc_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 7일 지난 schedules 자동 정리
  await pool.execute(
    "DELETE FROM schedules WHERE date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
  );
  // 7일 지난 retries 정리
  await pool.execute(
    "DELETE FROM retries WHERE apply_date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
  );

  console.log('[DB] MySQL 초기화 완료');
}

// ========== 인증 정보 ==========

export async function saveCredentials(studentNo, password) {
  await pool.execute(
    `INSERT INTO gmc_users (student_no, password, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE password = VALUES(password), updated_at = NOW()`,
    [studentNo, password]
  );
}

export async function getCredentials(studentNo) {
  const [rows] = await pool.execute(
    'SELECT id, student_no, password, role, akademiya_user_id, akademiya_email FROM gmc_users WHERE student_no = ?',
    [studentNo]
  );
  return rows[0] || null;
}

export async function deleteCredentials(studentNo) {
  await pool.execute('DELETE FROM gmc_users WHERE student_no = ?', [studentNo]);
}

export async function getUserRole(studentNo) {
  const [rows] = await pool.execute(
    'SELECT COALESCE(role, 0) AS role FROM gmc_users WHERE student_no = ?',
    [studentNo]
  );
  return rows[0]?.role ?? 0;
}

export async function setUserRole(studentNo, role) {
  await pool.execute(
    `INSERT INTO gmc_users (student_no, password, role, updated_at)
     VALUES (?, '', ?, NOW())
     ON DUPLICATE KEY UPDATE role = VALUES(role), updated_at = NOW()`,
    [studentNo, role]
  );
}

export async function getAllCredentials() {
  const [rows] = await pool.execute(
    `SELECT student_no, COALESCE(role, 0) AS role, updated_at,
            akademiya_user_id, akademiya_email
     FROM gmc_users
     ORDER BY COALESCE(role, 0) DESC, student_no`
  );
  return rows;
}

// ========== Akademiya OAuth 연동 ==========

/** Akademiya 계정으로 신규 연동 생성 또는 기존 연동 업데이트 */
export async function saveAkademiyaUser({ akademiyaUserId, akademiyaEmail, studentNo, password, role }) {
  await pool.execute(
    `INSERT INTO gmc_users
       (akademiya_user_id, akademiya_email, student_no, password, role, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       akademiya_email = VALUES(akademiya_email),
       student_no      = COALESCE(VALUES(student_no), student_no),
       password        = COALESCE(VALUES(password), password),
       role            = VALUES(role),
       updated_at      = NOW()`,
    [akademiyaUserId, akademiyaEmail, studentNo || null, password || null, role ?? 0]
  );
}

/** Akademiya user_id로 GMCAuto 사용자 조회 */
export async function getByAkademiyaUserId(akademiyaUserId) {
  const [rows] = await pool.execute(
    'SELECT * FROM gmc_users WHERE akademiya_user_id = ?',
    [akademiyaUserId]
  );
  return rows[0] || null;
}

/** Akademiya 계정으로 로그인한 사용자의 Going HAFS 자격증명 연결 */
export async function linkGoingHafsCredentials(akademiyaUserId, studentNo, password, role) {
  await pool.execute(
    `UPDATE gmc_users
     SET student_no = ?, password = ?, role = ?, updated_at = NOW()
     WHERE akademiya_user_id = ?`,
    [studentNo, password, role, akademiyaUserId]
  );
  // 만약 행이 없으면 삽입
  const [res] = await pool.execute('SELECT ROW_COUNT() AS cnt');
  if (res[0]?.cnt === 0) {
    await pool.execute(
      `INSERT INTO gmc_users (akademiya_user_id, student_no, password, role, updated_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [akademiyaUserId, studentNo, password, role]
    );
  }
}

// ========== 스케줄 ==========

export async function registerSchedule(time, date, sessionId, studentNo, timeCode, teacherId, reason) {
  await pool.execute(
    `INSERT INTO schedules
       (time, date, session_id, student_no, time_code, teacher_id, reason, executed, registered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW())
     ON DUPLICATE KEY UPDATE
       session_id = VALUES(session_id),
       student_no = VALUES(student_no),
       time_code  = VALUES(time_code),
       teacher_id = VALUES(teacher_id),
       reason     = VALUES(reason),
       executed   = 0,
       registered_at = NOW()`,
    [time, date, sessionId, studentNo, timeCode, teacherId, reason || '']
  );
}

export async function getScheduleAt(time, date) {
  const [rows] = await pool.execute(
    'SELECT * FROM schedules WHERE time = ? AND date = ?',
    [time, date]
  );
  return rows[0] || null;
}

export async function getMySchedule(studentNo, date) {
  const [rows] = await pool.execute(
    'SELECT * FROM schedules WHERE student_no = ? AND date = ? ORDER BY executed ASC, time ASC LIMIT 1',
    [studentNo, date]
  );
  return rows[0] || null;
}

export async function getTodaySchedules(date) {
  const [rows] = await pool.execute(
    'SELECT * FROM schedules WHERE date = ?',
    [date]
  );
  return rows;
}

export async function getSchedulesByDate(date) {
  const [rows] = await pool.execute(
    'SELECT * FROM schedules WHERE date = ?',
    [date]
  );
  return rows;
}

export async function getPendingSchedule(time, date) {
  const [rows] = await pool.execute(
    'SELECT * FROM schedules WHERE time = ? AND date = ? AND executed = 0',
    [time, date]
  );
  return rows[0] || null;
}

export async function cancelSchedule(time, date, studentNo) {
  const [res] = await pool.execute(
    'DELETE FROM schedules WHERE time = ? AND date = ? AND student_no = ?',
    [time, date, studentNo]
  );
  return { changes: res.affectedRows };
}

export async function markScheduleExecuted(time, date, success, message) {
  await pool.execute(
    `UPDATE schedules
     SET executed = 1, result_ok = ?, result_msg = ?, executed_at = NOW()
     WHERE time = ? AND date = ?`,
    [success ? 1 : 0, message, time, date]
  );
}

export async function updateScheduleSessionId(studentNo, date, newSessionId) {
  await pool.execute(
    'UPDATE schedules SET session_id = ? WHERE student_no = ? AND date = ?',
    [newSessionId, studentNo, date]
  );
}

// ========== 재시도 큐 ==========

export async function addRetry(retryAtMs, studentNo, timeCode, reason, applyDate, originTime, attempt = 1) {
  await pool.execute(
    `INSERT INTO retries (retry_at, student_no, time_code, reason, apply_date, origin_time, attempt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [retryAtMs, studentNo, timeCode, reason || '', applyDate, originTime, attempt]
  );
}

export async function getDueRetry() {
  const [rows] = await pool.execute(
    'SELECT * FROM retries WHERE retry_at <= ? ORDER BY retry_at ASC LIMIT 1',
    [Date.now()]
  );
  return rows[0] || null;
}

export async function deleteRetry(id) {
  await pool.execute('DELETE FROM retries WHERE id = ?', [id]);
}

// ========== 통계 ==========

export function parseStudentNo(studentNo) {
  const s = String(studentNo);
  if (s.length === 5) {
    return { grade: s[0], class: s.substring(1, 3), number: s.substring(3, 5) };
  }
  return { grade: '-', class: '-', number: '-' };
}

export async function recordUsage(studentNo, teacherId, timeCode, scheduleTime, applyDate, success, message) {
  const { grade, class: cls, number } = parseStudentNo(studentNo);
  await pool.execute(
    `INSERT INTO usage_stats
       (student_no, grade, class, number, teacher_id, time_code, schedule_time, apply_date, success, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [studentNo, grade, cls, number, teacherId, timeCode, scheduleTime, applyDate, success ? 1 : 0, message || '']
  );
}

export async function getUsageStats(limit = 100) {
  const [rows] = await pool.execute(
    'SELECT * FROM usage_stats ORDER BY id DESC LIMIT ?',
    [limit]
  );
  return rows;
}

export async function getUsageStatsByDate(date) {
  const [rows] = await pool.execute(
    'SELECT * FROM usage_stats WHERE apply_date = ? ORDER BY id DESC',
    [date]
  );
  return rows;
}

export async function getUsageStatsSummary() {
  const [rows] = await pool.execute(`
    SELECT apply_date,
           COUNT(*) AS total,
           SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
           SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS fail_count
    FROM usage_stats
    GROUP BY apply_date
    ORDER BY apply_date DESC
    LIMIT 30
  `);
  return rows;
}

export async function getAdminStats({ grade, cls, dateFrom, dateTo } = {}) {
  const conditions = [];
  const params = [];
  if (grade)    { conditions.push('grade = ?');       params.push(grade); }
  if (cls)      { conditions.push('class = ?');       params.push(cls); }
  if (dateFrom) { conditions.push('apply_date >= ?'); params.push(dateFrom); }
  if (dateTo)   { conditions.push('apply_date <= ?'); params.push(dateTo); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(`SELECT * FROM usage_stats ${where} ORDER BY id DESC`, params);
  return rows;
}

export async function deleteFailedStats({ grade, cls, dateFrom, dateTo } = {}) {
  const conditions = ['success = 0'];
  const params = [];
  if (grade)    { conditions.push('grade = ?');       params.push(grade); }
  if (cls)      { conditions.push('class = ?');       params.push(cls); }
  if (dateFrom) { conditions.push('apply_date >= ?'); params.push(dateFrom); }
  if (dateTo)   { conditions.push('apply_date <= ?'); params.push(dateTo); }
  const [res] = await pool.execute(
    `DELETE FROM usage_stats WHERE ${conditions.join(' AND ')}`,
    params
  );
  return res.affectedRows;
}

// ========== 개인정보 처리방침 동의 ==========

export async function getPrivacyConsent(gmcUserId) {
  const [rows] = await pool.execute(
    'SELECT version FROM privacy_consents WHERE gmc_user_id = ?',
    [gmcUserId]
  );
  return rows[0]?.version ?? 0;
}

export async function savePrivacyConsent(gmcUserId, version) {
  await pool.execute(
    `INSERT INTO privacy_consents (gmc_user_id, version)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE version = VALUES(version), consented_at = NOW()`,
    [gmcUserId, version]
  );
}

// ========== 정기 정리 ==========

export async function cleanupOldSchedules() {
  const [res] = await pool.execute(
    "DELETE FROM schedules WHERE date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
  );
  return res.affectedRows;
}

// ========== 백업 (MySQL dump 방식) ==========
// SQLite의 native backup API 대신 mysqldump를 사용하거나 단순 JSON 내보내기
// 여기서는 usage_stats를 JSON으로 백업
export async function backupDb(destPath) {
  const [rows] = await pool.execute('SELECT * FROM usage_stats ORDER BY id');
  const { writeFileSync } = await import('fs');
  writeFileSync(destPath, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`[백업] JSON 백업 완료: ${destPath}`);
}
