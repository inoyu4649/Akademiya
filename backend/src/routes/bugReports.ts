import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// POST /api/bug-reports — 버그 리포트 제출
router.post("/", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { title, body, browser, os } = req.body as {
    title?: string;
    body?: string;
    browser?: string;
    os?: string;
  };

  if (!title?.trim() || !body?.trim()) {
    res.status(400).json({ error: "missingFields" });
    return;
  }

  await pool.execute(
    "INSERT INTO bug_reports (user_id, title, body, browser, os) VALUES (?, ?, ?, ?, ?)",
    [userId, title.trim(), body.trim(), browser?.trim() ?? null, os?.trim() ?? null]
  );

  res.status(201).json({ message: "submitted" });
});

// GET /api/bug-reports/my — 내 제출 목록
router.get("/my", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const [rows] = await pool.execute(
    `SELECT id, title, status, created_at, admin_note
     FROM bug_reports
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  ) as any[];
  res.json({ reports: rows });
});

export default router;
