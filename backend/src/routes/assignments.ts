import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

async function getClassPermission(userId: number, classId: number): Promise<number | null> {
  const [rows] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
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

  const [insertResult] = await pool.execute(
    "INSERT INTO assignments (class_id, creator_id, title, description, due_at) VALUES (?, ?, ?, ?, ?)",
    [classId, userId, title.toString().trim(), description?.toString().trim() || null, due_at || null]
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

  res.json({ assignments: rows, myPermission: perm });
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

  const perm = await getClassPermission(userId, (rows as any[])[0].class_id);
  if (perm === null || perm < 1) { res.status(403).json({ error: "forbidden" }); return; }

  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  if (title?.trim())       { updates.push("title = ?");       params.push(title.trim()); }
  if (description !== undefined) { updates.push("description = ?"); params.push(description?.trim() || null); }
  if (due_at !== undefined)      { updates.push("due_at = ?");      params.push(due_at || null); }

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

  await pool.execute("DELETE FROM assignments WHERE id = ?", [assignmentId]);
  res.json({ message: "deleted" });
});

export default router;
