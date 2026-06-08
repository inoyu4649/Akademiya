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
