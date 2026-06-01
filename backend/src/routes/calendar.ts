import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// GET /api/calendar?year=2026&month=5
// 로그인 사용자가 가입한 모든 반의 해당 월 과제 마감일 목록
router.get("/", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const year  = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? (new Date().getMonth() + 1)), 10);

  const startStr = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
  const lastDay  = new Date(year, month, 0).getDate();
  const endStr   = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")} 23:59:59`;

  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.due_at, a.class_id, c.name AS class_name
     FROM assignments a
     JOIN class_members cm ON cm.class_id = a.class_id AND cm.user_id = ?
     JOIN classes c ON c.id = a.class_id
     WHERE a.due_at BETWEEN ? AND ?
     ORDER BY a.due_at ASC`,
    [userId, startStr, endStr]
  ) as any[];

  res.json({ events: rows });
});

export default router;
