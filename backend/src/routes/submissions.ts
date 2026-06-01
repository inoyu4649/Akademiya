import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const router: IRouter = Router();

// ── Upload dir setup ─────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const uploadDir  = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── helpers ──────────────────────────────────────────────────────────────────
async function getClassPermission(userId: number, classId: number): Promise<number | null> {
  const [rows] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
}

// ── POST /api/submissions — 파일 or 링크 제출 ────────────────────────────────
// 항상 multipart/form-data로 전송 (링크 전용도 FormData 사용)
router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "submission.fileTooLarge" });
        return;
      }
      if (err) { next(err); return; }
      next();
    });
  },
  async (req, res) => {
    const userId        = req.user!.id;
    const assignment_id = Number(req.body.assignment_id);
    const link_url      = req.body.link_url?.trim() || null;
    const file          = req.file;

    if (!assignment_id) {
      res.status(400).json({ error: "submission.missingFields" });
      return;
    }
    if (!file && !link_url) {
      res.status(400).json({ error: "submission.noContent" });
      return;
    }

    // 과제 확인
    const [asgRows] = await pool.execute(
      "SELECT class_id, due_at FROM assignments WHERE id = ?",
      [assignment_id]
    ) as any[];
    if (!(asgRows as any[]).length) {
      if (file) fs.unlinkSync(file.path);
      res.status(404).json({ error: "notFound" });
      return;
    }
    const asg = (asgRows as any[])[0];

    // 반 멤버 확인
    const perm = await getClassPermission(userId, asg.class_id);
    if (perm === null) {
      if (file) fs.unlinkSync(file.path);
      res.status(403).json({ error: "forbidden" });
      return;
    }

    // 마감 확인
    if (asg.due_at && new Date(asg.due_at) < new Date()) {
      if (file) fs.unlinkSync(file.path);
      res.status(400).json({ error: "submission.pastDue" });
      return;
    }

    const fileUrl = file ? `/uploads/${file.filename}` : null;

    // 기존 제출 여부 확인
    const [existing] = await pool.execute(
      "SELECT id, status, file_url FROM submissions WHERE assignment_id = ? AND user_id = ?",
      [assignment_id, userId]
    ) as any[];
    const ex = (existing as any[])[0];

    if (ex) {
      if (ex.status === "approved") {
        if (file) fs.unlinkSync(file.path);
        res.status(409).json({ error: "submission.alreadyApproved" });
        return;
      }
      // returned or submitted → 재제출: 이전 파일 삭제
      if (ex.file_url) {
        const oldPath = path.join(uploadDir, path.basename(ex.file_url));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      await pool.execute(
        `UPDATE submissions
         SET file_url = ?, link_url = ?, status = 'submitted',
             feedback = NULL, submitted_at = NOW(), reviewed_at = NULL
         WHERE id = ?`,
        [fileUrl, link_url, ex.id]
      );
    } else {
      await pool.execute(
        "INSERT INTO submissions (assignment_id, user_id, file_url, link_url) VALUES (?, ?, ?, ?)",
        [assignment_id, userId, fileUrl, link_url]
      );
    }

    res.status(201).json({ message: "submission.success" });
  }
);

// ── GET /api/submissions/assignment/:id ──────────────────────────────────────
// 반장: 전체 멤버 + 제출 현황 / 학생: 본인 제출
router.get("/assignment/:assignmentId", requireAuth, async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const userId       = req.user!.id;

  const [asgRows] = await pool.execute(
    "SELECT class_id FROM assignments WHERE id = ?",
    [assignmentId]
  ) as any[];
  if (!(asgRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const classId = (asgRows as any[])[0].class_id;
  const perm    = await getClassPermission(userId, classId);
  if (perm === null) { res.status(403).json({ error: "forbidden" }); return; }

  if (perm >= 1) {
    // 반장: 모든 반원의 제출 현황
    const [rows] = await pool.execute(
      `SELECT u.id AS user_id, u.display_name, u.email,
              s.id         AS submission_id,
              s.file_url, s.link_url, s.status,
              s.feedback,  s.submitted_at, s.reviewed_at
       FROM class_members cm
       INNER JOIN users u ON u.id = cm.user_id
       LEFT JOIN submissions s ON s.assignment_id = ? AND s.user_id = cm.user_id
       WHERE cm.class_id = ?
       ORDER BY u.display_name`,
      [assignmentId, classId]
    ) as any[];
    res.json({ submissions: rows, isLeader: true });
  } else {
    // 학생: 본인만
    const [rows] = await pool.execute(
      `SELECT id, file_url, link_url, status, feedback, submitted_at, reviewed_at
       FROM submissions WHERE assignment_id = ? AND user_id = ?`,
      [assignmentId, userId]
    ) as any[];
    res.json({ submissions: rows, isLeader: false });
  }
});

// ── POST /api/submissions/:id/approve — 승인 (반장) ──────────────────────────
router.post("/:id/approve", requireAuth, async (req, res) => {
  const subId  = Number(req.params.id);
  const userId = req.user!.id;

  const [rows] = await pool.execute(
    `SELECT s.id, a.class_id
     FROM submissions s
     INNER JOIN assignments a ON a.id = s.assignment_id
     WHERE s.id = ?`,
    [subId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const perm = await getClassPermission(userId, (rows as any[])[0].class_id);
  if (perm === null || perm < 1) { res.status(403).json({ error: "forbidden" }); return; }

  await pool.execute(
    "UPDATE submissions SET status = 'approved', reviewed_at = NOW() WHERE id = ?",
    [subId]
  );
  res.json({ message: "approved" });
});

// ── POST /api/submissions/:id/return — 반환 (반장) ───────────────────────────
router.post("/:id/return", requireAuth, async (req, res) => {
  const subId    = Number(req.params.id);
  const userId   = req.user!.id;
  const { feedback } = req.body as { feedback?: string };

  const [rows] = await pool.execute(
    `SELECT s.id, a.class_id
     FROM submissions s
     INNER JOIN assignments a ON a.id = s.assignment_id
     WHERE s.id = ?`,
    [subId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const perm = await getClassPermission(userId, (rows as any[])[0].class_id);
  if (perm === null || perm < 1) { res.status(403).json({ error: "forbidden" }); return; }

  await pool.execute(
    "UPDATE submissions SET status = 'returned', feedback = ?, reviewed_at = NOW() WHERE id = ?",
    [feedback?.trim() || null, subId]
  );
  res.json({ message: "returned" });
});

export default router;
