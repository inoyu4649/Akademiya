#!/bin/bash
# 서버 첫 실행용 초기화 스크립트
# '10316' 계정을 권한 3(관리자)으로 설정합니다.
#
# 사용법 (프로젝트 루트에서):
#   bash scripts/init-admin.sh
#
# sqlite3가 없으면: sudo apt install sqlite3

DB_PATH="$(dirname "$0")/../data/gmcauto.db"

if [ ! -f "$DB_PATH" ]; then
  echo "[init-admin] ❌ DB 파일 없음: $DB_PATH"
  echo "  서버를 한 번 실행해 DB를 먼저 생성하세요."
  exit 1
fi

sqlite3 "$DB_PATH" "
  INSERT INTO credentials (student_no, password, role, updated_at)
  VALUES ('10316', '', 3, datetime('now', 'localtime'))
  ON CONFLICT(student_no) DO UPDATE
    SET role = 3,
        updated_at = datetime('now', 'localtime');
"

echo "[init-admin] ✅ 완료"
sqlite3 "$DB_PATH" "SELECT student_no, role FROM credentials WHERE student_no = '10316';"
