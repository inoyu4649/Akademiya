import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { getUnlockedKey } from "../lib/vaultSession.js";
import { decryptWithKey } from "../utils/vaultCrypto.js";
import { streamChat, type AiProvider } from "../lib/aiProviders.js";
import { AI_PROVIDERS } from "./ai-vault.js";

const router: IRouter = Router();

// provider별 큐레이션된 기본 모델 목록 (라이브 카탈로그 API 의존 없이 즉시 사용 가능)
const PROVIDER_MODELS: Record<AiProvider, Array<{ id: string; displayName: string }>> = {
  openrouter: [
    { id: "openai/gpt-4o", displayName: "GPT-4o (via OpenRouter)" },
    { id: "anthropic/claude-3.5-sonnet", displayName: "Claude 3.5 Sonnet (via OpenRouter)" },
    { id: "google/gemini-pro-1.5", displayName: "Gemini 1.5 Pro (via OpenRouter)" },
    { id: "meta-llama/llama-3.1-70b-instruct", displayName: "Llama 3.1 70B (via OpenRouter)" },
  ],
  openai: [
    { id: "gpt-4o", displayName: "GPT-4o" },
    { id: "gpt-4o-mini", displayName: "GPT-4o mini" },
    { id: "gpt-4-turbo", displayName: "GPT-4 Turbo" },
  ],
  gemini: [
    { id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash" },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-latest", displayName: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-latest", displayName: "Claude 3.5 Haiku" },
    { id: "claude-3-opus-latest", displayName: "Claude 3 Opus" },
  ],
};

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

// ── GET /api/ai/conversations ─────────────────────────────────────────────────
router.get("/conversations", requireAuth, async (req, res) => {
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

// ── POST /api/ai/conversations ────────────────────────────────────────────────
router.post("/conversations", requireAuth, async (req, res) => {
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

// ── PATCH /api/ai/conversations/:id ──────────────────────────────────────────
router.patch("/conversations/:id", requireAuth, async (req, res) => {
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

// ── DELETE /api/ai/conversations/:id ─────────────────────────────────────────
router.delete("/conversations/:id", requireAuth, async (req, res) => {
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

// ── GET /api/ai/conversations/:id/messages ───────────────────────────────────
router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
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

// ── POST /api/ai/conversations/:id/messages ───────────────────────────────────
router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
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

// ── GET /api/ai/models ── LLM 서버 모델 목록 프록시 ────────────────────────────
router.get("/models", requireAuth, async (req, res) => {
  const serverUrl = req.query.serverUrl as string;
  if (!serverUrl || !isValidUrl(serverUrl)) {
    res.status(400).json({ error: "INVALID_SERVER_URL" }); return;
  }
  try {
    const base = serverUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/api/models`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`LLM_SERVER_${response.status}`);
    const data = await response.json() as unknown;
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "CONNECTION_FAILED";
    res.status(503).json({ error: msg.startsWith("LLM_SERVER") ? "LLM_SERVER_ERROR" : "CONNECTION_FAILED" });
  }
});

// ── POST /api/ai/infer ── LLM 추론 SSE 프록시 ────────────────────────────────
router.post("/infer", requireAuth, async (req, res) => {
  const { serverUrl, modelId, messages } = req.body as {
    serverUrl?: string;
    modelId?: string;
    messages?: Array<{ role: string; content: string }>;
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

// ── GET /api/ai/models-api ── API 방식 provider별 모델 목록 ─────────────────────
router.get("/models-api", requireAuth, (req, res) => {
  const provider = req.query.provider as string;
  if (!AI_PROVIDERS.includes(provider as AiProvider)) {
    res.status(400).json({ error: "UNSUPPORTED_PROVIDER" }); return;
  }
  res.json({ models: PROVIDER_MODELS[provider as AiProvider] });
});

// ── POST /api/ai/infer-api ── API 방식 LLM 추론 SSE (OpenRouter/OpenAI/Gemini/Claude) ──
router.post("/infer-api", requireAuth, async (req, res) => {
  const { provider, modelId, messages } = req.body as {
    provider?: string;
    modelId?: string;
    messages?: Array<{ role: string; content: string }>;
  };

  if (!provider || !AI_PROVIDERS.includes(provider as AiProvider) || !modelId ||
      !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "MISSING_FIELDS" }); return;
  }

  const unlockedKey = getUnlockedKey(req.user!.id);
  if (!unlockedKey) {
    res.status(423).json({ error: "VAULT_LOCKED" }); return;
  }

  let apiKey: string;
  try {
    const [rows] = await pool.query(
      `SELECT ciphertext, nonce, auth_tag FROM ai_api_keys WHERE user_id = ? AND provider = ?`,
      [req.user!.id, provider]
    );
    const keys = rows as { ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer }[];
    if (keys.length === 0) {
      res.status(404).json({ error: "PROVIDER_KEY_NOT_SET" }); return;
    }
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

export default router;
