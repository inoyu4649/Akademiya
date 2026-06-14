import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// 국외 이전 동의 버전 — 처리방침 제7조(국외 이전) 내용이 중대하게 변경되면 +1
export const INTL_TRANSFER_VERSION = 1;

// GET /intl-transfer/version
router.get("/version", (_req, res) => {
  res.json({ version: INTL_TRANSFER_VERSION });
});

// GET /intl-transfer/check — 로그인 사용자의 동의 버전 확인
router.get("/check", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT version FROM intl_transfer_consents WHERE user_id = ? AND service = 'akademiya'",
      [req.user!.id]
    );
    const consented = (rows as { version: number }[])[0]?.version ?? 0;
    res.json({
      consented,
      current: INTL_TRANSFER_VERSION,
      needsConsent: consented < INTL_TRANSFER_VERSION,
    });
  } catch (err) {
    console.error("[intl-transfer/check]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// POST /intl-transfer/consent — 동의 저장
router.post("/consent", requireAuth, async (req, res) => {
  const { version } = req.body as { version: number };
  if (!version || version !== INTL_TRANSFER_VERSION) {
    res.status(400).json({ error: "INVALID_VERSION" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO intl_transfer_consents (user_id, service, version)
       VALUES (?, 'akademiya', ?)
       ON DUPLICATE KEY UPDATE version = VALUES(version), consented_at = NOW()`,
      [req.user!.id, version]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[intl-transfer/consent]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export default router;
