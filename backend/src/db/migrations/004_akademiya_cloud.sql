-- ============================================================
-- 004: Akademiya Cloud (계정 단위 파일 저장소)
-- ============================================================
-- PyDe Web(pyde.akademiya.kr)이 사용자의 .py/.ipynb 작업물을 저장하는 곳이지만,
-- 스키마 자체는 특정 앱에 종속되지 않는 범용 파일 저장소로 설계한다
-- (추후 Akademiya Cloud를 독립 서비스 UI로 확장할 여지를 남기기 위함).
--
-- 경로 모델: 폴더를 행으로 두지 않고 (owner_id, folder, name) 조합으로 식별한다.
--   folder = 'PyDe Web', name = 'example.py'  →  "Akademiya Cloud/PyDe Web/example.py"
--   폴더 행이 없으므로 빈 폴더는 존재할 수 없다(현재 요구사항상 불필요).
--
-- 본문은 파일시스템이 아니라 DB(MEDIUMTEXT)에 저장한다.
--   · 대상이 텍스트 소스 파일(.py/.ipynb)이고 개당 5MB로 제한되므로 용량상 문제없음
--   · uploads 볼륨의 소유권/권한 함정(EACCES)과 공개 정적 서빙 사고(H-2/M-4)를 원천 회피
--   · 권한 검사와 본문 조회가 같은 트랜잭션 경계 안에 들어와 IDOR 방어가 단순해짐
--
-- ⚠️ 재실행 안전: 전부 IF NOT EXISTS. (backend/Dockerfile CMD가 마이그레이션 성공을
--    서버 기동 조건으로 걸어두었으므로 중간 실패 시 서비스가 뜨지 않는다)
-- ============================================================

-- ── 파일 본체 ────────────────────────────────────────────────────────────────
-- folder/name을 각각 180자로 제한한 이유: utf8mb4에서 UNIQUE 키 바이트 길이가
-- 4 + 180*4 + 180*4 = 1444바이트로 InnoDB 인덱스 상한(3072)에 안전하게 들어간다.
-- 255자로 잡으면 상한을 넘겨 테이블 생성 자체가 실패한다.
CREATE TABLE IF NOT EXISTS cloud_files (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id        INT UNSIGNED NOT NULL,
  folder          VARCHAR(180) NOT NULL DEFAULT '',   -- 예: 'PyDe Web' (루트는 빈 문자열)
  name            VARCHAR(180) NOT NULL,              -- 예: 'example.py'
  content         MEDIUMTEXT   NOT NULL,
  size_bytes      INT UNSIGNED NOT NULL DEFAULT 0,    -- content의 UTF-8 바이트 길이(할당량 계산용)
  revision        INT UNSIGNED NOT NULL DEFAULT 1,    -- 낙관적 잠금: 저장 시 클라이언트 revision과 비교
  -- 링크(URL) 공개. 익명 방문자는 link_share 값과 무관하게 항상 읽기 전용이며,
  -- 'editor'는 "링크로 들어온 로그인 사용자"에게만 쓰기를 허용한다(Colab과 동일).
  link_share      ENUM('none', 'viewer', 'editor') NOT NULL DEFAULT 'none',
  -- 토큰을 해시가 아닌 평문으로 둔다. 이 토큰이 잠금 해제하는 대상은 바로 옆 컬럼의
  -- content뿐이라, DB가 유출되는 상황에서는 해싱해도 지킬 것이 남지 않는다.
  -- 반대로 평문이면 소유자가 공유 링크를 언제든 다시 복사할 수 있다(Colab과 동일한 UX).
  link_token      VARCHAR(64) UNIQUE,                 -- base64url 32바이트
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cloud_path (owner_id, folder, name),
  KEY idx_cloud_owner (owner_id, folder),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 공유 대상 ────────────────────────────────────────────────────────────────
-- subject_type/subject_id는 다형(users.id 또는 organizations.id)이라 FK를 걸 수 없다.
-- 그래서 목록 조회는 항상 users/organizations와 JOIN해서 만든다 — 대상이 삭제되면
-- 고아 행이 남더라도 화면에 노출되지 않고, AUTO_INCREMENT는 id를 재사용하지 않으므로
-- 삭제된 계정의 id로 권한이 되살아나는 일도 없다.
CREATE TABLE IF NOT EXISTS cloud_file_shares (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id      INT UNSIGNED NOT NULL,
  subject_type ENUM('user', 'org') NOT NULL,
  subject_id   INT UNSIGNED NOT NULL,
  role         ENUM('viewer', 'editor') NOT NULL DEFAULT 'viewer',
  created_by   INT UNSIGNED,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cloud_share (file_id, subject_type, subject_id),
  KEY idx_cloud_share_subject (subject_type, subject_id),
  FOREIGN KEY (file_id) REFERENCES cloud_files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
