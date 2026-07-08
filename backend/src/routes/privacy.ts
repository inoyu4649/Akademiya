import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

export const PRIVACY_POLICY_VERSION = 3;

// GET /privacy/version
router.get("/version", (_req, res) => {
  res.json({ version: PRIVACY_POLICY_VERSION });
});

// GET /privacy/check — 로그인 사용자의 동의 버전 확인
router.get("/check", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT version FROM privacy_consents WHERE user_id = ? AND service = 'akademiya'",
      [req.user!.id]
    );
    const consented = (rows as { version: number }[])[0]?.version ?? 0;
    res.json({
      consented,
      current: PRIVACY_POLICY_VERSION,
      needsConsent: consented < PRIVACY_POLICY_VERSION,
    });
  } catch (err) {
    console.error("[privacy/check]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// POST /privacy/consent — 동의 저장
router.post("/consent", requireAuth, async (req, res) => {
  const { version } = req.body as { version: number };
  if (!version || version !== PRIVACY_POLICY_VERSION) {
    res.status(400).json({ error: "INVALID_VERSION" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO privacy_consents (user_id, service, version)
       VALUES (?, 'akademiya', ?)
       ON DUPLICATE KEY UPDATE version = VALUES(version), consented_at = NOW()`,
      [req.user!.id, version]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[privacy/consent]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export default router;
