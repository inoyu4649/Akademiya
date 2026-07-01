-- 010: AkashaAlt API Key Zero-Knowledge Vault
-- 서버는 사용자의 AI Provider API Key 평문을 절대 저장/보유하지 않는다.
-- AkashaAlt API 비밀번호(Akademiya 로그인 비밀번호와 무관)로부터 Argon2id로 파생한
-- AES-256-GCM 키로만 암호화/복호화하며, 파생 키는 서버 메모리에만 짧게 존재한다.

-- 사용자당 1행: KDF 파라미터 + 비밀번호 검증용 canary(고정 평문 암호문)
CREATE TABLE IF NOT EXISTS ai_vaults (
  user_id           INT UNSIGNED NOT NULL PRIMARY KEY,
  kdf_salt          VARBINARY(32) NOT NULL,
  kdf_time_cost     SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  kdf_memory_cost   INT UNSIGNED NOT NULL DEFAULT 65536,
  kdf_parallelism   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  enc_version       TINYINT UNSIGNED NOT NULL DEFAULT 1,
  canary_ciphertext VARBINARY(128) NOT NULL,
  canary_nonce      VARBINARY(12) NOT NULL,
  canary_tag        VARBINARY(16) NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 사용자 + provider 당 1행: 암호화된 API Key만 저장 (평문/키 절대 저장 안 함)
CREATE TABLE IF NOT EXISTS ai_api_keys (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  provider     ENUM('openrouter','openai','gemini','anthropic') NOT NULL,
  ciphertext   VARBINARY(1024) NOT NULL,
  nonce        VARBINARY(12) NOT NULL,
  auth_tag     VARBINARY(16) NOT NULL,
  enc_version  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 볼트 비밀번호 변경/초기화용 이메일 인증 코드 (password_reset_tokens와 동일 패턴)
CREATE TABLE IF NOT EXISTS ai_vault_reset_tokens (
  user_id    INT UNSIGNED NOT NULL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used       TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
