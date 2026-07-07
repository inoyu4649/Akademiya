-- ============================================================
-- 001: 프로필 사진 + Akademiya OpenOAuth 선택적 Scope
-- - users.avatar_url: 사용자가 업로드한 프로필 사진 경로(NULL = 기본 SVG 아이콘 사용)
-- - oauth_apps.enabled_scopes: 개발자가 체크박스로 켠 선택적 scope 목록
--   (공백 구분 문자열, 예: "picture org_membership"). 필수 scope(profile/email)는
--   여기 포함되지 않고 항상 부여된다. scope_range가 org/class인 앱은
--   org_membership/class_membership이 서버에서 강제로 포함된다.
-- ============================================================

ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) DEFAULT NULL AFTER display_name;

ALTER TABLE oauth_apps ADD COLUMN enabled_scopes VARCHAR(255) NOT NULL DEFAULT '' AFTER scope_google_domain;
