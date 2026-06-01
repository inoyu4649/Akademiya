import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// ── GET /api/notifications — 내 알림 목록 (최근 50개, 읽지 않은 수 포함) ────
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const [rows] = await pool.execute(
    `SELECT id, type, title, body, link, is_read, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  ) as any[];

  const [countRows] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0",
    [userId]
  ) as any[];

  res.json({
    notifications: rows as any[],
    unreadCount: Number((countRows as any[])[0].cnt),
  });
});

// ── PATCH /api/notifications/read-all — 전체 읽음 처리 ───────────────────────
// 반드시 /:id/read 보다 먼저 선언
router.patch("/read-all", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  await pool.execute(
    "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
    [userId]
  );

  res.json({ message: "ok" });
});

// ── PATCH /api/notifications/:id/read — 단일 읽음 처리 ───────────────────────
router.patch("/:id/read", requireAuth, async (req, res) => {
  const userId  = req.user!.id;
  const notifId = Number(req.params.id);

  await pool.execute(
    "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
    [notifId, userId]
  );

  res.json({ message: "ok" });
});

// ── DELETE /api/notifications/:id — 알림 단일 삭제 ───────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const userId  = req.user!.id;
  const notifId = Number(req.params.id);

  await pool.execute(
    "DELETE FROM notifications WHERE id = ? AND user_id = ?",
    [notifId, userId]
  );

  res.json({ message: "ok" });
});

// ── DELETE /api/notifications — 읽은 알림 전체 삭제 ──────────────────────────
router.delete("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  await pool.execute(
    "DELETE FROM notifications WHERE user_id = ? AND is_read = 1",
    [userId]
  );

  res.json({ message: "ok" });
});

// ── POST /api/notifications/broadcast — 브로드캐스트 ─────────────────────────
// body: { title, body?, link?, scope: "class"|"org"|"all", scope_id?: number }
router.post("/broadcast", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const {
    title,
    body: msgBody,
    link,
    scope,
    scope_id,
  } = req.body as {
    title: string;
    body?: string;
    link?: string;
    scope: "class" | "org" | "all";
    scope_id?: number;
  };

  if (!title?.trim() || !scope) {
    res.status(400).json({ error: "notification.broadcast.missingFields" });
    return;
  }

  let targetUserIds: number[] = [];

  if (scope === "class") {
    if (!scope_id) {
      res.status(400).json({ error: "notification.broadcast.missingScope" });
      return;
    }
    // 반장(permission>=1) 확인
    const [permRows] = await pool.execute(
      "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
      [scope_id, userId]
    ) as any[];
    if (!(permRows as any[]).length || (permRows as any[])[0].permission < 1) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const [members] = await pool.execute(
      "SELECT user_id FROM class_members WHERE class_id = ?",
      [scope_id]
    ) as any[];
    targetUserIds = (members as any[]).map((m: any) => m.user_id as number);

  } else if (scope === "org") {
    if (!scope_id) {
      res.status(400).json({ error: "notification.broadcast.missingScope" });
      return;
    }
    // 조직 관리자(perm>=3) 확인
    const [permRows] = await pool.execute(
      "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
      [scope_id, userId]
    ) as any[];
    if (!(permRows as any[]).length || (permRows as any[])[0].permission < 3) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const [members] = await pool.execute(
      "SELECT user_id FROM org_members WHERE org_id = ?",
      [scope_id]
    ) as any[];
    targetUserIds = (members as any[]).map((m: any) => m.user_id as number);

  } else if (scope === "all") {
    // Akademiya admin(role='admin')만 가능
    const [userRows] = await pool.execute(
      "SELECT role FROM users WHERE id = ?",
      [userId]
    ) as any[];
    if (!(userRows as any[]).length || (userRows as any[])[0].role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const [allUsers] = await pool.execute("SELECT id FROM users") as any[];
    targetUserIds = (allUsers as any[]).map((u: any) => u.id as number);

  } else {
    res.status(400).json({ error: "notification.broadcast.invalidScope" });
    return;
  }

  if (targetUserIds.length === 0) {
    res.json({ message: "ok", sent: 0 });
    return;
  }

  // 일괄 INSERT
  const placeholders = targetUserIds.map(() => "(?, 'broadcast', ?, ?, ?)").join(", ");
  const params: (string | number | null)[] = [];
  for (const uid of targetUserIds) {
    params.push(uid, title.trim(), msgBody?.trim() || null, link?.trim() || null);
  }
  await pool.execute(
    `INSERT INTO notifications (user_id, type, title, body, link) VALUES ${placeholders}`,
    params
  );

  res.json({ message: "ok", sent: targetUserIds.length });
});

export default router;
