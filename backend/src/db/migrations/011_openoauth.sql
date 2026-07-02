-- ============================================================
-- 011: Akademiya OpenOAuth — "Sign in with Akademiya" 제공자 기능
-- 회원 개발자 모드 플래그 + OAuth App(클라이언트) 등록/오리진 화이트리스트/
-- 인가 코드(PKCE)/토큰/앱별 BAN/로그인 통계 이벤트
-- 기존 GMCAuto 전용 연동(oauth.ts, /api/oauth)과는 완전히 별개 — 수정하지 않음
-- ============================================================

ALTER TABLE users ADD COLUMN developer_mode TINYINT(1) NOT NULL DEFAULT 0 AFTER role;

-- ============================================================
-- OAUTH APPS — 개발자가 등록한 OAuth 클라이언트
-- login_means : akademiya=이메일/비번만, google=Google 로그인만, both=둘 다 허용
-- scope_range : all=전체, org=조직 단위, class=반 단위, google_workspace=Google 전용일 때만 선택 가능
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_apps (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id            INT UNSIGNED NOT NULL,
  client_id           VARCHAR(32)  NOT NULL UNIQUE,
  client_secret_hash  VARCHAR(255) NOT NULL,
  code_name           VARCHAR(64)  NOT NULL UNIQUE,        -- 영문 소문자/숫자/하이픈만, 생성 후 불변
  display_name        VARCHAR(120) NOT NULL,               -- 승인 화면 표출용 이름, 수정 가능
  main_site_url       VARCHAR(255) NOT NULL,               -- 메인 사이트 URL (1개만 허용)
  login_means         ENUM('akademiya', 'google', 'both') NOT NULL DEFAULT 'both',
  scope_range         ENUM('all', 'org', 'class', 'google_workspace') NOT NULL DEFAULT 'all',
  scope_org_id        INT UNSIGNED,
  scope_class_id      INT UNSIGNED,
  scope_google_domain VARCHAR(255),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id)       REFERENCES users(id)         ON DELETE CASCADE,
  FOREIGN KEY (scope_org_id)   REFERENCES organizations(id) ON DELETE SET NULL,
  FOREIGN KEY (scope_class_id) REFERENCES classes(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- OAUTH APP ORIGINS — 신뢰 JavaScript 출처 화이트리스트 (구글 방식)
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_app_origins (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_id     INT UNSIGNED NOT NULL,
  origin     VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_origin (app_id, origin),
  FOREIGN KEY (app_id) REFERENCES oauth_apps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- OAUTH AUTHORIZATION CODES — 60초 TTL, PKCE(code_challenge) 지원, 1회용
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code_hash             VARCHAR(64)  NOT NULL UNIQUE,
  app_id                INT UNSIGNED NOT NULL,
  user_id               INT UNSIGNED NOT NULL,
  redirect_uri          VARCHAR(500) NOT NULL,
  scope                 VARCHAR(255) NOT NULL,
  code_challenge        VARCHAR(255),
  code_challenge_method VARCHAR(10),
  expires_at            DATETIME NOT NULL,
  used                  TINYINT(1) NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id)  REFERENCES oauth_apps(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- OAUTH TOKENS — 발급된 access/refresh 토큰 (불투명 랜덤값, SHA-256 해시 저장)
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_id             INT UNSIGNED NOT NULL,
  user_id            INT UNSIGNED NOT NULL,
  access_token_hash  VARCHAR(64) NOT NULL UNIQUE,
  refresh_token_hash VARCHAR(64) UNIQUE,
  scope              VARCHAR(255) NOT NULL,
  access_expires_at  DATETIME NOT NULL,
  refresh_expires_at DATETIME,
  revoked            TINYINT(1) NOT NULL DEFAULT 0,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id)  REFERENCES oauth_apps(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- OAUTH APP BANS — 앱 소유자가 자신의 앱에서 특정 사용자를 BAN
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_app_bans (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_id    INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  reason    TEXT,
  banned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  banned_by INT UNSIGNED,
  UNIQUE KEY uq_app_ban_user (app_id, user_id),
  FOREIGN KEY (app_id)    REFERENCES oauth_apps(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (banned_by) REFERENCES users(id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- OAUTH LOGIN EVENTS — 기간별 통계용 (요청/성공/거부/BAN 이벤트 로그)
-- ============================================================
CREATE TABLE IF NOT EXISTS oauth_login_events (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  app_id     INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED,
  event_type ENUM('request', 'success', 'denied', 'banned') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id)  REFERENCES oauth_apps(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)      ON DELETE SET NULL,
  INDEX idx_app_time (app_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
