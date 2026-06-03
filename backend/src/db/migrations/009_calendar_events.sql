-- 009_calendar_events.sql
-- 조직/반 일정 이벤트 테이블
USE akademiya;

CREATE TABLE IF NOT EXISTS calendar_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scope_type  ENUM('org', 'class') NOT NULL,
  scope_id    INT UNSIGNED NOT NULL,
  creator_id  INT UNSIGNED,
  title       VARCHAR(300) NOT NULL,
  event_date  DATE NOT NULL,
  description TEXT,
  color       VARCHAR(20) NOT NULL DEFAULT '#4f7cff',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scope (scope_type, scope_id),
  INDEX idx_date  (event_date),
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
