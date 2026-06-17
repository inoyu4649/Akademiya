import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { vapidPublicKey } from "../lib/push.js";

const router: IRouter = Router();

// GET /api/push/vapid-public-key
router.get("/vapid-public-key", (_req, res) => {
  if (!vapidPublicKey) {
    res.status(503).json({ error: "push.notConfigured" });
    return;
  }
  res.json({ publicKey: vapidPublicKey });
});

// POST /api/push/subscribe
router.post("/subscribe", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "push.missingFields" });
    return;
  }

  await pool.execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [userId, endpoint, keys.p256dh, keys.auth]
  );

  res.status(201).json({ ok: true });
});

// DELETE /api/push/unsubscribe
router.delete("/unsubscribe", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    res.status(400).json({ error: "push.missingEndpoint" });
    return;
  }

  await pool.execute(
    "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
    [userId, endpoint]
  );

  res.json({ ok: true });
});

export default router;
