import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { getHolidays } from "../utils/holidays.js";

const router: IRouter = Router();

// ── GET /api/calendar?year=&month= ──────────────────────────────────────────
// 로그인 사용자가 가입한 모든 반의 해당 월 과제 마감일 목록
router.get("/", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const year   = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month  = parseInt(String(req.query.month ?? (new Date().getMonth() + 1)), 10);

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

// ── GET /api/calendar/holidays?year=&month= ──────────────────────────────────
// 한국천문연구원 공휴일 (캐시)
router.get("/holidays", requireAuth, async (req, res) => {
  const year  = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? (new Date().getMonth() + 1)), 10);

  const holidays = await getHolidays(year, month);
  res.json({ holidays });
});

// ── GET /api/calendar/events?year=&month= ────────────────────────────────────
// 사용자가 가입한 반/조직의 이벤트 목록
router.get("/events", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const year   = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month  = parseInt(String(req.query.month ?? (new Date().getMonth() + 1)), 10);

  const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay  = new Date(year, month, 0).getDate();
  const endStr   = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // 반 이벤트 (가입한 반)
  // DATE_FORMAT: mysql2가 DATE 타입을 Date 객체로 변환해 ISO 직렬화하는 현상 방지
  const [classEvents] = await pool.execute(
    `SELECT ce.id, ce.scope_type, ce.scope_id, ce.title,
            DATE_FORMAT(ce.event_date, '%Y-%m-%d') AS event_date,
            ce.description, ce.color,
            c.name AS scope_name, u.display_name AS creator_name
     FROM calendar_events ce
     JOIN classes c ON c.id = ce.scope_id
     JOIN class_members cm ON cm.class_id = ce.scope_id AND cm.user_id = ?
     LEFT JOIN users u ON u.id = ce.creator_id
     WHERE ce.scope_type = 'class' AND ce.event_date BETWEEN ? AND ?
     ORDER BY ce.event_date ASC`,
    [userId, startStr, endStr]
  ) as any[];

  // 조직 이벤트 (가입한 조직)
  const [orgEvents] = await pool.execute(
    `SELECT ce.id, ce.scope_type, ce.scope_id, ce.title,
            DATE_FORMAT(ce.event_date, '%Y-%m-%d') AS event_date,
            ce.description, ce.color,
            o.name AS scope_name, u.display_name AS creator_name
     FROM calendar_events ce
     JOIN organizations o ON o.id = ce.scope_id
     JOIN org_members om ON om.org_id = ce.scope_id AND om.user_id = ?
     LEFT JOIN users u ON u.id = ce.creator_id
     WHERE ce.scope_type = 'org' AND ce.event_date BETWEEN ? AND ?
     ORDER BY ce.event_date ASC`,
    [userId, startStr, endStr]
  ) as any[];

  res.json({ events: [...(classEvents as any[]), ...(orgEvents as any[])] });
});

// ── POST /api/calendar/events ─────────────────────────────────────────────────
// 이벤트 생성 (반장 perm≥1 / 조직 관리자 perm≥3)
router.post("/events", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const { scope_type, scope_id, title, event_date, description, color } =
    req.body as Record<string, string>;

  if (!scope_type || !scope_id || !title?.trim() || !event_date) {
    res.status(400).json({ error: "calendar.event.missingFields" });
    return;
  }
  if (!["org", "class"].includes(scope_type)) {
    res.status(400).json({ error: "calendar.event.invalidScope" });
    return;
  }

  const sid = Number(scope_id);

  // 권한 확인
  if (scope_type === "class") {
    const [rows] = await pool.execute(
      "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
      [sid, userId]
    ) as any[];
    if (!(rows as any[]).length || (rows as any[])[0].permission < 1) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
  } else {
    const [rows] = await pool.execute(
      "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
      [sid, userId]
    ) as any[];
    if (!(rows as any[]).length || (rows as any[])[0].permission < 3) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
  }

  await pool.execute(
    `INSERT INTO calendar_events (scope_type, scope_id, creator_id, title, event_date, description, color)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      scope_type,
      sid,
      userId,
      title.trim(),
      event_date,
      description?.trim() || null,
      color?.trim() || "#4f7cff",
    ]
  );

  res.status(201).json({ message: "created" });
});

// ── DELETE /api/calendar/events/:id ──────────────────────────────────────────
// 이벤트 삭제 (생성자 or 반장/조직관리자)
router.delete("/events/:id", requireAuth, async (req, res) => {
  const userId  = (req as any).user.id;
  const eventId = Number(req.params.id);

  const [rows] = await pool.execute(
    "SELECT * FROM calendar_events WHERE id = ?",
    [eventId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const ev = (rows as any[])[0];

  // 생성자 본인이면 삭제 가능
  if (ev.creator_id === userId) {
    await pool.execute("DELETE FROM calendar_events WHERE id = ?", [eventId]);
    res.json({ message: "deleted" });
    return;
  }

  // 반장/조직관리자도 삭제 가능
  if (ev.scope_type === "class") {
    const [pm] = await pool.execute(
      "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
      [ev.scope_id, userId]
    ) as any[];
    if ((pm as any[]).length && (pm as any[])[0].permission >= 1) {
      await pool.execute("DELETE FROM calendar_events WHERE id = ?", [eventId]);
      res.json({ message: "deleted" });
      return;
    }
  } else {
    const [pm] = await pool.execute(
      "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
      [ev.scope_id, userId]
    ) as any[];
    if ((pm as any[]).length && (pm as any[])[0].permission >= 3) {
      await pool.execute("DELETE FROM calendar_events WHERE id = ?", [eventId]);
      res.json({ message: "deleted" });
      return;
    }
  }

  res.status(403).json({ error: "forbidden" });
});

// ── GET /api/calendar/my-scopes ───────────────────────────────────────────────
// 이벤트 추가 가능한 반/조직 목록 (반장 또는 조직관리자)
router.get("/my-scopes", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;

  const [classes] = await pool.execute(
    `SELECT c.id, c.name, 'class' AS scope_type, cm.permission
     FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     WHERE cm.user_id = ? AND cm.permission >= 1`,
    [userId]
  ) as any[];

  const [orgs] = await pool.execute(
    `SELECT o.id, o.name, 'org' AS scope_type, om.permission
     FROM org_members om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = ? AND om.permission >= 3`,
    [userId]
  ) as any[];

  res.json({ scopes: [...(classes as any[]), ...(orgs as any[])] });
});

export default router;
