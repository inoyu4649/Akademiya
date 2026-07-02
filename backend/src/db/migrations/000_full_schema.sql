-- ============================================================
-- Akademiya — Full Database Schema (통합본)
-- 이 파일 하단부는 과거 001_resources.sql ~ 012_oauth_app_quota.sql
-- 마이그레이션 파일들을 순서대로 병합한 것이다(각 섹션 시작에
-- "통합됨: 원본 ***.sql" 주석으로 출처를 남김). 이미 배포된 서버는
-- schema_migrations 테이블에 001~012가 개별적으로 이미 적용됨으로
-- 기록돼 있으므로 재실행되지 않는다. 신규(빈) DB에서만 이 파일 전체가
-- 한 번에 실행된다.
-- Encoding : utf8mb4 / utf8mb4_unicode_ci
-- Timestamps: UTC
-- ============================================================

CREATE DATABASE IF NOT EXISTS akademiya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE akademiya;

-- ============================================================
-- USERS
-- 002: country, phone nullable
-- 003: is_banned, banned_at, banned_reason 추가
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),                         -- NULL: Google 전용 계정
  country       VARCHAR(100),                         -- nullable (002)
  phone         VARCHAR(30),                          -- nullable (002)
  display_name  VARCHAR(100) NOT NULL,
  google_id     VARCHAR(255) UNIQUE,
  role          ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_banned     TINYINT(1)   NOT NULL DEFAULT 0,      -- (003)
  banned_at     DATETIME,                             -- (003)
  banned_reason TEXT,                                 -- (003)
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- PASSWORD RESET TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used       TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- ORGANIZATIONS
-- 008: owner_id nullable (탈퇴 시 조직 유지)
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  code          CHAR(4)      NOT NULL UNIQUE,          -- 4자 대문자 (예: HAFS)
  owner_id      INT UNSIGNED,                          -- nullable (008)
  status        ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  google_domain VARCHAR(255),
  timezone      VARCHAR(50)  NOT NULL DEFAULT 'Asia/Seoul',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- ORGANIZATION MEMBERS
-- permission: 0=일반, 1=통계조회, 2=통계+다운로드, 3=관리자
-- ============================================================
CREATE TABLE IF NOT EXISTS org_members (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id     INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  permission TINYINT UNSIGNED NOT NULL DEFAULT 0,
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_user (org_id, user_id),
  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
);

-- ============================================================
-- ORGANIZATION JOIN REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS org_join_requests (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id     INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  status     ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_join (org_id, user_id),
  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
);

-- ============================================================
-- CLASSES
-- 008: owner_id nullable (탈퇴 시 반 유지)
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id     INT UNSIGNED NOT NULL,
  name       VARCHAR(200) NOT NULL,
  code       VARCHAR(4)   NOT NULL,                   -- ORGCODE+CLASSCODE 조합
  owner_id   INT UNSIGNED,                            -- nullable (008)
  status     ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_class_code (org_id, code),
  FOREIGN KEY (org_id)   REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id)         ON DELETE SET NULL
);

-- ============================================================
-- CLASS MEMBERS
-- permission: 0=학생, 1=반장
-- ============================================================
CREATE TABLE IF NOT EXISTS class_members (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  permission TINYINT UNSIGNED NOT NULL DEFAULT 0,
  joined_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_user (class_id, user_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE
);

-- ============================================================
-- CLASS JOIN REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS class_join_requests (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  status     ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_join (class_id, user_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE
);

-- ============================================================
-- ASSIGNMENTS
-- 008: creator_id nullable (탈퇴 시 과제 유지)
-- 011: max_files, max_size_mb 추가
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id    INT UNSIGNED NOT NULL,
  creator_id  INT UNSIGNED,                           -- nullable (008)
  title       VARCHAR(300) NOT NULL,
  description TEXT,
  due_at      DATETIME,
  max_files   INT UNSIGNED NOT NULL DEFAULT 20,       -- (011)
  max_size_mb INT UNSIGNED NOT NULL DEFAULT 5,        -- (011)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (creator_id) REFERENCES users(id)   ON DELETE SET NULL
);

-- ============================================================
-- SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  file_url      VARCHAR(500),
  link_url      VARCHAR(500),
  status        ENUM('submitted', 'approved', 'returned') NOT NULL DEFAULT 'submitted',
  feedback      TEXT,
  submitted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at   DATETIME,
  UNIQUE KEY uq_submission (assignment_id, user_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
);

-- ============================================================
-- SUBMISSION FILES (011)
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_files (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id INT UNSIGNED NOT NULL,
  file_url      VARCHAR(500) NOT NULL,
  original_name VARCHAR(300),
  file_size     INT UNSIGNED,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_submission (submission_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SUBMISSION LIMIT REQUESTS (011)
-- ============================================================
CREATE TABLE IF NOT EXISTS submission_limit_requests (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id         INT UNSIGNED NOT NULL,
  requester_id          INT UNSIGNED,
  requested_max_files   INT UNSIGNED NOT NULL,
  requested_max_size_mb INT UNSIGNED NOT NULL,
  reason                TEXT,
  status                ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  admin_note            TEXT,
  reviewed_by           INT UNSIGNED,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_id)  REFERENCES users(id)       ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by)   REFERENCES users(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  content       TEXT NOT NULL,
  is_filtered   TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
);

-- ============================================================
-- PROFANITY WORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS profanity_words (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  word VARCHAR(100) NOT NULL UNIQUE
);

-- ============================================================
-- NOTIFICATIONS
-- 007: org_rejected, class_rejected 추가
-- 010: new_survey 추가
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM(
               'new_assignment',
               'deadline_1d',
               'deadline_3h',
               'deadline_1h',
               'deadline_10m',
               'broadcast',
               'org_rejected',
               'class_rejected',
               'new_survey'
             ) NOT NULL,
  title      VARCHAR(300) NOT NULL,
  body       TEXT,
  link       VARCHAR(500),
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read)
);

-- ============================================================
-- NOTIFICATION DEDUP (005)
-- ============================================================
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

-- ============================================================
-- ORG DAILY STATS
-- ============================================================
CREATE TABLE IF NOT EXISTS org_daily_stats (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id       INT UNSIGNED NOT NULL,
  stat_date    DATE         NOT NULL,
  active_users INT UNSIGNED NOT NULL DEFAULT 0,
  submissions  INT UNSIGNED NOT NULL DEFAULT 0,
  comments     INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_org_date (org_id, stat_date),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- ============================================================
-- USER REPORTS (003)
-- ============================================================
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

-- ============================================================
-- REPORT ESCALATIONS (003)
-- 008: escalated_by nullable
-- ============================================================
CREATE TABLE IF NOT EXISTS report_escalations (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id    INT UNSIGNED NOT NULL,
  from_stage   ENUM('class_leader','org_admin') NOT NULL,
  to_stage     ENUM('org_admin','akademiya')    NOT NULL,
  escalated_by INT UNSIGNED,                            -- nullable (008)
  note         TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id)    REFERENCES user_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (escalated_by) REFERENCES users(id)        ON DELETE SET NULL
);

-- ============================================================
-- BUG REPORTS (006)
-- ============================================================
CREATE TABLE IF NOT EXISTS bug_reports (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(300) NOT NULL,
  body       TEXT NOT NULL,
  browser    VARCHAR(200),
  os         VARCHAR(200),
  status     ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
  admin_note TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- CALENDAR EVENTS (009)
-- ============================================================
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

-- ============================================================
-- SURVEYS (010)
-- 012: allow_edit, allow_multiple 추가
-- 019: public_identity_question 추가
-- ============================================================
CREATE TABLE IF NOT EXISTS surveys (
  id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creator_id               INT UNSIGNED,
  title                    VARCHAR(300) NOT NULL,
  description              TEXT,
  scope_type               ENUM('class', 'org', 'public') NOT NULL DEFAULT 'class',
  scope_id                 INT UNSIGNED,                  -- public이면 NULL
  is_active                TINYINT(1) NOT NULL DEFAULT 1,
  allow_anonymous          TINYINT(1) NOT NULL DEFAULT 0,
  public_identity_question VARCHAR(500),                  -- (019) 공개 기명 설문용 질문
  allow_edit               TINYINT(1) NOT NULL DEFAULT 0, -- (012)
  allow_multiple           TINYINT(1) NOT NULL DEFAULT 0, -- (012)
  expires_at               DATETIME,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_scope   (scope_type, scope_id),
  INDEX idx_creator (creator_id),
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SURVEY QUESTIONS (010)
-- 013: description 추가
-- 014: parent_question_id, trigger_option_id 추가
-- 015: has_other 추가
-- 018: trigger_rating_min, trigger_rating_max 추가
-- ============================================================
CREATE TABLE IF NOT EXISTS survey_questions (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  survey_id          INT UNSIGNED NOT NULL,
  parent_question_id INT UNSIGNED,                        -- (014) 부속 질문의 부모
  trigger_option_id  INT UNSIGNED,                        -- (014) 노출 트리거 선택지
  trigger_rating_min TINYINT UNSIGNED,                    -- (018) 평점 트리거 최솟값
  trigger_rating_max TINYINT UNSIGNED,                    -- (018) 평점 트리거 최댓값
  order_num          INT UNSIGNED NOT NULL DEFAULT 0,
  type               ENUM('single', 'multiple', 'text', 'rating') NOT NULL,
  title              VARCHAR(500) NOT NULL,
  description        TEXT,                                -- (013)
  required           TINYINT(1) NOT NULL DEFAULT 0,
  has_other          TINYINT(1) NOT NULL DEFAULT 0,       -- (015)
  FOREIGN KEY (survey_id)          REFERENCES surveys(id)          ON DELETE CASCADE,
  CONSTRAINT fk_sq_parent  FOREIGN KEY (parent_question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sq_trigger FOREIGN KEY (trigger_option_id)  REFERENCES survey_options(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SURVEY OPTIONS (010)
-- ============================================================
CREATE TABLE IF NOT EXISTS survey_options (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question_id INT UNSIGNED NOT NULL,
  order_num   INT UNSIGNED NOT NULL DEFAULT 0,
  label       VARCHAR(300) NOT NULL,
  FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SURVEY RESPONSES (010)
-- 019: respondent_name 추가 (공개 기명 응답자 이름)
-- ============================================================
CREATE TABLE IF NOT EXISTS survey_responses (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  survey_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED,                           -- NULL: 익명/공개 응답
  respondent_name VARCHAR(500),                           -- (019) 공개 기명 응답자 입력값
  submitted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_survey_user (survey_id, user_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SURVEY RESPONSE ITEMS (010)
-- 015: is_other 추가
-- ============================================================
CREATE TABLE IF NOT EXISTS survey_response_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  response_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  option_id   INT UNSIGNED,                              -- NULL: 텍스트/평점 형
  text_answer TEXT,
  is_other    TINYINT(1) NOT NULL DEFAULT 0,             -- (015)
  FOREIGN KEY (response_id) REFERENCES survey_responses(id)  ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES survey_questions(id)  ON DELETE CASCADE,
  FOREIGN KEY (option_id)   REFERENCES survey_options(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- SURVEY STAT VIEWERS (010)
-- ============================================================
CREATE TABLE IF NOT EXISTS survey_stat_viewers (
  survey_id INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  PRIMARY KEY (survey_id, user_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- PRIVACY CONSENTS (016)
-- ============================================================
CREATE TABLE IF NOT EXISTS privacy_consents (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  service      VARCHAR(20) NOT NULL DEFAULT 'akademiya',
  version      INT NOT NULL,
  consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- TERMS CONSENTS (017)
-- ============================================================
CREATE TABLE IF NOT EXISTS terms_consents (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  service      VARCHAR(20) NOT NULL DEFAULT 'akademiya',
  version      INT NOT NULL,
  consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- (통합됨: 원본 001_resources.sql)
-- ============================================================
CREATE TABLE class_resources (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id    INT UNSIGNED NOT NULL,
  creator_id  INT UNSIGNED NOT NULL,
  title       VARCHAR(300) NOT NULL,
  description TEXT,
  link_url    VARCHAR(1000) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (creator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE class_resource_files (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resource_id   INT UNSIGNED NOT NULL,
  file_url      VARCHAR(500) NOT NULL,
  original_name VARCHAR(300) NOT NULL,
  file_size     BIGINT       NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (resource_id) REFERENCES class_resources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- (통합됨: 원본 002_resource_limits.sql)
-- ============================================================
-- 반별 자료실 기본 업로드 한도 컬럼 추가
ALTER TABLE classes
  ADD COLUMN max_resource_files   INT NOT NULL DEFAULT 20,
  ADD COLUMN max_resource_size_mb INT NOT NULL DEFAULT 20;

-- 자료 한도 확장 요청 테이블
CREATE TABLE resource_limit_requests (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id              INT UNSIGNED NOT NULL,
  requester_id          INT UNSIGNED NOT NULL,
  requested_max_files   INT          NOT NULL,
  requested_max_size_mb INT          NOT NULL,
  reason                TEXT,
  status                ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  admin_note            TEXT,
  reviewed_by           INT UNSIGNED,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id)     REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_id) REFERENCES users(id),
  FOREIGN KEY (reviewed_by)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- (통합됨: 원본 003_language.sql)
-- ============================================================
ALTER TABLE users ADD COLUMN language VARCHAR(5) NULL DEFAULT NULL AFTER phone;

-- ============================================================
-- (통합됨: 원본 004_intl_transfer_consents.sql)
-- ============================================================
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

-- ============================================================
-- (통합됨: 원본 005_survey_response_ip.sql)
-- ============================================================
-- ============================================================
-- SURVEY RESPONSES — response_ip 추가 (L-5)
-- 익명/공개 응답은 user_id가 NULL이라 UNIQUE(survey_id, user_id)가 무력화됨
-- (MySQL은 NULL을 서로 다른 값으로 취급) → IP 기준 중복응답 차단을 위해 저장.
-- ============================================================
ALTER TABLE survey_responses
  ADD COLUMN response_ip VARCHAR(45) NULL AFTER respondent_name,
  ADD INDEX idx_survey_response_ip (survey_id, response_ip);

-- ============================================================
-- (통합됨: 원본 006_survey_response_token.sql)
-- ============================================================
-- ============================================================
-- SURVEY RESPONSES — response_token 추가 (L-5 재설계)
-- 학교처럼 다수가 공유 IP(NAT/공용 와이파이)를 쓰는 환경에서는
-- response_ip 기준 중복응답 차단이 서로 다른 사람을 한 명으로 오인함.
--   - 기명식(public_identity_question 有) 공개 설문: respondent_name으로 구분(별도 컬럼 불필요)
--   - 익명 공개 설문: 브라우저별 발급되는 쿠키 토큰(response_token)으로 구분
-- response_ip는 제거하지 않고 남겨둠 — rate limiter/모더레이션용 참고 정보로만 사용.
-- ============================================================
ALTER TABLE survey_responses
  ADD COLUMN response_token VARCHAR(64) NULL AFTER response_ip,
  ADD INDEX idx_survey_response_token (survey_id, response_token);

-- ============================================================
-- (통합됨: 원본 007_kick_notifications.sql)
-- ============================================================
-- 007: 강퇴 알림 타입 추가
ALTER TABLE notifications
  MODIFY COLUMN type ENUM(
    'new_assignment',
    'deadline_1d',
    'deadline_3h',
    'deadline_1h',
    'deadline_10m',
    'broadcast',
    'org_rejected',
    'class_rejected',
    'new_survey',
    'org_kicked',
    'class_kicked'
  ) NOT NULL;

-- ============================================================
-- (통합됨: 원본 008_push_subscriptions.sql)
-- ============================================================
-- 008: PWA 푸시 알림 구독 정보
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_endpoint (user_id, endpoint(500)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- (통합됨: 원본 009_ai_conversations.sql)
-- ============================================================
-- AkashaAlt 채팅 기록 테이블
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(200)  NOT NULL DEFAULT '새 대화',
  server_url VARCHAR(500)  NOT NULL DEFAULT '',
  model_id   VARCHAR(100)  NOT NULL DEFAULT '',
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_updated (user_id, updated_at DESC),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  role            ENUM('user','assistant') NOT NULL,
  content         MEDIUMTEXT NOT NULL,
  model_id        VARCHAR(100),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conv (conversation_id),
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- (통합됨: 원본 010_ai_vault.sql)
-- ============================================================
-- 010: AkashaAlt API Key Zero-Knowledge Vault
-- 서버는 사용자의 AI Provider API Key 평문을 절대 저장/보유하지 않는다.
-- AkashaAlt API 비밀번호(Akademiya 로그인 비밀번호와 무관)로부터 Argon2id로 파생한
-- AES-256-GCM 키로만 암호화/복호화하며, 파생 키는 서버 메모리에만 짧게 존재한다.

-- 사용자당 1행: KDF 파라미터 + 비밀번호 검증용 canary(고정 평문 암호문)
CREATE TABLE IF NOT EXISTS ai_vaults (
  user_id           INT UNSIGNED NOT NULL PRIMARY KEY,
  kdf_salt          VARBINARY(32) NOT NULL,
  kdf_time_cost     SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  kdf_memory_cost   INT UNSIGNED NOT NULL DEFAULT 65536,
  kdf_parallelism   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  enc_version       TINYINT UNSIGNED NOT NULL DEFAULT 1,
  canary_ciphertext VARBINARY(128) NOT NULL,
  canary_nonce      VARBINARY(12) NOT NULL,
  canary_tag        VARBINARY(16) NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 사용자 + provider 당 1행: 암호화된 API Key만 저장 (평문/키 절대 저장 안 함)
CREATE TABLE IF NOT EXISTS ai_api_keys (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  provider     ENUM('openrouter','openai','gemini','anthropic') NOT NULL,
  ciphertext   VARBINARY(1024) NOT NULL,
  nonce        VARBINARY(12) NOT NULL,
  auth_tag     VARBINARY(16) NOT NULL,
  enc_version  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 볼트 비밀번호 변경/초기화용 이메일 인증 코드 (password_reset_tokens와 동일 패턴)
CREATE TABLE IF NOT EXISTS ai_vault_reset_tokens (
  user_id    INT UNSIGNED NOT NULL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used       TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- (통합됨: 원본 011_openoauth.sql)
-- ============================================================
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

-- ============================================================
-- (통합됨: 원본 012_oauth_app_quota.sql)
-- ============================================================
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
