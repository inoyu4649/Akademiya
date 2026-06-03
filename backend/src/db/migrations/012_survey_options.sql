-- 설문 응답 수정 허용 / 복수 응답 허용 컬럼 추가
ALTER TABLE surveys
  ADD COLUMN allow_edit     TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_anonymous,
  ADD COLUMN allow_multiple TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_edit;
