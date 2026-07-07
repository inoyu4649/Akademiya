import mysql from "mysql2/promise";

// AkashaAlt 전용 MySQL — Akademiya 본체 DB와 완전히 분리된 별도 스키마.
// (GMCAuto의 gmc/server/db.ts와 동일한 패턴: 마이그레이션 파일 시스템 대신
//  서버 기동 시 CREATE TABLE IF NOT EXISTS로 스키마를 멱등하게 보장한다.)
export const pool = mysql.createPool({
  host: process.env.AKASHAALT_DB_HOST || "localhost",
  port: parseInt(process.env.AKASHAALT_DB_PORT || "3306", 10),
  user: process.env.AKASHAALT_DB_USER || "akademiya",
  password: process.env.AKASHAALT_DB_PASSWORD || "",
  database: process.env.AKASHAALT_DB_NAME || "akashaalt",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
  timezone: "+00:00",
});

export async function initDb(): Promise<void> {
  // Akademiya 계정과의 연결 고리 — akademiya_user_id는 OpenOAuth userinfo의 sub(=Akademiya users.id).
  // Akademiya DB에 대한 FK는 걸지 않는다(스키마가 완전히 분리되어 있어 교차 DB FK를 의도적으로 피함).
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS akashaalt_users (
      id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      akademiya_user_id INT UNSIGNED NOT NULL,
      akademiya_email   VARCHAR(255),
      display_name      VARCHAR(255) NOT NULL DEFAULT '',
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_akademiya_user (akademiya_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id    INT UNSIGNED NOT NULL,
      title      VARCHAR(200)  NOT NULL DEFAULT '새 대화',
      server_url VARCHAR(500)  NOT NULL DEFAULT '',
      model_id   VARCHAR(100)  NOT NULL DEFAULT '',
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_updated (user_id, updated_at DESC),
      FOREIGN KEY (user_id) REFERENCES akashaalt_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT UNSIGNED NOT NULL,
      role            ENUM('user','assistant') NOT NULL,
      content         MEDIUMTEXT NOT NULL,
      model_id        VARCHAR(100),
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_conv (conversation_id),
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 사용자당 1행: KDF 파라미터 + 비밀번호 검증용 canary(고정 평문 암호문)
  await pool.execute(`
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
      FOREIGN KEY (user_id) REFERENCES akashaalt_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 사용자 + provider 당 1행: 암호화된 API Key만 저장 (평문/키 절대 저장 안 함)
  await pool.execute(`
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
      FOREIGN KEY (user_id) REFERENCES akashaalt_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 볼트 비밀번호 변경/초기화용 이메일 인증 코드
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_vault_reset_tokens (
      user_id    INT UNSIGNED NOT NULL PRIMARY KEY,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used       TINYINT(1) NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES akashaalt_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log("[DB] AkashaAlt MySQL 초기화 완료");
}

export interface AkashaAltUserRow {
  id: number;
  akademiya_user_id: number;
  akademiya_email: string | null;
  display_name: string;
}

/** OpenOAuth sub(akademiya_user_id) 기준으로 로컬 사용자를 생성하거나 최신 프로필로 갱신 */
export async function upsertUserByAkademiyaId(
  akademiyaUserId: number,
  akademiyaEmail: string | null,
  displayName: string
): Promise<AkashaAltUserRow> {
  await pool.execute(
    `INSERT INTO akashaalt_users (akademiya_user_id, akademiya_email, display_name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE akademiya_email = VALUES(akademiya_email), display_name = VALUES(display_name)`,
    [akademiyaUserId, akademiyaEmail, displayName]
  );
  const [rows] = await pool.query(
    "SELECT id, akademiya_user_id, akademiya_email, display_name FROM akashaalt_users WHERE akademiya_user_id = ?",
    [akademiyaUserId]
  );
  return (rows as AkashaAltUserRow[])[0];
}
