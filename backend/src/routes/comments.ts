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

async function filterProfanity(content: string): Promise<{ text: string; filtered: boolean }> {
  const [words] = await pool.execute("SELECT word FROM profanity_words") as any[];
  let text = content;
  let filtered = false;
  for (const row of words as { word: string }[]) {
    const w = row.word;
    const regex = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (regex.test(text)) {
      text = text.replace(regex, "*".repeat(w.length));
      filtered = true;
    }
  }
  return { text, filtered };
}

// ── POST /api/comments — 댓글 작성 ──────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { assignment_id, content } = req.body as Record<string, string | number>;
  const userId = req.user!.id;

  if (!assignment_id || !content?.toString().trim()) {
    res.status(400).json({ error: "comment.missingFields" });
    return;
  }

  const [asgRows] = await pool.execute(
    "SELECT class_id FROM assignments WHERE id = ?",
    [Number(assignment_id)]
  ) as any[];
  if (!(asgRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const perm = await getClassPermission(userId, (asgRows as any[])[0].class_id);
  if (perm === null) { res.status(403).json({ error: "forbidden" }); return; }

  const { text, filtered } = await filterProfanity(content.toString().trim());

  await pool.execute(
    "INSERT INTO comments (assignment_id, user_id, content, is_filtered) VALUES (?, ?, ?, ?)",
    [Number(assignment_id), userId, text, filtered ? 1 : 0]
  );

  res.status(201).json({ message: "comment.success", is_filtered: filtered });
});

// ── GET /api/comments/assignment/:id — 댓글 목록 ─────────────────────────────
router.get("/assignment/:assignmentId", requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const userId       = req.user!.id;

  const [asgRows] = await pool.execute(
    "SELECT class_id FROM assignments WHERE id = ?",
    [assignmentId]
  ) as any[];
  if (!(asgRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const perm = await getClassPermission(userId, (asgRows as any[])[0].class_id);
  if (perm === null) { res.status(403).json({ error: "forbidden" }); return; }

  const [rows] = await pool.execute(
    `SELECT c.id, c.content, c.is_filtered, c.created_at,
            u.id AS user_id, u.display_name
     FROM comments c
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.assignment_id = ?
     ORDER BY c.created_at ASC`,
    [assignmentId]
  ) as any[];

  res.json({ comments: rows });
});

// ── DELETE /api/comments/:id — 삭제 (본인 or 반장) ───────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const commentId = Number(req.params.id);
  const userId    = req.user!.id;

  const [rows] = await pool.execute(
    `SELECT c.id, c.user_id, a.class_id
     FROM comments c
     INNER JOIN assignments a ON a.id = c.assignment_id
     WHERE c.id = ?`,
    [commentId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const comment = (rows as any[])[0];
  const perm = await getClassPermission(userId, comment.class_id);
  if (perm === null) { res.status(403).json({ error: "forbidden" }); return; }

  // 본인 또는 반장만 삭제 가능
  if (comment.user_id !== userId && perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  await pool.execute("DELETE FROM comments WHERE id = ?", [commentId]);
  res.json({ message: "deleted" });
});

export default router;
