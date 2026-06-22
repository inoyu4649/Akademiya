-- Akademiya 통합 MySQL 초기화 스크립트
-- 실행 시점: mysql 컨테이너 최초 생성 시 (docker-entrypoint-initdb.d)
-- MYSQL_DATABASE=akademiya 는 컨테이너가 자동 생성.
-- 앱 유저에게 akademiya DB 접근 허용.

GRANT ALL PRIVILEGES ON `akademiya`.* TO 'akademiya_app'@'%';
FLUSH PRIVILEGES;
