import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createVault,
  tryUnlockVault,
  encryptWithKey,
  decryptWithKey,
  ENC_VERSION,
  KDF_DEFAULTS,
  type KdfParams,
  type EncryptedBlob,
} from "../utils/vaultCrypto.js";
import { setUnlockedKey, getUnlockedKey, clearUnlockedKey } from "../lib/vaultSession.js";
import { generateResetCode, hashToken } from "../utils/token.js";
import { sendVaultCodeEmail } from "../utils/email.js";

const router: IRouter = Router();
const RESET_CODE_TTL_MIN = 15;

export const AI_PROVIDERS = ["openrouter", "openai", "gemini", "anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

interface VaultRow {
  kdf_salt: Buffer;
  kdf_time_cost: number;
  kdf_memory_cost: number;
  kdf_parallelism: number;
  canary_ciphertext: Buffer;
  canary_nonce: Buffer;
  canary_tag: Buffer;
}

function toParams(row: VaultRow): KdfParams {
  return {
    salt: row.kdf_salt,
    timeCost: row.kdf_time_cost,
    memoryCost: row.kdf_memory_cost,
    parallelism: row.kdf_parallelism,
  };
}

function toCanary(row: VaultRow): EncryptedBlob {
  return { ciphertext: row.canary_ciphertext, nonce: row.canary_nonce, authTag: row.canary_tag };
}

async function getVaultRow(userId: number): Promise<VaultRow | null> {
  const [rows] = await pool.query(
    `SELECT kdf_salt, kdf_time_cost, kdf_memory_cost, kdf_parallelism,
            canary_ciphertext, canary_nonce, canary_tag
     FROM ai_vaults WHERE user_id = ?`,
    [userId]
  );
  const r = rows as VaultRow[];
  return r[0] ?? null;
}

// ── GET /api/ai/vault/status ─────────────────────────────────────────────────
router.get("/status", requireAuth, async (req, res) => {
  try {
    const vault = await getVaultRow(req.user!.id);
    const [keyRows] = await pool.query(
      `SELECT provider FROM ai_api_keys WHERE user_id = ?`,
      [req.user!.id]
    );
    const providers = (keyRows as { provider: string }[]).map((r) => r.provider);
    res.json({
      hasVault: !!vault,
      unlocked: !!getUnlockedKey(req.user!.id),
      providers,
    });
  } catch (err) {
    console.error("[ai/vault/status]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ── POST /api/ai/vault/setup ── 최초 AkashaAlt API 비밀번호 설정 ────────────────
router.post("/setup", requireAuth, async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password || password.length < 8) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  try {
    const existing = await getVaultRow(req.user!.id);
    if (existing) {
      res.status(409).json({ error: "VAULT_ALREADY_EXISTS" });
      return;
    }

    const { params, canary } = await createVault(password);
    await pool.query(
      `INSERT INTO ai_vaults
        (user_id, kdf_salt, kdf_time_cost, kdf_memory_cost, kdf_parallelism, enc_version,
         canary_ciphertext, canary_nonce, canary_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user!.id,
        params.salt,
        params.timeCost,
        params.memoryCost,
        params.parallelism,
        ENC_VERSION,
        canary.ciphertext,
        canary.nonce,
        canary.authTag,
      ]
    );

    // 설정 직후 곧바로 언락된 상태로 전환 (재입력 요구하지 않음)
    const key = await tryUnlockVault(password, params, canary);
    if (key) setUnlockedKey(req.user!.id, key);

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[ai/vault/setup]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ── POST /api/ai/vault/unlock ────────────────────────────────────────────────
router.post("/unlock", requireAuth, async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }

  try {
    const vault = await getVaultRow(req.user!.id);
    if (!vault) {
      res.status(404).json({ error: "VAULT_NOT_SETUP" });
      return;
    }

    const key = await tryUnlockVault(password, toParams(vault), toCanary(vault));
    if (!key) {
      res.status(401).json({ error: "WRONG_PASSWORD" });
      return;
    }

    setUnlockedKey(req.user!.id, key);
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai/vault/unlock]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ── POST /api/ai/vault/lock ──────────────────────────────────────────────────
router.post("/lock", requireAuth, (req, res) => {
  clearUnlockedKey(req.user!.id);
  res.json({ ok: true });
});

// ── GET /api/ai/vault/keys ── 등록된 provider 목록만 반환 (키 원문 없음) ────────
router.get("/keys", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT provider, created_at, updated_at FROM ai_api_keys WHERE user_id = ?`,
      [req.user!.id]
    );
    res.json({ keys: rows });
  } catch (err) {
    console.error("[ai/vault/keys GET]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ── POST /api/ai/vault/keys ── API Key 등록/교체 (언락 상태 필요) ───────────────
router.post("/keys", requireAuth, async (req, res) => {
  const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
  if (!provider || !AI_PROVIDERS.includes(provider as AiProvider) || !apiKey) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }

  const key = getUnlockedKey(req.user!.id);
  if (!key) {
    res.status(423).json({ error: "VAULT_LOCKED" });
    return;
  }

  try {
    const blob = encryptWithKey(key, apiKey);
    await pool.query(
      `INSERT INTO ai_api_keys (user_id, provider, ciphertext, nonce, auth_tag, enc_version)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ciphertext = VALUES(ciphertext), nonce = VALUES(nonce),
         auth_tag = VALUES(auth_tag), enc_version = VALUES(enc_version)`,
      [req.user!.id, provider, blob.ciphertext, blob.nonce, blob.authTag, ENC_VERSION]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[ai/vault/keys POST]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ── DELETE /api/ai/vault/keys/:provider ──────────────────────────────────────
router.delete("/keys/:provider", requireAuth, async (req, res) => {
  const provider = req.params.provider;
  if (!AI_PROVIDERS.includes(provider as AiProvider)) {
    res.status(400).json({ error: "UNSUPPORTED_PROVIDER" });
    return;
  }
  try {
    const [result] = await pool.query(
      `DELETE FROM ai_api_keys WHERE user_id = ? AND provider = ?`,
      [req.user!.id, provider]
    );
    if ((result as { affectedRows: number }).affectedRows === 0) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai/vault/keys DELETE]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ── POST /api/ai/vault/request-code ── 비밀번호 변경/초기화용 이메일 인증코드 ────
router.post("/request-code", requireAuth, async (req, res) => {
  res.json({ ok: true }); // 항상 200 (열거 방지 관례 유지)

  try {
    const [rows] = await pool.query(
      "SELECT email, language FROM users WHERE id = ?",
      [req.user!.id]
    );
    const users = rows as { email: string; language: string | null }[];
    if (users.length === 0) return;

    const { email, language } = users[0];
    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000);

    await pool.query(
      `INSERT INTO ai_vault_reset_tokens (user_id, token_hash, expires_at, used)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), used = 0`,
      [req.user!.id, hashToken(code)]
    );

    await sendVaultCodeEmail(email, code, language || "en");
  } catch (err) {
    console.error("[ai/vault/request-code]", err);
  }
});

async function consumeVaultCode(userId: number, code: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT id FROM ai_vault_reset_tokens
     WHERE user_id = ? AND token_hash = ? AND expires_at > NOW() AND used = 0`,
    [userId, hashToken(code)]
  );
  if ((rows as unknown[]).length === 0) return false;
  await pool.query(`UPDATE ai_vault_reset_tokens SET used = 1 WHERE user_id = ?`, [userId]);
  return true;
}

// ── POST /api/ai/vault/change-password ── 기존 비밀번호를 아는 경우 ─────────────
// 이메일 인증코드 + 현재 비밀번호 확인 후, 기존 저장된 키를 전부 복호화→새 키로 재암호화.
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword, code } = req.body as {
    currentPassword?: string;
    newPassword?: string;
    code?: string;
  };
  if (!currentPassword || !newPassword || !code) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    const codeOk = await consumeVaultCode(req.user!.id, code);
    if (!codeOk) {
      res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
      return;
    }

    const vault = await getVaultRow(req.user!.id);
    if (!vault) {
      res.status(404).json({ error: "VAULT_NOT_SETUP" });
      return;
    }

    const oldKey = await tryUnlockVault(currentPassword, toParams(vault), toCanary(vault));
    if (!oldKey) {
      res.status(401).json({ error: "WRONG_PASSWORD" });
      return;
    }

    // 기존 provider 키 전부 복호화
    const [keyRows] = await conn.query(
      `SELECT id, ciphertext, nonce, auth_tag FROM ai_api_keys WHERE user_id = ?`,
      [req.user!.id]
    );
    const existingKeys = keyRows as { id: number; ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer }[];

    let decrypted: { id: number; plaintext: string }[];
    try {
      decrypted = existingKeys.map((k) => ({
        id: k.id,
        plaintext: decryptWithKey(oldKey, { ciphertext: k.ciphertext, nonce: k.nonce, authTag: k.auth_tag }),
      }));
    } catch {
      res.status(400).json({ error: "DECRYPTION_FAILED" });
      return;
    } finally {
      oldKey.fill(0);
    }

    // 새 비밀번호로 볼트 재생성 + 기존 키 재암호화
    const { params, canary } = await createVault(newPassword);
    const newKey = await tryUnlockVault(newPassword, params, canary);
    if (!newKey) {
      res.status(500).json({ error: "SERVER_ERROR" });
      return;
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE ai_vaults SET kdf_salt = ?, kdf_time_cost = ?, kdf_memory_cost = ?, kdf_parallelism = ?,
        enc_version = ?, canary_ciphertext = ?, canary_nonce = ?, canary_tag = ?
       WHERE user_id = ?`,
      [
        params.salt, params.timeCost, params.memoryCost, params.parallelism,
        ENC_VERSION, canary.ciphertext, canary.nonce, canary.authTag,
        req.user!.id,
      ]
    );
    for (const { id, plaintext } of decrypted) {
      const blob = encryptWithKey(newKey, plaintext);
      await conn.query(
        `UPDATE ai_api_keys SET ciphertext = ?, nonce = ?, auth_tag = ?, enc_version = ? WHERE id = ?`,
        [blob.ciphertext, blob.nonce, blob.authTag, ENC_VERSION, id]
      );
    }
    await conn.commit();

    setUnlockedKey(req.user!.id, newKey);
    res.json({ ok: true });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    console.error("[ai/vault/change-password]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  } finally {
    conn.release();
  }
});

// ── POST /api/ai/vault/reset ── 비밀번호를 잊은 경우(복구 불가, 재등록 필요) ─────
// 이메일 인증코드만으로 볼트를 초기화. 기존 암호화된 키는 복호화가 수학적으로
// 불가능하므로 전부 삭제되고, 사용자는 API Key를 다시 등록해야 한다.
router.post("/reset", requireAuth, async (req, res) => {
  const { newPassword, code } = req.body as { newPassword?: string; code?: string };
  if (!newPassword || !code) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    const codeOk = await consumeVaultCode(req.user!.id, code);
    if (!codeOk) {
      res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
      return;
    }

    const { params, canary } = await createVault(newPassword);

    await conn.beginTransaction();
    await conn.query(`DELETE FROM ai_api_keys WHERE user_id = ?`, [req.user!.id]);
    await conn.query(
      `INSERT INTO ai_vaults
        (user_id, kdf_salt, kdf_time_cost, kdf_memory_cost, kdf_parallelism, enc_version,
         canary_ciphertext, canary_nonce, canary_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE kdf_salt = VALUES(kdf_salt), kdf_time_cost = VALUES(kdf_time_cost),
         kdf_memory_cost = VALUES(kdf_memory_cost), kdf_parallelism = VALUES(kdf_parallelism),
         enc_version = VALUES(enc_version), canary_ciphertext = VALUES(canary_ciphertext),
         canary_nonce = VALUES(canary_nonce), canary_tag = VALUES(canary_tag)`,
      [
        req.user!.id, params.salt, params.timeCost, params.memoryCost, params.parallelism,
        ENC_VERSION, canary.ciphertext, canary.nonce, canary.authTag,
      ]
    );
    await conn.commit();

    const key = await tryUnlockVault(newPassword, params, canary);
    if (key) setUnlockedKey(req.user!.id, key);

    res.json({ ok: true, keysWiped: true });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    console.error("[ai/vault/reset]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  } finally {
    conn.release();
  }
});

export default router;
