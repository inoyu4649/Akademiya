-- Google OAuth로 가입한 사용자는 phone/country를 나중에 채울 수 있도록 nullable 처리
USE akademiya;

ALTER TABLE users
  MODIFY COLUMN country VARCHAR(100),
  MODIFY COLUMN phone   VARCHAR(30);
