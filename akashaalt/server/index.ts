import express, { type Request, type Response, type NextFunction } from "express";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { pool, initDb, upsertUserByAkademiyaId } from "./db.js";
import { generateSessionToken, verifySessionToken, hashToken, generateResetCode } from "./token.js";
import {
  createVault, tryUnlockVault, encryptWithKey, decryptWithKey, ENC_VERSION,
  type KdfParams, type EncryptedBlob,
} from "./vaultCrypto.js";
import { setUnlockedKey, getUnlockedKey, clearUnlockedKey } from "./vaultSession.js";
import { streamChat, type AiProvider } from "./aiProviders.js";
import { sendVaultCodeEmail } from "./email.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3003;
const AKADEMIYA_API_URL = process.env.AKADEMIYA_API_URL || "https://akademiya.kr/api";
const AI_OAUTH_CLIENT_ID = process.env.AI_OAUTH_CLIENT_ID || "";
const AI_OAUTH_CLIENT_SECRET = process.env.AI_OAUTH_CLIENT_SECRET || "";
const AI_OAUTH_AUTHORIZE_URL = process.env.AI_OAUTH_AUTHORIZE_URL || "https://akademiya.kr/oauth/authorize";
const AI_OAUTH_REDIRECT_URI = process.env.AI_OAUTH_REDIRECT_URI || "https://ai.akademiya.kr/auth/callback";
const AI_OAUTH_SCOPE = "openid profile email";
const AI_PROVIDERS = ["openrouter", "openai", "gemini", "anthropic"] as const;
const RESET_CODE_TTL_MIN = 15;

type Row = Record<string, unknown>;

initDb().catch((err) => console.error("[DB 초기화 실패]", err));

// ════════════════════════════════════════════════════════════════════════
// 인증 — Akademiya OpenOAuth(서드파티 클라이언트)로 로그인 후 자체 세션 발급
// ════════════════════════════════════════════════════════════════════════

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifySessionToken(authHeader.slice(7));
  if (!payload) { res.status(401).json({ error: "Invalid or expired token" }); return; }
  req.user = payload;
  next();
}

// 프론트엔드가 인가 URL을 직접 구성할 수 있도록 클라이언트 설정(비밀 정보 제외) 제공
app.get("/api/oauth-config", (_req: Request, res: Response) => {
  res.json({
    clientId: AI_OAUTH_CLIENT_ID,
    authorizeUrl: AI_OAUTH_AUTHORIZE_URL,
    redirectUri: AI_OAUTH_REDIRECT_URI,
    scope: AI_OAUTH_SCOPE,
  });
});

app.post("/api/oauth-callback", async (req: Request, res: Response) => {
  const { code, codeVerifier } = req.body as { code?: string; codeVerifier?: string };
  if (!code || !codeVerifier) { res.status(400).json({ error: "MISSING_PARAMS" }); return; }

  try {
    const tokenRes = await fetch(`${AKADEMIYA_API_URL}/openoauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantType: "authorization_code",
        clientId: AI_OAUTH_CLIENT_ID,
        clientSecret: AI_OAUTH_CLIENT_SECRET,
        code,
        redirectUri: AI_OAUTH_REDIRECT_URI,
        codeVerifier,
      }),
    });
    if (!tokenRes.ok) { res.status(401).json({ error: "TOKEN_EXCHANGE_FAILED" }); return; }
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

    const userinfoRes = await fetch(`${AKADEMIYA_API_URL}/openoauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userinfoRes.ok) { res.status(401).json({ error: "USERINFO_FAILED" }); return; }
    const { sub, name, email } = (await userinfoRes.json()) as { sub: string; name?: string; email?: string };
    const akademiyaUserId = Number(sub);
    if (!akademiyaUserId) { res.status(401).json({ error: "INVALID_USERINFO" }); return; }

    const displayName = name || email?.split("@")[0] || "";
    const user = await upsertUserByAkademiyaId(akademiyaUserId, email ?? null, displayName);

    const sessionToken = generateSessionToken({
      id: user.id, email: user.akademiya_email, displayName: user.display_name,
    });
    res.json({
      accessToken: sessionToken,
      user: { id: user.id, email: user.akademiya_email, displayName: user.display_name },
    });
  } catch (err) {
    console.error("[oauth-callback]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ════════════════════════════════════════════════════════════════════════
// 채팅 기록 (대화/메시지)
// ════════════════════════════════════════════════════════════════════════

app.get("/api/ai/conversations", requireAuth, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, server_url, model_id, created_at, updated_at
       FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`,
      [req.user!.id]
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error("[ai/conversations GET]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/ai/conversations", requireAuth, async (req: Request, res: Response) => {
  const { title, serverUrl, modelId } = req.body as { title?: string; serverUrl?: string; modelId?: string };
  try {
    const [result] = await pool.query(
      `INSERT INTO ai_conversations (user_id, title, server_url, model_id) VALUES (?, ?, ?, ?)`,
      [req.user!.id, (title || "새 대화").slice(0, 200), serverUrl || "", modelId || ""]
    );
    const id = (result as { insertId: number }).insertId;
    const [rows] = await pool.query(
      `SELECT id, title, server_url, model_id, created_at, updated_at FROM ai_conversations WHERE id = ?`,
      [id]
    );
    res.status(201).json((rows as unknown[])[0]);
  } catch (err) {
    console.error("[ai/conversations POST]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.patch("/api/ai/conversations/:id", requireAuth, async (req: Request, res: Response) => {
  const convId = Number(req.params.id);
  const { title } = req.body as { title?: string };
  try {
    const [check] = await pool.query(
      `SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?`,
      [convId, req.user!.id]
    );
    if ((check as unknown[]).length === 0) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    if (title !== undefined) {
      await pool.query(`UPDATE ai_conversations SET title = ? WHERE id = ?`, [title.slice(0, 200), convId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai/conversations PATCH]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.delete("/api/ai/conversations/:id", requireAuth, async (req: Request, res: Response) => {
  const convId = Number(req.params.id);
  try {
    const [result] = await pool.query(
      `DELETE FROM ai_conversations WHERE id = ? AND user_id = ?`,
      [convId, req.user!.id]
    );
    if ((result as { affectedRows: number }).affectedRows === 0) {
      res.status(404).json({ error: "NOT_FOUND" }); return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai/conversations DELETE]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.get("/api/ai/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
  const convId = Number(req.params.id);
  try {
    const [check] = await pool.query(
      `SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?`,
      [convId, req.user!.id]
    );
    if ((check as unknown[]).length === 0) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    const [messages] = await pool.query(
      `SELECT id, role, content, model_id, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC`,
      [convId]
    );
    res.json({ messages });
  } catch (err) {
    console.error("[ai/messages GET]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/ai/conversations/:id/messages", requireAuth, async (req: Request, res: Response) => {
  const convId = Number(req.params.id);
  const { role, content, modelId } = req.body as { role?: string; content?: string; modelId?: string };
  if (!role || !content || !["user", "assistant"].includes(role)) {
    res.status(400).json({ error: "MISSING_FIELDS" }); return;
  }
  try {
    const [check] = await pool.query(
      `SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?`,
      [convId, req.user!.id]
    );
    if ((check as unknown[]).length === 0) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    const [result] = await pool.query(
      `INSERT INTO ai_messages (conversation_id, role, content, model_id) VALUES (?, ?, ?, ?)`,
      [convId, role, content, modelId || null]
    );
    await pool.query(`UPDATE ai_conversations SET updated_at = NOW() WHERE id = ?`, [convId]);
    const msgId = (result as { insertId: number }).insertId;
    res.status(201).json({ id: msgId });
  } catch (err) {
    console.error("[ai/messages POST]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ════════════════════════════════════════════════════════════════════════
// LLM 추론 (Local Server 프록시 / API 모드)
// ════════════════════════════════════════════════════════════════════════

// URL 기본 검증 — 메타데이터 서버(169.254.x.x)와 루프백만 차단, 그 외 허용
function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "169.254.169.254" || h === "::1" || h === "localhost") return false;
    return true;
  } catch {
    return false;
  }
}

app.get("/api/ai/models", requireAuth, async (req: Request, res: Response) => {
  const serverUrl = req.query.serverUrl as string;
  if (!serverUrl || !isValidUrl(serverUrl)) {
    res.status(400).json({ error: "INVALID_SERVER_URL" }); return;
  }
  try {
    const base = serverUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/api/models`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`LLM_SERVER_${response.status}`);
    const data = (await response.json()) as unknown;
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "CONNECTION_FAILED";
    res.status(503).json({ error: msg.startsWith("LLM_SERVER") ? "LLM_SERVER_ERROR" : "CONNECTION_FAILED" });
  }
});

app.post("/api/ai/infer", requireAuth, async (req: Request, res: Response) => {
  const { serverUrl, modelId, messages } = req.body as {
    serverUrl?: string; modelId?: string; messages?: Array<{ role: string; content: string }>;
  };

  if (!serverUrl || !isValidUrl(serverUrl) || !modelId || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "MISSING_FIELDS" }); return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const base = serverUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/api/infer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId, messages }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok || !response.body) {
      res.write(`data: ${JSON.stringify({ type: "error", error: "LLM_SERVER_ERROR" })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    console.error("[ai/infer]", err);
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    res.write(`data: ${JSON.stringify({ type: "error", error: isTimeout ? "TIMEOUT" : "CONNECTION_FAILED" })}\n\n`);
  } finally {
    res.end();
  }
});

app.post("/api/ai/infer-api", requireAuth, async (req: Request, res: Response) => {
  const { provider, modelId, messages } = req.body as {
    provider?: string; modelId?: string; messages?: Array<{ role: string; content: string }>;
  };

  if (!provider || !AI_PROVIDERS.includes(provider as AiProvider) || !modelId ||
      !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "MISSING_FIELDS" }); return;
  }

  const unlockedKey = getUnlockedKey(req.user!.id);
  if (!unlockedKey) { res.status(423).json({ error: "VAULT_LOCKED" }); return; }

  let apiKey: string;
  try {
    const [rows] = await pool.query(
      `SELECT ciphertext, nonce, auth_tag FROM ai_api_keys WHERE user_id = ? AND provider = ?`,
      [req.user!.id, provider]
    );
    const keys = rows as { ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer }[];
    if (keys.length === 0) { res.status(404).json({ error: "PROVIDER_KEY_NOT_SET" }); return; }
    apiKey = decryptWithKey(unlockedKey, {
      ciphertext: keys[0].ciphertext, nonce: keys[0].nonce, authTag: keys[0].auth_tag,
    });
  } catch (err) {
    console.error("[ai/infer-api] key decrypt failed", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "KEY_DECRYPTION_FAILED" }); return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const ac = new AbortController();
  req.on("close", () => ac.abort());
  const timeout = setTimeout(() => ac.abort(), 120_000);

  try {
    for await (const chunk of streamChat(provider as AiProvider, apiKey, modelId, messages as never, ac.signal)) {
      res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (err) {
    // provider 에러 메시지에 API Key가 섞여 나올 수 있으므로 원문을 클라이언트/로그에 노출하지 않는다
    console.error("[ai/infer-api] provider stream failed", provider);
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (!isAbort) {
      res.write(`data: ${JSON.stringify({ type: "error", error: "PROVIDER_ERROR" })}\n\n`);
    }
  } finally {
    clearTimeout(timeout);
    apiKey = "";
    res.end();
  }
});

// ════════════════════════════════════════════════════════════════════════
// API Key Zero-Knowledge Vault
// ════════════════════════════════════════════════════════════════════════

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
    salt: row.kdf_salt, timeCost: row.kdf_time_cost,
    memoryCost: row.kdf_memory_cost, parallelism: row.kdf_parallelism,
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

app.get("/api/ai/vault/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const vault = await getVaultRow(req.user!.id);
    const [keyRows] = await pool.query(`SELECT provider FROM ai_api_keys WHERE user_id = ?`, [req.user!.id]);
    const providers = (keyRows as { provider: string }[]).map((r) => r.provider);
    res.json({ hasVault: !!vault, unlocked: !!getUnlockedKey(req.user!.id), providers });
  } catch (err) {
    console.error("[ai/vault/status]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/ai/vault/setup", requireAuth, async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password || password.length < 8) { res.status(400).json({ error: "PASSWORD_TOO_SHORT" }); return; }

  try {
    const existing = await getVaultRow(req.user!.id);
    if (existing) { res.status(409).json({ error: "VAULT_ALREADY_EXISTS" }); return; }

    const { params, canary } = await createVault(password);
    await pool.query(
      `INSERT INTO ai_vaults
        (user_id, kdf_salt, kdf_time_cost, kdf_memory_cost, kdf_parallelism, enc_version,
         canary_ciphertext, canary_nonce, canary_tag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user!.id, params.salt, params.timeCost, params.memoryCost, params.parallelism,
        ENC_VERSION, canary.ciphertext, canary.nonce, canary.authTag,
      ]
    );

    const key = await tryUnlockVault(password, params, canary);
    if (key) setUnlockedKey(req.user!.id, key);

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[ai/vault/setup]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/ai/vault/unlock", requireAuth, async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (!password) { res.status(400).json({ error: "MISSING_FIELDS" }); return; }

  try {
    const vault = await getVaultRow(req.user!.id);
    if (!vault) { res.status(404).json({ error: "VAULT_NOT_SETUP" }); return; }

    const key = await tryUnlockVault(password, toParams(vault), toCanary(vault));
    if (!key) { res.status(401).json({ error: "WRONG_PASSWORD" }); return; }

    setUnlockedKey(req.user!.id, key);
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai/vault/unlock]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/ai/vault/lock", requireAuth, (req: Request, res: Response) => {
  clearUnlockedKey(req.user!.id);
  res.json({ ok: true });
});

app.get("/api/ai/vault/keys", requireAuth, async (req: Request, res: Response) => {
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

app.post("/api/ai/vault/keys", requireAuth, async (req: Request, res: Response) => {
  const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
  if (!provider || !AI_PROVIDERS.includes(provider as AiProvider) || !apiKey) {
    res.status(400).json({ error: "MISSING_FIELDS" }); return;
  }

  const key = getUnlockedKey(req.user!.id);
  if (!key) { res.status(423).json({ error: "VAULT_LOCKED" }); return; }

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

app.delete("/api/ai/vault/keys/:provider", requireAuth, async (req: Request, res: Response) => {
  const provider = req.params.provider;
  if (!AI_PROVIDERS.includes(provider as AiProvider)) { res.status(400).json({ error: "UNSUPPORTED_PROVIDER" }); return; }
  try {
    const [result] = await pool.query(
      `DELETE FROM ai_api_keys WHERE user_id = ? AND provider = ?`,
      [req.user!.id, provider]
    );
    if ((result as { affectedRows: number }).affectedRows === 0) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error("[ai/vault/keys DELETE]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

app.post("/api/ai/vault/request-code", requireAuth, async (req: Request, res: Response) => {
  res.json({ ok: true }); // 항상 200 (열거 방지 관례 유지)

  try {
    const [rows] = await pool.query("SELECT akademiya_email FROM akashaalt_users WHERE id = ?", [req.user!.id]);
    const users = rows as { akademiya_email: string | null }[];
    if (users.length === 0 || !users[0].akademiya_email) return;

    const email = users[0].akademiya_email;
    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000);

    await pool.query(
      `INSERT INTO ai_vault_reset_tokens (user_id, token_hash, expires_at, used)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), used = 0`,
      [req.user!.id, hashToken(code)]
    );

    await sendVaultCodeEmail(email, code);
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

app.post("/api/ai/vault/change-password", requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword, code } = req.body as {
    currentPassword?: string; newPassword?: string; code?: string;
  };
  if (!currentPassword || !newPassword || !code) { res.status(400).json({ error: "MISSING_FIELDS" }); return; }
  if (newPassword.length < 8) { res.status(400).json({ error: "PASSWORD_TOO_SHORT" }); return; }

  const conn = await pool.getConnection();
  try {
    const codeOk = await consumeVaultCode(req.user!.id, code);
    if (!codeOk) { res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" }); return; }

    const vault = await getVaultRow(req.user!.id);
    if (!vault) { res.status(404).json({ error: "VAULT_NOT_SETUP" }); return; }

    const oldKey = await tryUnlockVault(currentPassword, toParams(vault), toCanary(vault));
    if (!oldKey) { res.status(401).json({ error: "WRONG_PASSWORD" }); return; }

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
      res.status(400).json({ error: "DECRYPTION_FAILED" }); return;
    } finally {
      oldKey.fill(0);
    }

    const { params, canary } = await createVault(newPassword);
    const newKey = await tryUnlockVault(newPassword, params, canary);
    if (!newKey) { res.status(500).json({ error: "SERVER_ERROR" }); return; }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE ai_vaults SET kdf_salt = ?, kdf_time_cost = ?, kdf_memory_cost = ?, kdf_parallelism = ?,
        enc_version = ?, canary_ciphertext = ?, canary_nonce = ?, canary_tag = ?
       WHERE user_id = ?`,
      [
        params.salt, params.timeCost, params.memoryCost, params.parallelism,
        ENC_VERSION, canary.ciphertext, canary.nonce, canary.authTag, req.user!.id,
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

app.post("/api/ai/vault/reset", requireAuth, async (req: Request, res: Response) => {
  const { newPassword, code } = req.body as { newPassword?: string; code?: string };
  if (!newPassword || !code) { res.status(400).json({ error: "MISSING_FIELDS" }); return; }
  if (newPassword.length < 8) { res.status(400).json({ error: "PASSWORD_TOO_SHORT" }); return; }

  const conn = await pool.getConnection();
  try {
    const codeOk = await consumeVaultCode(req.user!.id, code);
    if (!codeOk) { res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" }); return; }

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

// ════════════════════════════════════════════════════════════════════════
// 헬스체크 + 정적 파일(SPA)
// ════════════════════════════════════════════════════════════════════════

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const distPath = join(__dirname, "..", "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req: Request, res: Response) => {
    if (req.method !== "GET") { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.sendFile(join(distPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[akashaalt] listening on port ${PORT}`);
});
