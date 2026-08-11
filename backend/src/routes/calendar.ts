/**
 * Akademiya 달력
 *
 * v2.0에서 반(class)·과제 구조가 폐지되면서 "과제 마감일" 소스가 사라졌다.
 * 지금 달력이 표시하는 것은 두 가지다:
 *   1. 개인 일정(scope_type='personal') — 본인만 보고 본인만 편집한다.
 *   2. 조직 일정(scope_type='org')      — 가입한 조직의 관리자(perm≥3)가 등록한다.
 * 공휴일은 한국천문연구원 API를 캐시해서 함께 내려준다.
 *
 * 학사 일정(HAFS) 연동은 아직 붙이지 않았지만, 조직 일정이 그 자리를 그대로
 * 받을 수 있도록 scope 구조를 남겨두었다.
 */
import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { getHolidays } from "../utils/holidays.js";

const router: IRouter = Router();

const DEFAULT_COLOR = "#4f7cff";
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;

/** 해당 연·월의 [첫날, 마지막날] 문자열 (YYYY-MM-DD) */
function monthRange(year: number, month: number): [string, string] {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, "0")}`];
}

// ── GET /api/calendar/holidays?year=&month= ──────────────────────────────────
// 한국천문연구원 공휴일 (캐시)
router.get("/holidays", requireAuth, async (req, res) => {
  const year  = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month = parseInt(String(req.query.month ?? (new Date().getMonth() + 1)), 10);

  const holidays = await getHolidays(year, month);
  res.json({ holidays });
});

// ── GET /api/calendar/events?year=&month= ────────────────────────────────────
// 내 개인 일정 + 가입한 조직의 일정
router.get("/events", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const year   = parseInt(String(req.query.year  ?? new Date().getFullYear()), 10);
  const month  = parseInt(String(req.query.month ?? (new Date().getMonth() + 1)), 10);
  const [startStr, endStr] = monthRange(year, month);

  try {
    // 개인 일정 — scope_id에 본인 user_id를 넣어 소유자를 표현한다
    const [personalRaw] = await pool.execute(
      `SELECT ce.id, ce.scope_type, ce.scope_id, ce.title,
              DATE_FORMAT(ce.event_date, '%Y-%m-%d') AS event_date,
              ce.description, ce.color,
              NULL AS scope_name, u.display_name AS creator_name
       FROM calendar_events ce
       LEFT JOIN users u ON u.id = ce.creator_id
       WHERE ce.scope_type = 'personal' AND ce.scope_id = ?
         AND ce.event_date BETWEEN ? AND ?
       ORDER BY ce.event_date ASC`,
      [userId, startStr, endStr]
    ) as any[];

    // 조직 일정 (가입한 조직)
    const [orgEventsRaw] = await pool.execute(
      `SELECT ce.id, ce.scope_type, ce.scope_id, ce.title,
              DATE_FORMAT(ce.event_date, '%Y-%m-%d') AS event_date,
              ce.description, ce.color,
              o.name AS scope_name, u.display_name AS creator_name
       FROM calendar_events ce
       JOIN organizations o ON o.id = ce.scope_id AND ce.scope_type = 'org'
       JOIN org_members om ON om.org_id = ce.scope_id AND om.user_id = ?
       LEFT JOIN users u ON u.id = ce.creator_id
       WHERE ce.event_date BETWEEN ? AND ?
       ORDER BY ce.event_date ASC`,
      [userId, startStr, endStr]
    ) as any[];

    res.json({ events: [...(personalRaw as any[]), ...(orgEventsRaw as any[])] });
  } catch (err) {
    console.error("[calendar] GET /events 오류:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// ── POST /api/calendar/events ─────────────────────────────────────────────────
// 개인 일정은 누구나, 조직 일정은 조직 관리자(perm≥3)만 생성 가능
router.post("/events", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { scope_type, scope_id, title, event_date, description, color } =
    req.body as Record<string, string>;

  if (!scope_type || !title?.trim() || !event_date) {
    res.status(400).json({ error: "calendar.event.missingFields" });
    return;
  }
  if (!["org", "personal"].includes(scope_type)) {
    res.status(400).json({ error: "calendar.event.invalidScope" });
    return;
  }
  if (!DATE_RE.test(event_date)) {
    res.status(400).json({ error: "calendar.event.invalidDate" });
    return;
  }
  // 개인 일정의 scope_id는 클라이언트 값을 신뢰하지 않고 항상 본인 id로 강제한다
  const sid = scope_type === "personal" ? userId : Number(scope_id);
  if (scope_type === "org" && !Number.isFinite(sid)) {
    res.status(400).json({ error: "calendar.event.missingFields" });
    return;
  }

  try {
    if (scope_type === "org") {
      const [rows] = await pool.execute(
        "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
        [sid, userId]
      ) as any[];
      if (!(rows as any[]).length || (rows as any[])[0].permission < 3) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
    }

    const safeColor = color?.trim() && COLOR_RE.test(color.trim()) ? color.trim() : DEFAULT_COLOR;
    const [result] = await pool.execute(
      `INSERT INTO calendar_events (scope_type, scope_id, creator_id, title, event_date, description, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [scope_type, sid, userId, title.trim(), event_date, description?.trim() || null, safeColor]
    ) as any[];

    res.status(201).json({ id: (result as any).insertId, message: "created" });
  } catch (err) {
    console.error("[calendar] POST /events 오류:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// ── PATCH /api/calendar/events/:id — 개인 일정 수정 ──────────────────────────
router.patch("/events/:id", requireAuth, async (req, res) => {
  const userId  = req.user!.id;
  const eventId = Number(req.params.id);
  const { title, event_date, description, color } = req.body as Record<string, string>;

  const [rows] = await pool.execute(
    "SELECT scope_type, scope_id, creator_id FROM calendar_events WHERE id = ?",
    [eventId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const ev = (rows as any[])[0];

  // 개인 일정은 소유자만, 조직 일정은 조직 관리자만 수정 가능
  if (ev.scope_type === "personal") {
    if (ev.scope_id !== userId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
  } else {
    const [pm] = await pool.execute(
      "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
      [ev.scope_id, userId]
    ) as any[];
    if (!(pm as any[]).length || (pm as any[])[0].permission < 3) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
  }

  const updates: string[] = [];
  const values: any[] = [];
  if (typeof title === "string" && title.trim()) { updates.push("title = ?"); values.push(title.trim()); }
  if (typeof event_date === "string") {
    if (!DATE_RE.test(event_date)) {
      res.status(400).json({ error: "calendar.event.invalidDate" });
      return;
    }
    updates.push("event_date = ?"); values.push(event_date);
  }
  if (description !== undefined) { updates.push("description = ?"); values.push(description?.trim() || null); }
  if (typeof color === "string" && COLOR_RE.test(color.trim())) { updates.push("color = ?"); values.push(color.trim()); }

  if (updates.length === 0) {
    res.status(400).json({ error: "noChanges" });
    return;
  }

  values.push(eventId);
  await pool.execute(`UPDATE calendar_events SET ${updates.join(", ")} WHERE id = ?`, values);
  res.json({ message: "updated" });
});

// ── DELETE /api/calendar/events/:id ──────────────────────────────────────────
router.delete("/events/:id", requireAuth, async (req, res) => {
  const userId  = req.user!.id;
  const eventId = Number(req.params.id);

  const [rows] = await pool.execute(
    "SELECT scope_type, scope_id, creator_id FROM calendar_events WHERE id = ?",
    [eventId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const ev = (rows as any[])[0];

  // 개인 일정은 소유자만 삭제 가능 (creator_id가 NULL로 정리된 과거 행도 scope_id로 판별)
  if (ev.scope_type === "personal") {
    if (ev.scope_id !== userId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    await pool.execute("DELETE FROM calendar_events WHERE id = ?", [eventId]);
    res.json({ message: "deleted" });
    return;
  }

  // 조직 일정: 생성자 본인 또는 조직 관리자
  if (ev.creator_id === userId) {
    await pool.execute("DELETE FROM calendar_events WHERE id = ?", [eventId]);
    res.json({ message: "deleted" });
    return;
  }
  const [pm] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [ev.scope_id, userId]
  ) as any[];
  if ((pm as any[]).length && (pm as any[])[0].permission >= 3) {
    await pool.execute("DELETE FROM calendar_events WHERE id = ?", [eventId]);
    res.json({ message: "deleted" });
    return;
  }

  res.status(403).json({ error: "forbidden" });
});

// ── GET /api/calendar/my-scopes ───────────────────────────────────────────────
// 일정을 추가할 수 있는 대상 목록 — 항상 "개인" + 관리자인 조직들
router.get("/my-scopes", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const [orgs] = await pool.execute(
    `SELECT o.id, o.name, 'org' AS scope_type, om.permission
     FROM org_members om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = ? AND om.permission >= 3`,
    [userId]
  ) as any[];

  res.json({
    scopes: [
      { id: userId, name: null, scope_type: "personal", permission: 3 },
      ...(orgs as any[]),
    ],
  });
});

export default router;
