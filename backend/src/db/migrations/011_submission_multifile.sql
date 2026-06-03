-- 011_submission_multifile.sql
-- 과제 다중 파일 제출 + 용량/개수 확장 요청
USE akademiya;

-- 과제별 파일 제출 한도 (기본값: 20개, 5MB)
ALTER TABLE assignments
  ADD COLUMN max_files   INT UNSIGNED NOT NULL DEFAULT 20,
  ADD COLUMN max_size_mb INT UNSIGNED NOT NULL DEFAULT 5;

-- 제출물 첨부 파일 (1 submission → N files)
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

-- 과제 파일 한도 확장 요청
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
  FOREIGN KEY (requester_id)  REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by)   REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
