-- 013_question_description.sql
-- 설문 문항에 설명(description) 컬럼 추가
USE akademiya;

ALTER TABLE survey_questions
  ADD COLUMN description TEXT NULL AFTER title;
