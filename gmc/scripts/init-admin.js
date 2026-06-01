/**
 * 서버 첫 실행용 초기화 스크립트
 * '10316' 계정을 권한 3(관리자)으로 설정합니다.
 *
 * 사용법 (프로젝트 루트에서):
 *   node scripts/init-admin.js
 *
 * Linux/서버에서는 쉘 스크립트도 사용 가능:
 *   bash scripts/init-admin.sh
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'gmcauto.db');

if (!existsSync(DB_PATH)) {
  console.error(`[init-admin] ❌ DB 파일 없음: ${DB_PATH}`);
  console.error('  서버를 한 번 실행해 DB를 먼저 생성하세요.');
  process.exit(1);
}

const SQL = `
  INSERT INTO credentials (student_no, password, role, updated_at)
  VALUES ('10316', '', 3, datetime('now', 'localtime'))
  ON CONFLICT(student_no) DO UPDATE
    SET role = 3,
        updated_at = datetime('now', 'localtime');
`;

try {
  execSync(`sqlite3 "${DB_PATH}" "${SQL.replace(/\n/g, ' ').trim()}"`, { stdio: 'inherit' });
  const result = execSync(`sqlite3 "${DB_PATH}" "SELECT student_no, role FROM credentials WHERE student_no = '10316';"`)
    .toString().trim();
  console.log('[init-admin] ✅ 완료:', result);
} catch (err) {
  console.error('[init-admin] ❌ sqlite3 실행 실패:', err.message);
  console.error('  sqlite3가 설치되어 있는지 확인하세요. (sudo apt install sqlite3)');
  process.exit(1);
}
