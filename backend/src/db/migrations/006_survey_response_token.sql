-- ============================================================
-- SURVEY RESPONSES — response_token 추가 (L-5 재설계)
-- 학교처럼 다수가 공유 IP(NAT/공용 와이파이)를 쓰는 환경에서는
-- response_ip 기준 중복응답 차단이 서로 다른 사람을 한 명으로 오인함.
--   - 기명식(public_identity_question 有) 공개 설문: respondent_name으로 구분(별도 컬럼 불필요)
--   - 익명 공개 설문: 브라우저별 발급되는 쿠키 토큰(response_token)으로 구분
-- response_ip는 제거하지 않고 남겨둠 — rate limiter/모더레이션용 참고 정보로만 사용.
-- ============================================================
ALTER TABLE survey_responses
  ADD COLUMN response_token VARCHAR(64) NULL AFTER response_ip,
  ADD INDEX idx_survey_response_token (survey_id, response_token);
