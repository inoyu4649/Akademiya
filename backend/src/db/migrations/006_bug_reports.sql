-- Phase 7: bug_reports 테이블
CREATE TABLE IF NOT EXISTS bug_reports (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(300) NOT NULL,
  body        TEXT NOT NULL,
  browser     VARCHAR(200),
  os          VARCHAR(200),
  status      ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  admin_note  TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
