// GMCAuto 3 최초 1회 마이그레이션 스크립트
//
// 대상: 기존 GMCAuto 2 DB(`gmcauto`, LEGACY_GMC_DB_* 환경변수로 접속)에서
//       2026년 6월 17일 신청 결과가 "성공"인 사용자의 credentials + 그날의 신청 내역만
//       새 DB(`gmcauto3`, GMC_DB_* 환경변수 — server/db.ts의 pool과 동일)로 이식한다.
//
// 실행: tsx scripts/migrate-legacy-2026-06-17.ts
//       (서버와 동일한 환경변수가 필요 — Docker 컨테이너 안에서 실행하거나 로컬에 동일하게 export)
//
// 재실행 안전성: credentials는 student_no UNIQUE 제약으로 INSERT IGNORE, usage_stats는
// (student_no, apply_date, schedule_time) 중복 여부를 먼저 조회해 있으면 건너뛴다.

import mysql, { RowDataPacket } from 'mysql2/promise';
import { initDb, pool as newPool } from '../server/db.js';

const TARGET_DATE = '2026-06-17';

const legacyPool = mysql.createPool({
  host:     process.env.LEGACY_GMC_DB_HOST || 'localhost',
  port:     parseInt(process.env.LEGACY_GMC_DB_PORT || '3306', 10),
  user:     process.env.LEGACY_GMC_DB_USER || 'gmcauto',
  password: process.env.LEGACY_GMC_DB_PASSWORD || '',
  database: process.env.LEGACY_GMC_DB_NAME || 'gmcauto',
  charset:  'utf8mb4',
  timezone: '+09:00',
});

interface LegacyUserRow extends RowDataPacket {
  student_no: string;
  password: string;
}

interface LegacyUsageRow extends RowDataPacket {
  student_no: string;
  grade: string;
  class: string;
  number: string;
  teacher_id: string;
  time_code: string;
  schedule_time: string;
  apply_date: string;
  success: number;
  message: string | null;
}

async function main(): Promise<void> {
  await initDb(); // 새 DB(gmcauto3)에 테이블이 없으면 생성

  const [successRows] = await legacyPool.query<RowDataPacket[]>(
    'SELECT DISTINCT student_no FROM usage_stats WHERE apply_date = ? AND success = 1',
    [TARGET_DATE]
  );
  const studentNos = successRows.map(r => r.student_no as string);
  console.log(`[마이그레이션] ${TARGET_DATE} 신청 성공자: ${studentNos.length}명`);

  let migratedCred = 0, skippedCred = 0, migratedUsage = 0, skippedUsage = 0;

  for (const studentNo of studentNos) {
    const [userRows] = await legacyPool.query<LegacyUserRow[]>(
      'SELECT student_no, password FROM gmc_users WHERE student_no = ?',
      [studentNo]
    );
    const legacyUser = userRows[0];
    if (legacyUser?.password) {
      const [res] = await newPool.execute(
        'INSERT IGNORE INTO gmc_users (student_no, password) VALUES (?, ?)',
        [legacyUser.student_no, legacyUser.password]
      );
      const affected = (res as unknown as { affectedRows: number }).affectedRows;
      if (affected > 0) migratedCred++; else skippedCred++;
    }

    const [usageRows] = await legacyPool.query<LegacyUsageRow[]>(
      'SELECT * FROM usage_stats WHERE student_no = ? AND apply_date = ?',
      [studentNo, TARGET_DATE]
    );
    for (const u of usageRows) {
      const [existing] = await newPool.execute<RowDataPacket[]>(
        'SELECT id FROM usage_stats WHERE student_no = ? AND apply_date = ? AND schedule_time = ?',
        [u.student_no, u.apply_date, u.schedule_time]
      );
      if (existing.length > 0) { skippedUsage++; continue; }

      await newPool.execute(
        `INSERT INTO usage_stats
           (student_no, grade, class, number, teacher_id, time_code, schedule_time, apply_date, success, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.student_no, u.grade, u.class, u.number, u.teacher_id, u.time_code, u.schedule_time, u.apply_date, u.success, u.message]
      );
      migratedUsage++;
    }
  }

  console.log(`[마이그레이션 완료] credentials 이식 ${migratedCred}건 (기존 존재 ${skippedCred}건 건너뜀)`);
  console.log(`[마이그레이션 완료] 신청내역 이식 ${migratedUsage}건 (기존 존재 ${skippedUsage}건 건너뜀)`);

  await legacyPool.end();
  await newPool.end();
}

main().catch(err => {
  console.error('[마이그레이션 실패]', err);
  process.exitCode = 1;
});
