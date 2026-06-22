#!/bin/bash
# mysql 컨테이너 최초 생성 시 실행 (docker-entrypoint-initdb.d)
# MYSQL_DATABASE=akademiya 는 컨테이너가 자동 생성.
# gmcauto DB 생성 및 앱 유저 권한 부여.

mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS \`gmcauto\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON \`akademiya\`.* TO '${MYSQL_APP_USER}'@'%';
GRANT ALL PRIVILEGES ON \`gmcauto\`.*   TO '${MYSQL_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL
