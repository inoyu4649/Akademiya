-- 개인정보 처리방침 동의 이력 테이블
-- version 컬럼: 동의한 처리방침 버전 번호 (1부터 시작, 버전 업 시 재동의)
CREATE TABLE IF NOT EXISTS privacy_consents (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  service      VARCHAR(20) NOT NULL DEFAULT 'akademiya',
  version      INT NOT NULL,
  consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
