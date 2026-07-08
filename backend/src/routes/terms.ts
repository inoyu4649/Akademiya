import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

export const TERMS_OF_USE_VERSION = 3;

// GET /terms/version
router.get("/version", (_req, res) => {
  res.json({ version: TERMS_OF_USE_VERSION });
});

// GET /terms/check — 로그인 사용자의 동의 버전 확인
router.get("/check", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT version FROM terms_consents WHERE user_id = ? AND service = 'akademiya'",
      [req.user!.id]
    );
    const consented = (rows as { version: number }[])[0]?.version ?? 0;
    res.json({
      consented,
      current: TERMS_OF_USE_VERSION,
      needsConsent: consented < TERMS_OF_USE_VERSION,
    });
  } catch (err) {
    console.error("[terms/check]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// POST /terms/consent — 동의 저장
router.post("/consent", requireAuth, async (req, res) => {
  const { version } = req.body as { version: number };
  if (!version || version !== TERMS_OF_USE_VERSION) {
    res.status(400).json({ error: "INVALID_VERSION" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO terms_consents (user_id, service, version)
       VALUES (?, 'akademiya', ?)
       ON DUPLICATE KEY UPDATE version = VALUES(version), consented_at = NOW()`,
      [req.user!.id, version]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[terms/consent]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export default router;
