import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const uploadDir  = path.resolve(__dirname, "../../uploads");

const router: IRouter = Router();

async function getClassPermission(userId: number, classId: number): Promise<number | null> {
  const [rows] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
}

/** 반(classId)의 조직 타임존 조회 */
async function getClassTimezone(classId: number): Promise<string> {
  const [rows] = await pool.execute(
    "SELECT o.timezone FROM classes c JOIN organizations o ON o.id = c.org_id WHERE c.id = ?",
    [classId]
  ) as any[];
  return (rows as any[])[0]?.timezone ?? "UTC";
}

/**
 * 조직 타임존 기준 나이브 datetime 문자열("YYYY-MM-DDTHH:mm" 또는 공백 구분)을
 * UTC ISO 문자열로 변환. MySQL DATETIME 저장에 사용.
 * (외부 라이브러리 없이 Node.js 내장 Intl API 사용)
 */
function orgLocalToUtc(localStr: string, timezone: string): string | null {
  if (!localStr?.trim()) return null;
  const cleaned = localStr.trim().replace(" ", "T");
  const m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, yr, mo, da, hr, mi, sc = "00"] = m;

  // 입력값을 UTC로 취급하는 임시 Date
  const fakeUtc = new Date(`${yr}-${mo}-${da}T${hr}:${mi}:${sc}Z`);

  // fakeUtc 시각을 조직 타임존으로 표현했을 때의 각 파트 구하기
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  });
  const parts: Record<string, number> = {};
  for (const { type, value } of fmt.formatToParts(fakeUtc)) {
    if (type !== "literal") parts[type] = parseInt(value);
  }
  // hour12:false에서 자정이 24로 나오는 경우 대응
  const tzMoment = Date.UTC(
    parts.year, parts.month - 1, parts.day,
    (parts.hour ?? 0) % 24, parts.minute, parts.second
  );

  // offsetMs = fakeUtc - tzMoment  →  -(UTC+9의 경우 +9h) = -9h
  const offsetMs = fakeUtc.getTime() - tzMoment;

  // 실제 UTC = fakeUtc + offsetMs  (= 입력 로컬 - 타임존 오프셋)
  const actualUtc = new Date(fakeUtc.getTime() + offsetMs);
  return actualUtc.toISOString().slice(0, 19);
}

// ── POST /api/assignments — 과제 생성 (반장 전용) ────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { class_id, title, description, due_at } = req.body as Record<string, string | number>;
  const userId = req.user!.id;

  if (!class_id || !title?.toString().trim()) {
    res.status(400).json({ error: "assignment.create.missingFields" });
    return;
  }

  const classId = Number(class_id);
  const perm = await getClassPermission(userId, classId);
  if (perm === null) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (perm < 1) {
    res.status(403).json({ error: "assignment.create.leaderOnly" });
    return;
  }

  // 마감일을 조직 타임존 → UTC 로 변환
  const timezone   = await getClassTimezone(classId);
  const dueAtUtc   = due_at ? orgLocalToUtc(due_at.toString(), timezone) : null;

  const [insertResult] = await pool.execute(
    "INSERT INTO assignments (class_id, creator_id, title, description, due_at) VALUES (?, ?, ?, ?, ?)",
    [classId, userId, title.toString().trim(), description?.toString().trim() || null, dueAtUtc]
  ) as any[];
  const assignmentId = (insertResult as any).insertId as number;

  // 반 전원에게 새 과제 알림 발송
  const [members] = await pool.execute(
    "SELECT user_id FROM class_members WHERE class_id = ?",
    [classId]
  ) as any[];
  if ((members as any[]).length > 0) {
    const titleStr = title.toString().trim();
    const placeholders = (members as any[]).map(() => "(?, 'new_assignment', ?, ?)").join(", ");
    const notifParams: (string | number)[] = [];
    for (const m of members as any[]) {
      notifParams.push(m.user_id as number, titleStr, `/assignments/${assignmentId}`);
    }
    await pool.execute(
      `INSERT INTO notifications (user_id, type, title, link) VALUES ${placeholders}`,
      notifParams
    );
  }

  res.status(201).json({ message: "assignment.create.success" });
});

// ── GET /api/assignments/class/:classId — 반 과제 목록 ───────────────────────
router.get("/class/:classId", requireAuth, async (req, res) => {
  const classId = Number(req.params.classId);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.description, a.due_at, a.created_at,
            u.display_name AS creator_name,
            s.status       AS my_status,
            s.submitted_at AS my_submitted_at
     FROM assignments a
     INNER JOIN users u ON u.id = a.creator_id
     LEFT JOIN submissions s ON s.assignment_id = a.id AND s.user_id = ?
     WHERE a.class_id = ?
     ORDER BY a.due_at IS NULL, a.due_at ASC, a.created_at DESC`,
    [userId, classId]
  ) as any[];

  // 조직 타임존을 목록 응답에 포함 (프론트 표시에 사용)
  const timezone = await getClassTimezone(classId);

  res.json({ assignments: rows, myPermission: perm, timezone });
});

// ── GET /api/assignments/:id — 과제 상세 ─────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.id);
  const userId       = req.user!.id;

  const [rows] = await pool.execute(
    `SELECT a.id, a.class_id, a.title, a.description, a.due_at, a.created_at,
            a.max_files, a.max_size_mb,
            u.display_name AS creator_name,
            c.name AS class_name, c.org_id,
            o.timezone
     FROM assignments a
     INNER JOIN users u ON u.id = a.creator_id
     INNER JOIN classes c ON c.id = a.class_id
     INNER JOIN organizations o ON o.id = c.org_id
     WHERE a.id = ?`,
    [assignmentId]
  ) as any[];

  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }

  const assignment = (rows as any[])[0];
  const perm = await getClassPermission(userId, assignment.class_id);
  if (perm === null) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [mySubRows] = await pool.execute(
    `SELECT id, file_url, link_url, status, feedback, submitted_at, reviewed_at
     FROM submissions WHERE assignment_id = ? AND user_id = ?`,
    [assignmentId, userId]
  ) as any[];

  res.json({
    assignment,
    myPermission: perm,
    mySubmission: (mySubRows as any[])[0] ?? null,
  });
});

// ── PATCH /api/assignments/:id — 수정 (반장) ─────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.id);
  const userId       = req.user!.id;
  const { title, description, due_at } = req.body as Record<string, string>;

  const [rows] = await pool.execute(
    "SELECT class_id FROM assignments WHERE id = ?",
    [assignmentId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const classId = (rows as any[])[0].class_id as number;
  const perm = await getClassPermission(userId, classId);
  if (perm === null || perm < 1) { res.status(403).json({ error: "forbidden" }); return; }

  // 마감일을 조직 타임존 → UTC 로 변환
  const timezone = await getClassTimezone(classId);

  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  if (title?.trim())            { updates.push("title = ?");       params.push(title.trim()); }
  if (description !== undefined){ updates.push("description = ?"); params.push(description?.trim() || null); }
  if (due_at !== undefined) {
    const dueAtUtc = due_at ? orgLocalToUtc(due_at, timezone) : null;
    updates.push("due_at = ?");
    params.push(dueAtUtc);
  }

  if (updates.length === 0) { res.json({ message: "nothing" }); return; }

  updates.push("updated_at = NOW()");
  params.push(assignmentId);
  await pool.execute(`UPDATE assignments SET ${updates.join(", ")} WHERE id = ?`, params);

  res.json({ message: "updated" });
});

// ── DELETE /api/assignments/:id — 삭제 (반장) ────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.id);
  const userId       = req.user!.id;

  const [rows] = await pool.execute(
    "SELECT class_id FROM assignments WHERE id = ?",
    [assignmentId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const perm = await getClassPermission(userId, (rows as any[])[0].class_id);
  if (perm === null || perm < 1) { res.status(403).json({ error: "forbidden" }); return; }

  // 이 과제에 대한 모든 제출 파일 경로 조회 후 물리 파일 삭제
  const [fileRows] = await pool.execute(
    `SELECT sf.file_url
     FROM submission_files sf
     INNER JOIN submissions s ON s.id = sf.submission_id
     WHERE s.assignment_id = ?`,
    [assignmentId]
  ) as any[];
  for (const row of fileRows as any[]) {
    const filePath = path.join(uploadDir, path.basename(row.file_url as string));
    try { fs.unlinkSync(filePath); } catch { /* 파일이 없어도 무시 */ }
  }

  // DB 삭제 (submissions, submission_files 는 CASCADE)
  await pool.execute("DELETE FROM assignments WHERE id = ?", [assignmentId]);
  res.json({ message: "deleted" });
});

export default router;
