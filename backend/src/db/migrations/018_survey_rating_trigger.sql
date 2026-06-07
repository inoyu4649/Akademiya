-- 평점 기반 부속 질문 트리거: 특정 평점 범위 선택 시 부속 질문 노출
ALTER TABLE survey_questions
  ADD COLUMN trigger_rating_min TINYINT UNSIGNED NULL AFTER trigger_option_id,
  ADD COLUMN trigger_rating_max TINYINT UNSIGNED NULL AFTER trigger_rating_min;
