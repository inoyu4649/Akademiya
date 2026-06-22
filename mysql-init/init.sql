-- Akademiya 통합 MySQL 초기화 스크립트
-- 실행 시점: mysql 컨테이너 최초 생성 시 (docker-entrypoint-initdb.d)
-- MYSQL_DATABASE=akademiya 는 컨테이너가 자동 생성.
-- gmcauto DB는 여기서 직접 생성.

CREATE DATABASE IF NOT EXISTS `gmcauto`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

GRANT ALL PRIVILEGES ON `akademiya`.* TO 'akademiya_app'@'%';
GRANT ALL PRIVILEGES ON `gmcauto`.*   TO 'akademiya_app'@'%';
FLUSH PRIVILEGES;
