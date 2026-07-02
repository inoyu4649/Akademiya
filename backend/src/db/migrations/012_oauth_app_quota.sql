-- ============================================================
-- 012: OAuth App 개수 한도 + 확장 요청
-- "공개(Public)" 앱(scope_range가 all 또는 google_workspace — 조직/반에
-- 종속되지 않아 누구나 로그인 가능한 범위)만 계정당 기본 5개로 제한한다.
-- 조직(org)/반(class) 범위 앱은 애초에 해당 조직/반 소속이어야 로그인 가능해
-- 자연히 남용 여지가 적으므로 무제한으로 둔다.
-- 자료실 파일 한도 확장 요청(002_resource_limits.sql)과 동일한 패턴.
-- ============================================================

ALTER TABLE users ADD COLUMN max_oauth_public_apps INT UNSIGNED NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS oauth_app_quota_requests (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id       INT UNSIGNED NOT NULL,
  requested_max_apps INT UNSIGNED NOT NULL,
  reason             TEXT,
  status             ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note         TEXT,
  reviewed_by        INT UNSIGNED,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
