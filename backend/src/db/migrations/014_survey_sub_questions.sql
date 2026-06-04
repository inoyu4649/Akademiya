-- 부속 질문(sub-question) 지원: parent_question_id, trigger_option_id
ALTER TABLE survey_questions
  ADD COLUMN parent_question_id INT UNSIGNED NULL AFTER survey_id,
  ADD COLUMN trigger_option_id  INT UNSIGNED NULL AFTER parent_question_id;

ALTER TABLE survey_questions
  ADD CONSTRAINT fk_sq_parent  FOREIGN KEY (parent_question_id) REFERENCES survey_questions(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_sq_trigger FOREIGN KEY (trigger_option_id)  REFERENCES survey_options(id)   ON DELETE SET NULL;
