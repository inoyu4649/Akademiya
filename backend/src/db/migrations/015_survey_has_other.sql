-- 설문 문항에 기타(직접 입력) 기능 추가
ALTER TABLE survey_questions
  ADD COLUMN has_other TINYINT(1) NOT NULL DEFAULT 0 AFTER required;

-- 응답 항목에 기타 응답 여부 플래그 추가
ALTER TABLE survey_response_items
  ADD COLUMN is_other TINYINT(1) NOT NULL DEFAULT 0;
