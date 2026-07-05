#!/usr/bin/env bash
# ============================================================
#  migrate-to-unified-mysql.sh
#  호스트 MySQL → Akademiya 통합 mysql 도커 컨테이너 마이그레이션
#
#  대상 DB: akademiya (호스트 MySQL → mysql 컨테이너)
#  제외:    akashaalt (완전 독립 스키마, 이 스크립트로 마이그레이션하지 않음 — DEPLOYMENT.md 10-4 참조)
#           gmcauto   (완전 독립 스키마, 별도 컨테이너/DB이므로 이 스크립트 대상 아님)
#
#  사용법:
#    chmod +x scripts/migrate-to-unified-mysql.sh
#    ./scripts/migrate-to-unified-mysql.sh [옵션]
#
#  환경변수로 덮어쓰기 가능:
#    SRC_HOST, SRC_PORT, SRC_USER, SRC_PASS
#    CONTAINER (docker container 이름)
#    MYSQL_ROOT_PASSWORD, MYSQL_APP_USER, MYSQL_APP_PASSWORD
# ============================================================

set -euo pipefail

# ── 색상 출력 헬퍼 ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── 설정 ────────────────────────────────────────────────────────────────────
# 소스 (호스트 MySQL)
SRC_HOST="${SRC_HOST:-localhost}"
SRC_PORT="${SRC_PORT:-3306}"
SRC_USER="${SRC_USER:-root}"
SRC_PASS="${SRC_PASS:-}"

# 대상 (Docker 컨테이너)
CONTAINER="${CONTAINER:-akademiya-mysql-1}"

# docker-compose .env에서 읽기 (파일 있는 경우)
if [[ -f "$(dirname "$0")/../.env" ]]; then
  # shellcheck disable=SC1090
  source "$(dirname "$0")/../.env"
fi
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
MYSQL_APP_USER="${MYSQL_APP_USER:-akademiya_app}"
MYSQL_APP_PASSWORD="${MYSQL_APP_PASSWORD:-}"

DUMP_DIR="/tmp/akademiya_migration_$(date +%Y%m%d_%H%M%S)"
DUMP_FILE="$DUMP_DIR/akademiya.sql"

# ── 전제 조건 확인 ──────────────────────────────────────────────────────────
info "전제 조건 확인 중..."

command -v docker     >/dev/null 2>&1 || die "docker가 설치되어 있지 않습니다."
command -v mysqldump  >/dev/null 2>&1 || die "mysqldump가 설치되어 있지 않습니다 (mysql-client 패키지 필요)."
command -v mysql      >/dev/null 2>&1 || die "mysql 클라이언트가 설치되어 있지 않습니다."

[[ -z "$MYSQL_ROOT_PASSWORD" ]] && die "MYSQL_ROOT_PASSWORD가 설정되어 있지 않습니다. .env 파일을 확인하세요."

# 컨테이너 실행 중인지 확인
docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q "true" \
  || die "컨테이너 '$CONTAINER'가 실행 중이지 않습니다. 'docker compose up -d mysql' 먼저 실행하세요."

# 컨테이너 MySQL 헬스 확인
info "mysql 컨테이너 헬스 확인 중..."
for i in {1..12}; do
  if docker exec "$CONTAINER" mysqladmin ping -u root \
       --password="$MYSQL_ROOT_PASSWORD" --silent 2>/dev/null; then
    break
  fi
  [[ $i -eq 12 ]] && die "mysql 컨테이너가 30초 내 응답하지 않습니다."
  warn "대기 중... ($i/12)"
  sleep 5
done
info "mysql 컨테이너 정상"

# ── 소스 DB 접속 테스트 ─────────────────────────────────────────────────────
info "소스 MySQL($SRC_HOST:$SRC_PORT) 접속 테스트..."
MYSQL_OPTS=(-h "$SRC_HOST" -P "$SRC_PORT" -u "$SRC_USER")
[[ -n "$SRC_PASS" ]] && MYSQL_OPTS+=("--password=$SRC_PASS")

mysql "${MYSQL_OPTS[@]}" -e "SELECT 1" >/dev/null 2>&1 \
  || die "소스 MySQL에 접속할 수 없습니다. SRC_HOST, SRC_USER, SRC_PASS를 확인하세요."
info "소스 MySQL 접속 성공"

# ── akademiya DB 존재 확인 ──────────────────────────────────────────────────
AKADEMIYA_EXISTS=$(mysql "${MYSQL_OPTS[@]}" -N -e \
  "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='akademiya';" 2>/dev/null)
[[ "$AKADEMIYA_EXISTS" == "1" ]] || die "소스 MySQL에 'akademiya' 데이터베이스가 없습니다."

# ── 소스 행 수 스냅샷 ───────────────────────────────────────────────────────
info "소스 DB 행 수 스냅샷..."
mkdir -p "$DUMP_DIR"

SRC_COUNTS=$(mysql "${MYSQL_OPTS[@]}" akademiya -N 2>/dev/null <<'EOF'
SELECT
  TABLE_NAME,
  TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'akademiya'
  AND TABLE_TYPE   = 'BASE TABLE'
ORDER BY TABLE_NAME;
EOF
)

echo "=== 소스 행 수 ===" > "$DUMP_DIR/row_counts.txt"
echo "$SRC_COUNTS" >> "$DUMP_DIR/row_counts.txt"
echo "$SRC_COUNTS"

# ── 덤프 ────────────────────────────────────────────────────────────────────
info "akademiya 덤프 중 → $DUMP_FILE"
DUMP_OPTS=("${MYSQL_OPTS[@]}"
  --single-transaction
  --routines
  --triggers
  --events
  --set-gtid-purged=OFF
  --column-statistics=0
)

mysqldump "${DUMP_OPTS[@]}" akademiya > "$DUMP_FILE" \
  || die "mysqldump 실패"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
info "덤프 완료 ($DUMP_SIZE): $DUMP_FILE"

# ── 대상 컨테이너에 복원 ────────────────────────────────────────────────────
info "mysql 컨테이너에 akademiya 복원 중..."

# 기존 akademiya DB 초기화 (재마이그레이션 시 중복 방지)
docker exec -i "$CONTAINER" mysql \
  -u root --password="$MYSQL_ROOT_PASSWORD" \
  -e "DROP DATABASE IF EXISTS \`akademiya\`;
      CREATE DATABASE \`akademiya\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
  2>/dev/null

# 복원
docker exec -i "$CONTAINER" mysql \
  -u root --password="$MYSQL_ROOT_PASSWORD" akademiya \
  < "$DUMP_FILE" \
  || die "복원 실패"

info "복원 완료"

# ── 권한 재설정 ──────────────────────────────────────────────────────────────
info "앱 유저 권한 재설정 중..."
docker exec -i "$CONTAINER" mysql \
  -u root --password="$MYSQL_ROOT_PASSWORD" << SQL
GRANT ALL PRIVILEGES ON \`akademiya\`.*  TO '${MYSQL_APP_USER}'@'%';
GRANT ALL PRIVILEGES ON \`akashaalt\`.*  TO '${MYSQL_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL
info "권한 설정 완료"

# ── 행 수 검증 ──────────────────────────────────────────────────────────────
info "행 수 검증 중..."

DST_COUNTS=$(docker exec -i "$CONTAINER" mysql \
  -u root --password="$MYSQL_ROOT_PASSWORD" -N akademiya 2>/dev/null <<'EOF'
SELECT
  TABLE_NAME,
  TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'akademiya'
  AND TABLE_TYPE   = 'BASE TABLE'
ORDER BY TABLE_NAME;
EOF
)

echo "=== 대상 행 수 ===" >> "$DUMP_DIR/row_counts.txt"
echo "$DST_COUNTS" >> "$DUMP_DIR/row_counts.txt"

# 소스 vs 대상 비교
MISMATCH=0
while IFS=$'\t' read -r tbl src_rows; do
  dst_rows=$(echo "$DST_COUNTS" | awk -v t="$tbl" '$1==t{print $2}')
  # TABLE_ROWS는 InnoDB 추정치이므로 ±10% 허용
  if [[ -z "$dst_rows" ]]; then
    warn "테이블 $tbl: 대상에서 찾을 수 없음"
    MISMATCH=1
  else
    # 숫자 비교 (추정치이므로 0이면 스킵)
    if [[ "$src_rows" -gt 100 && "$dst_rows" -eq 0 ]]; then
      warn "테이블 $tbl: 소스=$src_rows 행, 대상=$dst_rows 행 (불일치 가능성)"
      MISMATCH=1
    else
      info "  $tbl: 소스≈$src_rows 행, 대상≈$dst_rows 행 ✓"
    fi
  fi
done <<< "$SRC_COUNTS"

echo ""
echo "=== 검증 리포트 ===" >> "$DUMP_DIR/row_counts.txt"
echo "덤프 위치: $DUMP_FILE" >> "$DUMP_DIR/row_counts.txt"

if [[ $MISMATCH -eq 1 ]]; then
  warn "일부 테이블에서 행 수 차이가 감지되었습니다."
  warn "InnoDB 추정치 오차일 수 있습니다. 직접 COUNT(*) 쿼리로 확인하세요:"
  warn "  docker exec $CONTAINER mysql -u root --password=\$MYSQL_ROOT_PASSWORD -e 'SELECT COUNT(*) FROM akademiya.users;'"
else
  info "행 수 검증 통과 ✓"
fi

# ── 완료 ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  마이그레이션 완료!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo "  덤프 파일: $DUMP_FILE"
echo "  리포트:    $DUMP_DIR/row_counts.txt"
echo ""
echo "  다음 단계:"
echo "  1. backend/.env 에서 DB_HOST=mysql 확인"
echo "  2. akashaalt/.env 에서 AKASHAALT_DB_HOST/USER/PASSWORD/NAME 확인"
echo "  3. docker compose up -d --build"
echo "  4. 서비스 정상 동작 확인 후 호스트 MySQL 백업"
echo ""
echo "  롤백 방법 (문제 발생 시):"
echo "  - docker-compose.yml 의 backend.environment 에서"
echo "    DB_HOST 를 호스트 주소로 되돌리고"
echo "  - extra_hosts: host.docker.internal:host-gateway 복원"
echo "  - docker compose up -d backend"
echo ""
