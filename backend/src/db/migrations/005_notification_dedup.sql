-- Phase 6: 알림 중복 방지 테이블
-- 마감 알림이 동일 과제/사용자/유형 조합으로 재발송되지 않도록 방지
USE akademiya;

CREATE TABLE IF NOT EXISTS notification_dedup (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  type          ENUM('deadline_1d','deadline_3h','deadline_1h','deadline_10m') NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dedup (assignment_id, user_id, type),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
);
