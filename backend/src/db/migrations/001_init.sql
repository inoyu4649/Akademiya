-- Akademiya Database Schema
-- Encoding: utf8mb4
-- All timestamps: UTC (timezone offset stored per-org)

CREATE DATABASE IF NOT EXISTS akademiya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE akademiya;

-- =============================================
-- USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),                    -- NULL if Google-only account
  country      VARCHAR(100) NOT NULL,
  phone        VARCHAR(30)  NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  google_id    VARCHAR(255) UNIQUE,
  role         ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =============================================
-- REFRESH TOKENS
-- =============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- PASSWORD RESET TOKENS
-- =============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used       TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =============================================
-- ORGANIZATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS organizations (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  code         CHAR(4) NOT NULL UNIQUE,          -- 4-letter uppercase code (e.g. HAFS)
  owner_id     INT UNSIGNED NOT NULL,
  status       ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  google_domain VARCHAR(255),                    -- for automatic OAuth domain matching
  timezone     VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

-- =============================================
-- ORGANIZATION MEMBERS
-- permission: 0=일반, 1=통계조회, 2=통계조회+다운로드, 3=관리자
-- =============================================
CREATE TABLE IF NOT EXISTS org_members (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id      INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  permission  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  joined_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_user (org_id, user_id),
  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
);

-- =============================================
-- ORGANIZATION JOIN REQUESTS
-- =============================================
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

-- =============================================
-- CLASSES
-- =============================================
CREATE TABLE IF NOT EXISTS classes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id     INT UNSIGNED NOT NULL,
  name       VARCHAR(200) NOT NULL,
  code       VARCHAR(4) NOT NULL,               -- 4-char code, combined as ORGCODE+CLASSCODE
  owner_id   INT UNSIGNED NOT NULL,
  status     ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_class_code (org_id, code),
  FOREIGN KEY (org_id)    REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id)  REFERENCES users(id)
);

-- =============================================
-- CLASS MEMBERS
-- permission: 0=학생, 1=반장
-- =============================================
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

-- =============================================
-- CLASS JOIN REQUESTS
-- =============================================
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

-- =============================================
-- ASSIGNMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS assignments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id    INT UNSIGNED NOT NULL,
  creator_id  INT UNSIGNED NOT NULL,
  title       VARCHAR(300) NOT NULL,
  description TEXT,
  due_at      DATETIME,                         -- stored as UTC
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- =============================================
-- SUBMISSIONS
-- status: submitted=제출됨, approved=승인, returned=반환(재제출 필요)
-- =============================================
CREATE TABLE IF NOT EXISTS submissions (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  file_url      VARCHAR(500),
  link_url      VARCHAR(500),
  status        ENUM('submitted', 'approved', 'returned') NOT NULL DEFAULT 'submitted',
  feedback      TEXT,                            -- 반장 반환 시 코멘트
  submitted_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at   DATETIME,
  UNIQUE KEY uq_submission (assignment_id, user_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
);

-- =============================================
-- COMMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS comments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  content       TEXT NOT NULL,
  is_filtered   TINYINT(1) NOT NULL DEFAULT 0,  -- 욕설 필터 적용됨
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE
);

-- =============================================
-- PROFANITY WORDS
-- =============================================
CREATE TABLE IF NOT EXISTS profanity_words (
  id   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  word VARCHAR(100) NOT NULL UNIQUE
);

-- =============================================
-- NOTIFICATIONS
-- type: new_assignment, deadline_1d, deadline_3h, deadline_1h, deadline_10m, broadcast
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  type       ENUM('new_assignment','deadline_1d','deadline_3h','deadline_1h','deadline_10m','broadcast') NOT NULL,
  title      VARCHAR(300) NOT NULL,
  body       TEXT,
  link       VARCHAR(500),
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read)
);

-- =============================================
-- ORG USAGE STATS (집계 테이블)
-- =============================================
CREATE TABLE IF NOT EXISTS org_daily_stats (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id       INT UNSIGNED NOT NULL,
  stat_date    DATE NOT NULL,
  active_users INT UNSIGNED NOT NULL DEFAULT 0,
  submissions  INT UNSIGNED NOT NULL DEFAULT 0,
  comments     INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_org_date (org_id, stat_date),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
