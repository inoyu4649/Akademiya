-- ============================================================
-- SURVEY RESPONSES — response_ip 추가 (L-5)
-- 익명/공개 응답은 user_id가 NULL이라 UNIQUE(survey_id, user_id)가 무력화됨
-- (MySQL은 NULL을 서로 다른 값으로 취급) → IP 기준 중복응답 차단을 위해 저장.
-- ============================================================
ALTER TABLE survey_responses
  ADD COLUMN response_ip VARCHAR(45) NULL AFTER respondent_name,
  ADD INDEX idx_survey_response_ip (survey_id, response_ip);
