-- ============================================================
-- 002: Akademiya v2.0 — 조직-반 구조 / 신고 / 통계 제거
-- ============================================================
-- v2.0부터 Akademiya는 "설문지 제작 + OAuth 제공자(로그인 플랫폼)"만 담당한다.
-- 반(class)·과제·제출물·댓글·자료실·사용자 신고·조직 활동 통계는 전부 폐지한다.
--
-- 조직(organizations / org_members / org_join_requests)은 남긴다 —
-- GMCAuto 3처럼 "특정 학교 재학생만 로그인 가능"한 OAuth 클라이언트를 위한
-- 소속 판별 수단으로 계속 쓰이기 때문이다. 다만 사용자에게 노출되는 UI는 없고,
-- 생성·수정·삭제는 Akademiya 운영자만, 가입은 계정 센터에서만 이뤄진다.
--
-- ⚠️ 되돌릴 수 없는 마이그레이션이다. 프로덕션 적용 전 DB 백업 필수.
-- ============================================================

-- ── 1. 반에 종속된 설문 정리 ────────────────────────────────────────────────
-- 반이 사라지면 scope_type='class' 설문은 접근 경로 자체가 없어진다.
-- 응답(survey_responses 등)은 FK CASCADE로 함께 삭제된다.
DELETE FROM surveys WHERE scope_type = 'class';

ALTER TABLE surveys
  MODIFY COLUMN scope_type ENUM('org', 'public') NOT NULL DEFAULT 'public';

-- ── 2. 반 일정 정리 + 개인 일정 도입 ────────────────────────────────────────
DELETE FROM calendar_events WHERE scope_type = 'class';

-- scope_type='personal'일 때 scope_id는 소유자 user_id를 뜻한다.
ALTER TABLE calendar_events
  MODIFY COLUMN scope_type ENUM('org', 'personal') NOT NULL;

-- ── 3. OAuth 앱의 반(class) 범위 제거 ───────────────────────────────────────
-- scope_range='class' 앱은 판별 근거가 사라지므로 조직 범위로 승격할 수 없다.
-- 소유자가 다시 설정하도록 'all'(전체 공개)이 아니라 소속 조직 범위로 옮긴다.
UPDATE oauth_apps oa
  JOIN classes c ON c.id = oa.scope_class_id
  SET oa.scope_range = 'org', oa.scope_org_id = c.org_id
  WHERE oa.scope_range = 'class';

-- 위 UPDATE로도 구제되지 않은 행(참조 반이 이미 삭제된 경우)은 전체 범위로 둔다.
UPDATE oauth_apps SET scope_range = 'all', scope_org_id = NULL WHERE scope_range = 'class';

ALTER TABLE oauth_apps
  MODIFY COLUMN scope_range ENUM('all', 'org', 'google_workspace') NOT NULL DEFAULT 'all';

-- FK 이름은 InnoDB가 자동 생성(oauth_apps_ibfk_N)하므로 이름을 가정하지 않고 조회해서 지운다.
SET @fk_name := (
  SELECT CONSTRAINT_NAME
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'oauth_apps'
    AND COLUMN_NAME = 'scope_class_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @drop_fk := IF(@fk_name IS NULL,
                   'SELECT 1',
                   CONCAT('ALTER TABLE oauth_apps DROP FOREIGN KEY `', @fk_name, '`'));
PREPARE stmt FROM @drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE oauth_apps DROP COLUMN scope_class_id;

-- class_membership scope는 더 이상 제공되지 않는다 (org_membership만 남김).
UPDATE oauth_apps
  SET enabled_scopes = TRIM(REPLACE(CONCAT(' ', enabled_scopes, ' '), ' class_membership ', ' '))
  WHERE enabled_scopes LIKE '%class_membership%';

-- ── 4. 반/과제/자료실/신고/통계 테이블 제거 (자식 → 부모 순서) ──────────────
DROP TABLE IF EXISTS notification_dedup;         -- → assignments
DROP TABLE IF EXISTS submission_files;           -- → submissions
DROP TABLE IF EXISTS submission_limit_requests;  -- → assignments
DROP TABLE IF EXISTS submissions;                -- → assignments
DROP TABLE IF EXISTS comments;                   -- → assignments
DROP TABLE IF EXISTS assignments;                -- → classes
DROP TABLE IF EXISTS class_resource_files;       -- → class_resources
DROP TABLE IF EXISTS class_resources;            -- → classes
DROP TABLE IF EXISTS resource_limit_requests;    -- → classes
DROP TABLE IF EXISTS report_escalations;         -- → user_reports
DROP TABLE IF EXISTS user_reports;               -- → classes, organizations
DROP TABLE IF EXISTS class_join_requests;        -- → classes
DROP TABLE IF EXISTS class_members;              -- → classes
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS profanity_words;            -- 댓글 욕설 필터 전용
DROP TABLE IF EXISTS org_daily_stats;            -- 조직/반 활동 통계 전용

-- ── 5. 알림 타입 정리 ───────────────────────────────────────────────────────
-- 과제·마감·반 관련 알림은 더 이상 생성되지 않으므로 기존 행을 지우고 ENUM을 좁힌다.
DELETE FROM notifications
  WHERE type IN ('new_assignment', 'deadline_1d', 'deadline_3h', 'deadline_1h',
                 'deadline_10m', 'class_rejected', 'class_kicked');

ALTER TABLE notifications
  MODIFY COLUMN type ENUM(
    'broadcast',
    'org_rejected',
    'org_kicked',
    'new_survey'
  ) NOT NULL;
