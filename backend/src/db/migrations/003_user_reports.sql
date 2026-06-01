-- Phase 4: user_reports, report_escalations + users ban columns

-- Ban fields on users
USE akademiya;

ALTER TABLE users
  ADD COLUMN is_banned     TINYINT(1) NOT NULL DEFAULT 0 AFTER role,
  ADD COLUMN banned_at     DATETIME                       AFTER is_banned,
  ADD COLUMN banned_reason TEXT                           AFTER banned_at;

-- User reports
CREATE TABLE IF NOT EXISTS user_reports (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id  INT UNSIGNED NOT NULL,
  reported_id  INT UNSIGNED NOT NULL,
  class_id     INT UNSIGNED,
  org_id       INT UNSIGNED,
  reason       TEXT NOT NULL,
  stage        ENUM('class_leader','org_admin','akademiya') NOT NULL DEFAULT 'class_leader',
  status       ENUM('pending','resolved','escalated')       NOT NULL DEFAULT 'pending',
  handler_id   INT UNSIGNED,
  handler_note TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (reporter_id) REFERENCES users(id)         ON DELETE CASCADE,
  FOREIGN KEY (reported_id) REFERENCES users(id)         ON DELETE CASCADE,
  FOREIGN KEY (class_id)    REFERENCES classes(id)       ON DELETE SET NULL,
  FOREIGN KEY (org_id)      REFERENCES organizations(id) ON DELETE SET NULL,
  FOREIGN KEY (handler_id)  REFERENCES users(id)         ON DELETE SET NULL
);

-- Report escalation history
CREATE TABLE IF NOT EXISTS report_escalations (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id    INT UNSIGNED NOT NULL,
  from_stage   ENUM('class_leader','org_admin') NOT NULL,
  to_stage     ENUM('org_admin','akademiya')    NOT NULL,
  escalated_by INT UNSIGNED NOT NULL,
  note         TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id)    REFERENCES user_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (escalated_by) REFERENCES users(id)
);
