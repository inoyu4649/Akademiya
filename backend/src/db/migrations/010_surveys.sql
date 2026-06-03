-- 010_surveys.sql
-- 설문 시스템 테이블
USE akademiya;

-- 설문지
CREATE TABLE IF NOT EXISTS surveys (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creator_id      INT UNSIGNED,
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  -- scope_type: class=반 대상, org=조직 대상, public=URL 배포(누구나)
  scope_type      ENUM('class', 'org', 'public') NOT NULL DEFAULT 'class',
  scope_id        INT UNSIGNED,                 -- class_id 또는 org_id, public이면 NULL
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  allow_anonymous TINYINT(1) NOT NULL DEFAULT 0,
  expires_at      DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_scope (scope_type, scope_id),
  INDEX idx_creator (creator_id),
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 설문 문항
CREATE TABLE IF NOT EXISTS survey_questions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  survey_id   INT UNSIGNED NOT NULL,
  order_num   INT UNSIGNED NOT NULL DEFAULT 0,
  type        ENUM('single', 'multiple', 'text', 'rating') NOT NULL,
  title       VARCHAR(500) NOT NULL,
  required    TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 선택지 (single/multiple 문항)
CREATE TABLE IF NOT EXISTS survey_options (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question_id INT UNSIGNED NOT NULL,
  order_num   INT UNSIGNED NOT NULL DEFAULT 0,
  label       VARCHAR(300) NOT NULL,
  FOREIGN KEY (question_id) REFERENCES survey_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 제출된 응답 (1 row = 1 사용자의 1 설문 응답)
CREATE TABLE IF NOT EXISTS survey_responses (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  survey_id    INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED,              -- NULL: 비식별(anonymous)
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_survey_user (survey_id, user_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 응답 항목 (문항별 선택/텍스트)
CREATE TABLE IF NOT EXISTS survey_response_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  response_id  INT UNSIGNED NOT NULL,
  question_id  INT UNSIGNED NOT NULL,
  option_id    INT UNSIGNED,              -- NULL: 텍스트형 또는 rating
  text_answer  TEXT,                      -- text/rating 형 답변
  FOREIGN KEY (response_id)  REFERENCES survey_responses(id)     ON DELETE CASCADE,
  FOREIGN KEY (question_id)  REFERENCES survey_questions(id)     ON DELETE CASCADE,
  FOREIGN KEY (option_id)    REFERENCES survey_options(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 통계 조회 권한 부여된 사용자
CREATE TABLE IF NOT EXISTS survey_stat_viewers (
  survey_id   INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  PRIMARY KEY (survey_id, user_id),
  FOREIGN KEY (survey_id) REFERENCES surveys(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 알림 타입에 survey 추가
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
    'new_survey'
  ) NOT NULL;
