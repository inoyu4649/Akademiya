-- 008_account_deletion.sql
-- 회원 탈퇴 지원: owner/creator 참조 컬럼 nullable 변경
-- 탈퇴 시 해당 컬럼을 NULL로 교체한 뒤 users 행 삭제 (FK RESTRICT 우회)
USE akademiya;

-- organizations.owner_id: 소유자 탈퇴 시 NULL (조직 자체는 유지)
ALTER TABLE organizations MODIFY owner_id INT UNSIGNED NULL;

-- classes.owner_id: 반장 탈퇴 시 NULL (반 자체는 유지)
ALTER TABLE classes MODIFY owner_id INT UNSIGNED NULL;

-- assignments.creator_id: 생성자 탈퇴 시 NULL (과제 자체는 유지)
ALTER TABLE assignments MODIFY creator_id INT UNSIGNED NULL;

-- report_escalations.escalated_by: 처리자 탈퇴 시 NULL
ALTER TABLE report_escalations MODIFY escalated_by INT UNSIGNED NULL;
