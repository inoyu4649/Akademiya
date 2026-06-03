#!/usr/bin/env node
/**
 * GMCAuto SQLite → MySQL 마이그레이션 스크립트
 *
 * 사용법:
 *   node scripts/migrate-sqlite-to-mysql.js [SQLite 파일 경로]
 *
 * 예시:
 *   node scripts/migrate-sqlite-to-mysql.js ./data/gmcauto.db
 *   node scripts/migrate-sqlite-to-mysql.js /old/data/gmcauto.db
 *
 * 환경변수 (MySQL 연결 정보):
 *   GMC_DB_HOST, GMC_DB_PORT, GMC_DB_USER, GMC_DB_PASSWORD, GMC_DB_NAME
 *   → .env 파일이 있으면 자동으로 로드됩니다.
 *
 * 주의:
 *   - 이 스크립트는 MySQL에 이미 테이블이 생성된 상태에서 실행하세요.
 *     (서버 1회 기동 후 initDb() 호출로 테이블 자동 생성)
 *   - ON DUPLICATE KEY UPDATE를 사용하므로 중복 실행해도 안전합니다.
 *   - better-sqlite3 패키지가 필요합니다:
 *       npm install --no-save better-sqlite3
 */

import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── .env 파일 로드 (dotenv 없이 직접 파싱) ────────────────────────────────
function loadEnv(envPath) {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // 주석 제거 (# 이후)
    const commentIdx = val.indexOf(' #');
    if (commentIdx >= 0) val = val.slice(0, commentIdx).trim();
    // 따옴표 제거
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const envFile = resolve(__dirname, '../.env');
loadEnv(envFile);

// ── host.docker.internal → localhost 자동 변환 ────────────────────────────
// 이 스크립트는 호스트에서 직접 실행. 컨테이너 내부 주소는 해석 불가.
if (
  process.env.GMC_DB_HOST === 'host.docker.internal' ||
  process.env.GMC_DB_HOST === undefined
) {
  process.env.GMC_DB_HOST = '127.0.0.1';
  console.warn('⚠️  GMC_DB_HOST=host.docker.internal → 127.0.0.1 으로 자동 변환 (호스트 실행 모드)');
  console.warn('   다른 호스트를 사용하려면: GMC_DB_HOST=<IP> node scripts/migrate-sqlite-to-mysql.js\n');
}

// ── 인수 파싱 ─────────────────────────────────────────────────────────────
const sqlitePath = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '../data/gmcauto.db');

if (!existsSync(sqlitePath)) {
  console.error(`❌ SQLite 파일을 찾을 수 없습니다: ${sqlitePath}`);
  console.error('   사용법: node scripts/migrate-sqlite-to-mysql.js [SQLite 파일 경로]');
  process.exit(1);
}

// ── better-sqlite3 동적 로드 ──────────────────────────────────────────────
const require = createRequire(import.meta.url);
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('❌ better-sqlite3 패키지가 필요합니다.');
  console.error('   npm install --no-save better-sqlite3');
  process.exit(1);
}

// ── MySQL 연결 ────────────────────────────────────────────────────────────
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:             process.env.GMC_DB_HOST     || 'localhost',
  port:             parseInt(process.env.GMC_DB_PORT || '3306', 10),
  user:             process.env.GMC_DB_USER     || 'gmcauto',
  password:         process.env.GMC_DB_PASSWORD || '',
  database:         process.env.GMC_DB_NAME     || 'gmcauto',
  waitForConnections: true,
  connectionLimit:  5,
  charset:          'utf8mb4',
  timezone:         '+09:00',
});

// ── 헬퍼: SQLite 타임스탬프 → MySQL DATETIME 문자열 ──────────────────────
// SQLite는 세 가지 형식 혼용:
//   1. 정수 ms  (e.g. 1716796800000)
//   2. 정수 s   (e.g. 1716796800)
//   3. 텍스트   (e.g. "2026-05-27 09:00:00", "2026-05-27T09:00:00.000Z")
function tsToDatetime(ts) {
  if (ts === null || ts === undefined || ts === '') return null;

  // 문자열 형식 처리
  if (typeof ts === 'string') {
    // 이미 MySQL DATETIME 형식 "YYYY-MM-DD HH:MM:SS"
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) return ts;
    // ISO 8601 등 파싱 가능한 형식
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
    // 숫자 문자열 (정수 timestamp)
    const n = Number(ts);
    if (!isNaN(n)) return tsToDatetime(n);
    return null;
  }

  // 숫자: 1e12(=2001-09-09) 이상이면 ms, 미만이면 s
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ── 헬퍼: 학번으로 학년/반/번호 파싱 ─────────────────────────────────────
function parseStudentNo(studentNo) {
  const s = String(studentNo || '');
  if (s.length === 5) {
    return { grade: s[0], cls: s.substring(1, 3), number: s.substring(3, 5) };
  }
  return { grade: '-', cls: '-', number: '-' };
}

// ── 마이그레이션 메인 ─────────────────────────────────────────────────────
async function migrate() {
  console.log('──────────────────────────────────────────────────────');
  console.log('  GMCAuto SQLite → MySQL 마이그레이션');
  console.log('──────────────────────────────────────────────────────');
  console.log(`  SQLite: ${sqlitePath}`);
  console.log(`  MySQL:  ${process.env.GMC_DB_USER}@${process.env.GMC_DB_HOST}:${process.env.GMC_DB_PORT || 3306}/${process.env.GMC_DB_NAME}`);
  console.log('──────────────────────────────────────────────────────\n');

  const sqlite = new Database(sqlitePath, { readonly: true });

  // SQLite에 어떤 테이블이 있는지 확인
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  console.log(`📋 SQLite 테이블: ${tables.join(', ') || '(없음)'}\n`);

  let totalMigrated = 0;

  // ── 1. credentials → gmc_users ────────────────────────────────────────
  if (tables.includes('credentials')) {
    const rows = sqlite.prepare('SELECT * FROM credentials').all();
    console.log(`👤 credentials: ${rows.length}개 행 발견`);

    let ok = 0, skip = 0;
    for (const row of rows) {
      try {
        const role = typeof row.role === 'number' ? row.role : 0;
        await pool.execute(
          `INSERT INTO gmc_users (student_no, password, role)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             password   = VALUES(password),
             role       = VALUES(role),
             updated_at = NOW()`,
          [row.student_no, row.password || '', role]
        );
        ok++;
      } catch (e) {
        console.warn(`   ⚠️  student_no=${row.student_no} 스킵: ${e.message}`);
        skip++;
      }
    }
    console.log(`   ✅ 완료: ${ok}개 삽입/업데이트, ${skip}개 스킵\n`);
    totalMigrated += ok;
  } else {
    console.log('⚠️  credentials 테이블 없음 (건너뜀)\n');
  }

  // ── 2. schedules → schedules ──────────────────────────────────────────
  if (tables.includes('schedules')) {
    const rows = sqlite.prepare('SELECT * FROM schedules').all();
    console.log(`📅 schedules: ${rows.length}개 행 발견`);

    // 컬럼 목록 확인 (버전에 따라 다를 수 있음)
    const cols = sqlite.prepare("PRAGMA table_info(schedules)").all().map(c => c.name);

    let ok = 0, skip = 0;
    for (const row of rows) {
      try {
        const registeredAt = cols.includes('registered_at')
          ? tsToDatetime(row.registered_at) || new Date().toISOString().slice(0,19).replace('T',' ')
          : new Date().toISOString().slice(0,19).replace('T',' ');
        const executedAt = cols.includes('executed_at') ? tsToDatetime(row.executed_at) : null;
        const executed   = row.executed ? 1 : 0;
        const resultOk   = row.result_ok != null ? (row.result_ok ? 1 : 0) : null;
        const resultMsg  = row.result_msg || null;

        await pool.execute(
          `INSERT INTO schedules
             (time, date, session_id, student_no, time_code, teacher_id,
              reason, executed, result_ok, result_msg, registered_at, executed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             session_id    = VALUES(session_id),
             student_no    = VALUES(student_no),
             time_code     = VALUES(time_code),
             teacher_id    = VALUES(teacher_id),
             reason        = VALUES(reason),
             executed      = VALUES(executed),
             result_ok     = VALUES(result_ok),
             result_msg    = VALUES(result_msg),
             registered_at = VALUES(registered_at),
             executed_at   = VALUES(executed_at)`,
          [
            row.time, row.date, row.session_id || '', row.student_no,
            row.time_code, row.teacher_id, row.reason || '',
            executed, resultOk, resultMsg, registeredAt, executedAt
          ]
        );
        ok++;
      } catch (e) {
        console.warn(`   ⚠️  schedules(${row.time}, ${row.date}) 스킵: ${e.message}`);
        skip++;
      }
    }
    console.log(`   ✅ 완료: ${ok}개 삽입/업데이트, ${skip}개 스킵\n`);
    totalMigrated += ok;
  } else {
    console.log('⚠️  schedules 테이블 없음 (건너뜀)\n');
  }

  // ── 3. usage_stats → usage_stats ──────────────────────────────────────
  if (tables.includes('usage_stats')) {
    const rows = sqlite.prepare('SELECT * FROM usage_stats ORDER BY id ASC').all();
    console.log(`📊 usage_stats: ${rows.length}개 행 발견`);

    const cols = sqlite.prepare("PRAGMA table_info(usage_stats)").all().map(c => c.name);

    let ok = 0, skip = 0;
    for (const row of rows) {
      try {
        // grade/class/number가 없는 구버전은 student_no에서 파싱
        let grade  = row.grade;
        let cls    = row.class;
        let number = row.number;
        if (!grade || grade === '-') {
          const parsed = parseStudentNo(row.student_no);
          grade  = parsed.grade;
          cls    = parsed.cls;
          number = parsed.number;
        }

        const createdAt = cols.includes('created_at')
          ? tsToDatetime(row.created_at) || new Date().toISOString().slice(0,19).replace('T',' ')
          : new Date().toISOString().slice(0,19).replace('T',' ');

        // id는 AUTO_INCREMENT이므로 명시하지 않음 (중복 방지를 위해 IGNORE)
        await pool.execute(
          `INSERT IGNORE INTO usage_stats
             (student_no, grade, class, number, teacher_id, time_code,
              schedule_time, apply_date, success, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.student_no, grade, cls, number,
            row.teacher_id, row.time_code, row.schedule_time,
            row.apply_date, row.success ? 1 : 0,
            row.message || null, createdAt
          ]
        );
        ok++;
      } catch (e) {
        console.warn(`   ⚠️  usage_stats(id=${row.id}) 스킵: ${e.message}`);
        skip++;
      }
    }
    console.log(`   ✅ 완료: ${ok}개 삽입, ${skip}개 스킵\n`);
    totalMigrated += ok;
  } else {
    console.log('⚠️  usage_stats 테이블 없음 (건너뜀)\n');
  }

  // ── 완료 ──────────────────────────────────────────────────────────────
  sqlite.close();
  await pool.end();

  console.log('──────────────────────────────────────────────────────');
  console.log(`🎉 마이그레이션 완료! 총 ${totalMigrated}개 행 이전`);
  console.log('──────────────────────────────────────────────────────');
}

migrate().catch(err => {
  console.error('\n❌ 마이그레이션 오류:', err.message);
  process.exit(1);
});
