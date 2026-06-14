-- ============================================================
-- 국외 이전 동의 (개인정보 보호법 제28조의8) — 개인정보 처리방침 동의와 별도 수집
-- ============================================================
CREATE TABLE IF NOT EXISTS intl_transfer_consents (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  service      VARCHAR(20) NOT NULL DEFAULT 'akademiya',
  version      INT NOT NULL,
  consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
