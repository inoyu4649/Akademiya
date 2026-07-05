#!/bin/bash
# mysql 컨테이너 최초 생성 시 실행 (docker-entrypoint-initdb.d) — 컨테이너 "내부"에서 실행되므로
# docker-compose.yml의 mysql 서비스 environment 블록에 실제로 존재하는 이름(MYSQL_USER/MYSQL_PASSWORD)만
# 참조할 수 있다. MYSQL_APP_USER/MYSQL_APP_PASSWORD는 호스트 쪽 .env/compose 변수 치환용 이름이라
# 컨테이너 안에서는 존재하지 않는 변수 — 예전에 이 스크립트가 그 이름을 잘못 참조해 GRANT 문의 대상이
# 빈 문자열('@'%')이 되어 "ERROR 1410: not allowed to create a user with GRANT"로 실패했었음.
# MYSQL_DATABASE=akademiya 는 컨테이너가 자동 생성.
# gmcauto/akashaalt DB 생성 및 앱 유저 권한 부여 (둘 다 Akademiya 본체와 분리된 독립 스키마).

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`gmcauto\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS \`akashaalt\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON \`akademiya\`.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON \`gmcauto\`.*   TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON \`akashaalt\`.* TO '${MYSQL_USER}'@'%';
FLUSH PRIVILEGES;
SQL
