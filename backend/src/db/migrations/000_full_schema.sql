-- ============================================================
-- Akademiya — Full Database Schema (001 ~ 019 통합본)
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
