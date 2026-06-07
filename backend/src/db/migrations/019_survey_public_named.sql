-- 공개 설문 기명 응답 지원
-- public_identity_question: 설문 작성자가 지정한 응답자 신원 확인 질문
-- respondent_name: 공개 설문 응답 시 입력된 응답자 정보 (비로그인)
ALTER TABLE surveys
  ADD COLUMN public_identity_question VARCHAR(500) NULL AFTER allow_anonymous;

ALTER TABLE survey_responses
  ADD COLUMN respondent_name VARCHAR(500) NULL AFTER user_id;
