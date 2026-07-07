import mysql, { ResultSetHeader } from 'mysql2/promise';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import type {
  GmcUserRow, ScheduleRow, RetryRow, UsageStatRow,
  ConsentRow, RoleRow, ParsedStudentNo, SuspendPeriodRow, PushSubscriptionRow,
  RecurringScheduleRow,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
void __dirname; // used for backup path in backupDb

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pool as any).on('connection', (connection: any) => {
  connection.query("SET time_zone = '+09:00'", (err: Error | null) => {
    if (err) console.warn('[DB] time_zone 설정 실패:', err.message);
  });
});

// ========== 테이블 초기화 ==========
export async function initDb(): Promise<void> {
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
      UNIQUE KEY uq_akademiya_user (akademiya_user_id),
      UNIQUE KEY uq_akademiya_email (akademiya_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS gmc_recurring_schedules (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      student_no  VARCHAR(20)  NOT NULL,
      time        VARCHAR(5)   NOT NULL,
      time_code   VARCHAR(5)   NOT NULL,
      teacher_id  VARCHAR(50)  NOT NULL,
      reason      TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_student_no (student_no),
      UNIQUE KEY uq_time (time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

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

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS terms_consents (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      gmc_user_id  INT NOT NULL,
      version      INT NOT NULL,
      consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_gmc_user (gmc_user_id),
      FOREIGN KEY (gmc_user_id) REFERENCES gmc_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS gmc_suspend_periods (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      start_date VARCHAR(10) NOT NULL,
      end_date   VARCHAR(10) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      gmc_user_id  INT NOT NULL,
      endpoint     TEXT NOT NULL,
      p256dh       TEXT NOT NULL,
      auth_key     TEXT NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_gmc_user (gmc_user_id),
      FOREIGN KEY (gmc_user_id) REFERENCES gmc_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(
    "DELETE FROM schedules WHERE date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
  );
  await pool.execute(
    "DELETE FROM retries WHERE apply_date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
  );

  console.log('[DB] MySQL 초기화 완료');
}

// ========== 인증 정보 ==========

export async function getCredentials(studentNo: string): Promise<GmcUserRow | null> {
  const [rows] = await pool.execute<GmcUserRow[]>(
    'SELECT id, student_no, password, role, akademiya_user_id, akademiya_email FROM gmc_users WHERE student_no = ?',
    [studentNo]
  );
  return rows[0] ?? null;
}

export async function deleteCredentials(studentNo: string): Promise<void> {
  await pool.execute('DELETE FROM gmc_users WHERE student_no = ?', [studentNo]);
}

export async function getAllCredentials(): Promise<GmcUserRow[]> {
  const [rows] = await pool.execute<GmcUserRow[]>(
    `SELECT student_no, COALESCE(role, 0) AS role, updated_at,
            akademiya_user_id, akademiya_email
     FROM gmc_users
     ORDER BY COALESCE(role, 0) DESC, student_no`
  );
  return rows;
}

// ========== Akademiya OAuth 연동 ==========

export interface SaveAkademiyaUserParams {
  akademiyaUserId: number;
  akademiyaEmail: string | null;
  studentNo: string | null;
  password: string | null;
  role: number;
}

export async function saveAkademiyaUser({ akademiyaUserId, akademiyaEmail, studentNo, password, role }: SaveAkademiyaUserParams): Promise<void> {
  await pool.execute(
    `INSERT INTO gmc_users
       (akademiya_user_id, akademiya_email, student_no, password, role, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       akademiya_user_id = COALESCE(akademiya_user_id, VALUES(akademiya_user_id)),
       akademiya_email   = VALUES(akademiya_email),
       student_no        = COALESCE(VALUES(student_no), student_no),
       password          = COALESCE(VALUES(password), password),
       role              = VALUES(role),
       updated_at        = NOW()`,
    [akademiyaUserId, akademiyaEmail, studentNo || null, password || null, role ?? 0]
  );
}

export async function getByAkademiyaUserId(akademiyaUserId: number): Promise<GmcUserRow | null> {
  const [rows] = await pool.execute<GmcUserRow[]>(
    'SELECT * FROM gmc_users WHERE akademiya_user_id = ?',
    [akademiyaUserId]
  );
  return rows[0] ?? null;
}

export async function getByAkademiyaEmail(email: string): Promise<GmcUserRow | null> {
  const [rows] = await pool.execute<GmcUserRow[]>(
    'SELECT * FROM gmc_users WHERE akademiya_email = ?',
    [email]
  );
  return rows[0] ?? null;
}

// ── 권한(role) — 이메일(Akademiya 계정) 기준 ──────────────────────────────
// 학번은 재입력/변경될 수 있어 권한 키로 부적합(Akademiya 계정에서 권한이 정상
// 동작하지 않던 버그의 원인) → 불변에 가까운 Akademiya 이메일을 권한 조회/설정의
// 기준으로 사용한다. 학번은 통계 표시용으로만 별도 유지.
export async function getUserRoleByEmail(email: string | null | undefined): Promise<number> {
  if (!email) return 0;
  const [rows] = await pool.execute<RoleRow[]>(
    'SELECT COALESCE(role, 0) AS role FROM gmc_users WHERE akademiya_email = ?',
    [email]
  );
  return rows[0]?.role ?? 0;
}

export async function setUserRoleByEmail(email: string, role: number): Promise<void> {
  await pool.execute(
    `INSERT INTO gmc_users (akademiya_email, role, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE role = VALUES(role), updated_at = NOW()`,
    [email, role]
  );
}

export async function linkGoingHafsCredentials(akademiyaUserId: number, studentNo: string, password: string, role: number): Promise<void> {
  await pool.execute(
    `UPDATE gmc_users
     SET student_no = ?, password = ?, role = ?, updated_at = NOW()
     WHERE akademiya_user_id = ?`,
    [studentNo, password, role, akademiyaUserId]
  );
  const [res] = await pool.execute<ResultSetHeader>('SELECT ROW_COUNT() AS cnt');
  if ((res as unknown as { cnt: number }).cnt === 0) {
    await pool.execute(
      `INSERT INTO gmc_users (akademiya_user_id, student_no, password, role, updated_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [akademiyaUserId, studentNo, password, role]
    );
  }
}

// ========== 스케줄 ==========

export async function registerSchedule(
  time: string, date: string, sessionId: string, studentNo: string,
  timeCode: string, teacherId: string, reason: string
): Promise<void> {
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

export async function getScheduleAt(time: string, date: string): Promise<ScheduleRow | null> {
  const [rows] = await pool.execute<ScheduleRow[]>(
    'SELECT * FROM schedules WHERE time = ? AND date = ?',
    [time, date]
  );
  return rows[0] ?? null;
}

export async function getMySchedule(studentNo: string, date: string): Promise<ScheduleRow | null> {
  const [rows] = await pool.execute<ScheduleRow[]>(
    'SELECT * FROM schedules WHERE student_no = ? AND date = ? ORDER BY executed ASC, time ASC LIMIT 1',
    [studentNo, date]
  );
  return rows[0] ?? null;
}

export async function markScheduleExecuted(time: string, date: string, success: boolean, message: string): Promise<void> {
  await pool.execute(
    `UPDATE schedules
     SET executed = 1, result_ok = ?, result_msg = ?, executed_at = NOW()
     WHERE time = ? AND date = ?`,
    [success ? 1 : 0, message, time, date]
  );
}

// ========== 반복 등록 (자정 복사 대체) ==========
// 특정 '날짜'가 아니라 사용자별 '표준 반복 등록'(시간+야자코드+사유)을 저장한다.
// 신청 가능일(평일·공휴일·중단기간 아님) 여부는 매번 DB(공휴일 캐시/중단기간 테이블)로
// 그 자리에서 판단하며, 스케줄러가 자정에 다음날 행을 미리 만들어두지 않는다.

export async function upsertRecurringSchedule(
  studentNo: string, time: string, timeCode: string, teacherId: string, reason: string
): Promise<void> {
  await pool.execute(
    `INSERT INTO gmc_recurring_schedules (student_no, time, time_code, teacher_id, reason)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       time       = VALUES(time),
       time_code  = VALUES(time_code),
       teacher_id = VALUES(teacher_id),
       reason     = VALUES(reason),
       updated_at = NOW()`,
    [studentNo, time, timeCode, teacherId, reason || '']
  );
}

export async function getRecurringByStudent(studentNo: string): Promise<RecurringScheduleRow | null> {
  const [rows] = await pool.execute<RecurringScheduleRow[]>(
    'SELECT * FROM gmc_recurring_schedules WHERE student_no = ?',
    [studentNo]
  );
  return rows[0] ?? null;
}

export async function getRecurringByTime(time: string): Promise<RecurringScheduleRow | null> {
  const [rows] = await pool.execute<RecurringScheduleRow[]>(
    'SELECT * FROM gmc_recurring_schedules WHERE time = ?',
    [time]
  );
  return rows[0] ?? null;
}

export async function getAllRecurring(): Promise<RecurringScheduleRow[]> {
  const [rows] = await pool.execute<RecurringScheduleRow[]>('SELECT * FROM gmc_recurring_schedules');
  return rows;
}

export async function deleteRecurringByStudent(studentNo: string): Promise<{ changes: number }> {
  const [res] = await pool.execute<ResultSetHeader>(
    'DELETE FROM gmc_recurring_schedules WHERE student_no = ?',
    [studentNo]
  );
  return { changes: res.affectedRows };
}

// ========== 재시도 큐 ==========

export async function addRetry(
  retryAtMs: number, studentNo: string, timeCode: string, reason: string,
  applyDate: string, originTime: string, attempt = 1
): Promise<void> {
  await pool.execute(
    `INSERT INTO retries (retry_at, student_no, time_code, reason, apply_date, origin_time, attempt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [retryAtMs, studentNo, timeCode, reason || '', applyDate, originTime, attempt]
  );
}

export async function getDueRetry(): Promise<RetryRow | null> {
  const [rows] = await pool.execute<RetryRow[]>(
    'SELECT * FROM retries WHERE retry_at <= ? ORDER BY retry_at ASC LIMIT 1',
    [Date.now()]
  );
  return rows[0] ?? null;
}

export async function deleteRetry(id: number): Promise<void> {
  await pool.execute('DELETE FROM retries WHERE id = ?', [id]);
}

// ========== 통계 ==========

export function parseStudentNo(studentNo: string): ParsedStudentNo {
  const s = String(studentNo);
  if (s.length === 5) {
    return { grade: s[0], class: s.substring(1, 3), number: s.substring(3, 5) };
  }
  return { grade: '-', class: '-', number: '-' };
}

export async function recordUsage(
  studentNo: string, teacherId: string, timeCode: string,
  scheduleTime: string, applyDate: string, success: boolean, message: string
): Promise<void> {
  const { grade, class: cls, number } = parseStudentNo(studentNo);
  await pool.execute(
    `INSERT INTO usage_stats
       (student_no, grade, class, number, teacher_id, time_code, schedule_time, apply_date, success, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [studentNo, grade, cls, number, teacherId, timeCode, scheduleTime, applyDate, success ? 1 : 0, message || '']
  );
}

export async function getUsageStats(limit = 100): Promise<UsageStatRow[]> {
  const [rows] = await pool.execute<UsageStatRow[]>(
    'SELECT * FROM usage_stats ORDER BY id DESC LIMIT ?',
    [limit]
  );
  return rows;
}

export async function getUsageStatsByDate(date: string): Promise<UsageStatRow[]> {
  const [rows] = await pool.execute<UsageStatRow[]>(
    'SELECT * FROM usage_stats WHERE apply_date = ? ORDER BY id DESC',
    [date]
  );
  return rows;
}

export async function getUsageStatsByStudent(studentNo: string, limit = 20): Promise<UsageStatRow[]> {
  const [rows] = await pool.execute<UsageStatRow[]>(
    'SELECT * FROM usage_stats WHERE student_no = ? ORDER BY id DESC LIMIT ?',
    [studentNo, limit]
  );
  return rows;
}

export async function getUsageStatsSummary(): Promise<UsageStatRow[]> {
  const [rows] = await pool.execute<UsageStatRow[]>(`
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

export interface AdminStatsFilter {
  grade?: string | null;
  cls?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export async function getAdminStats({ grade, cls, dateFrom, dateTo }: AdminStatsFilter = {}): Promise<UsageStatRow[]> {
  const conditions: string[] = [];
  const params: string[] = [];
  if (grade)    { conditions.push('grade = ?');       params.push(grade); }
  if (cls)      { conditions.push('class = ?');       params.push(cls); }
  if (dateFrom) { conditions.push('apply_date >= ?'); params.push(dateFrom); }
  if (dateTo)   { conditions.push('apply_date <= ?'); params.push(dateTo); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute<UsageStatRow[]>(`SELECT * FROM usage_stats ${where} ORDER BY id DESC`, params);
  return rows;
}

export async function deleteFailedStats({ grade, cls, dateFrom, dateTo }: AdminStatsFilter = {}): Promise<number> {
  const conditions: string[] = ['success = 0'];
  const params: string[] = [];
  if (grade)    { conditions.push('grade = ?');       params.push(grade); }
  if (cls)      { conditions.push('class = ?');       params.push(cls); }
  if (dateFrom) { conditions.push('apply_date >= ?'); params.push(dateFrom); }
  if (dateTo)   { conditions.push('apply_date <= ?'); params.push(dateTo); }
  const [res] = await pool.execute<ResultSetHeader>(
    `DELETE FROM usage_stats WHERE ${conditions.join(' AND ')}`,
    params
  );
  return res.affectedRows;
}

// ========== 개인정보 처리방침 동의 ==========

export async function getPrivacyConsent(gmcUserId: number): Promise<number> {
  const [rows] = await pool.execute<ConsentRow[]>(
    'SELECT version FROM privacy_consents WHERE gmc_user_id = ?',
    [gmcUserId]
  );
  return rows[0]?.version ?? 0;
}

export async function savePrivacyConsent(gmcUserId: number, version: number): Promise<void> {
  await pool.execute(
    `INSERT INTO privacy_consents (gmc_user_id, version)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE version = VALUES(version), consented_at = NOW()`,
    [gmcUserId, version]
  );
}

// ========== 이용약관 동의 ==========

export async function getTermsConsent(gmcUserId: number): Promise<number> {
  const [rows] = await pool.execute<ConsentRow[]>(
    'SELECT version FROM terms_consents WHERE gmc_user_id = ?',
    [gmcUserId]
  );
  return rows[0]?.version ?? 0;
}

export async function saveTermsConsent(gmcUserId: number, version: number): Promise<void> {
  await pool.execute(
    `INSERT INTO terms_consents (gmc_user_id, version)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE version = VALUES(version), consented_at = NOW()`,
    [gmcUserId, version]
  );
}

// ========== 정기 정리 ==========

export async function cleanupOldSchedules(): Promise<number> {
  const [res] = await pool.execute<ResultSetHeader>(
    "DELETE FROM schedules WHERE date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)"
  );
  return res.affectedRows;
}

// ========== 백업 (JSON 내보내기) ==========

export async function backupDb(destPath: string): Promise<void> {
  const [rows] = await pool.execute<UsageStatRow[]>('SELECT * FROM usage_stats ORDER BY id');
  const { writeFileSync } = await import('fs');
  writeFileSync(destPath, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`[백업] JSON 백업 완료: ${destPath}`);
}

// ========== GMC PASS 중단 기간 ==========

export async function getSuspendPeriods(): Promise<SuspendPeriodRow[]> {
  const [rows] = await pool.execute<SuspendPeriodRow[]>(
    'SELECT * FROM gmc_suspend_periods ORDER BY start_date ASC'
  );
  return rows;
}

export async function addSuspendPeriod(startDate: string, endDate: string): Promise<void> {
  await pool.execute(
    'INSERT INTO gmc_suspend_periods (start_date, end_date) VALUES (?, ?)',
    [startDate, endDate]
  );
}

export async function deleteSuspendPeriod(id: number): Promise<void> {
  await pool.execute('DELETE FROM gmc_suspend_periods WHERE id = ?', [id]);
}

export async function getActiveSuspendPeriodForDate(dateStr: string): Promise<SuspendPeriodRow | null> {
  const [rows] = await pool.execute<SuspendPeriodRow[]>(
    'SELECT * FROM gmc_suspend_periods WHERE start_date <= ? AND end_date >= ? ORDER BY end_date DESC LIMIT 1',
    [dateStr, dateStr]
  );
  return rows[0] ?? null;
}

// ========== 푸시 구독 ==========

export async function savePushSubscription(
  gmcUserId: number, endpoint: string, p256dh: string, authKey: string
): Promise<void> {
  await pool.execute(
    `INSERT INTO push_subscriptions (gmc_user_id, endpoint, p256dh, auth_key)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       endpoint   = VALUES(endpoint),
       p256dh     = VALUES(p256dh),
       auth_key   = VALUES(auth_key),
       updated_at = NOW()`,
    [gmcUserId, endpoint, p256dh, authKey]
  );
}

export async function deletePushSubscription(gmcUserId: number): Promise<void> {
  await pool.execute('DELETE FROM push_subscriptions WHERE gmc_user_id = ?', [gmcUserId]);
}

export async function deletePushSubscriptionByStudentNo(studentNo: string): Promise<void> {
  await pool.execute(
    `DELETE ps FROM push_subscriptions ps
     JOIN gmc_users gu ON ps.gmc_user_id = gu.id
     WHERE gu.student_no = ?`,
    [studentNo]
  );
}

export async function getPushSubscriptionByStudentNo(studentNo: string): Promise<PushSubscriptionRow | null> {
  const [rows] = await pool.execute<PushSubscriptionRow[]>(
    `SELECT ps.id, ps.gmc_user_id, ps.endpoint, ps.p256dh, ps.auth_key
     FROM push_subscriptions ps
     JOIN gmc_users gu ON ps.gmc_user_id = gu.id
     WHERE gu.student_no = ?`,
    [studentNo]
  );
  return rows[0] ?? null;
}

// __dirname 불필요하지만 backup 경로를 위해 export
export const serverDir = dirname(fileURLToPath(import.meta.url));
void mkdirSync; // suppress unused import warning
