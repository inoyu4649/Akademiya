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

// 최대 단일 파일 크기 = 과제 max_size_mb 상한 없이 일단 100MB로 (총 합계는 라우터에서 검사)
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
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

function deleteUploadedFiles(files: Express.Multer.File[]) {
  for (const f of files) {
    try { fs.unlinkSync(f.path); } catch { /* ignore */ }
  }
}

// ── POST /api/submissions — 파일(최대 20개) or 링크 제출 ─────────────────────
router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    upload.array("files", 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
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
    const files         = (req.files ?? []) as Express.Multer.File[];

    if (!assignment_id) {
      deleteUploadedFiles(files);
      res.status(400).json({ error: "submission.missingFields" });
      return;
    }
    if (files.length === 0 && !link_url) {
      res.status(400).json({ error: "submission.noContent" });
      return;
    }

    // 과제 확인 (한도 포함)
    const [asgRows] = await pool.execute(
      "SELECT class_id, due_at, max_files, max_size_mb FROM assignments WHERE id = ?",
      [assignment_id]
    ) as any[];
    if (!(asgRows as any[]).length) {
      deleteUploadedFiles(files);
      res.status(404).json({ error: "notFound" });
      return;
    }
    const asg = (asgRows as any[])[0];

    // 반 멤버 확인
    const perm = await getClassPermission(userId, asg.class_id);
    if (perm === null) {
      deleteUploadedFiles(files);
      res.status(403).json({ error: "forbidden" });
      return;
    }

    // 마감 확인
    if (asg.due_at && new Date(asg.due_at) < new Date()) {
      deleteUploadedFiles(files);
      res.status(400).json({ error: "submission.pastDue" });
      return;
    }

    // 파일 개수 한도 확인
    const maxFiles   = asg.max_files   ?? 20;
    const maxSizeMb  = asg.max_size_mb ?? 5;
    if (files.length > maxFiles) {
      deleteUploadedFiles(files);
      res.status(400).json({ error: "submission.tooManyFiles", maxFiles });
      return;
    }

    // 총 파일 크기 확인
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > maxSizeMb * 1024 * 1024) {
      deleteUploadedFiles(files);
      res.status(400).json({ error: "submission.totalTooLarge", maxSizeMb });
      return;
    }

    // 기존 제출 확인
    const [existing] = await pool.execute(
      "SELECT id, status FROM submissions WHERE assignment_id = ? AND user_id = ?",
      [assignment_id, userId]
    ) as any[];
    const ex = (existing as any[])[0];

    if (ex && ex.status === "approved") {
      deleteUploadedFiles(files);
      res.status(409).json({ error: "submission.alreadyApproved" });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (ex) {
        // 재제출: 이전 파일들 삭제
        const [oldFiles] = await conn.execute(
          "SELECT file_url FROM submission_files WHERE submission_id = ?",
          [ex.id]
        ) as any[];
        for (const of_ of oldFiles as any[]) {
          const oldPath = path.join(uploadDir, path.basename(of_.file_url));
          try { fs.unlinkSync(oldPath); } catch { /* ignore */ }
        }
        await conn.execute("DELETE FROM submission_files WHERE submission_id = ?", [ex.id]);
        await conn.execute(
          `UPDATE submissions
           SET link_url = ?, status = 'submitted', feedback = NULL,
               submitted_at = NOW(), reviewed_at = NULL
           WHERE id = ?`,
          [link_url, ex.id]
        );

        // 새 파일 삽입
        for (const f of files) {
          await conn.execute(
            "INSERT INTO submission_files (submission_id, file_url, original_name, file_size) VALUES (?, ?, ?, ?)",
            [ex.id, `/uploads/${f.filename}`, f.originalname, f.size]
          );
        }
      } else {
        const [ins] = await conn.execute(
          "INSERT INTO submissions (assignment_id, user_id, link_url) VALUES (?, ?, ?)",
          [assignment_id, userId, link_url]
        ) as any[];
        const subId = (ins as any).insertId;

        for (const f of files) {
          await conn.execute(
            "INSERT INTO submission_files (submission_id, file_url, original_name, file_size) VALUES (?, ?, ?, ?)",
            [subId, `/uploads/${f.filename}`, f.originalname, f.size]
          );
        }
      }

      await conn.commit();
      res.status(201).json({ message: "submission.success" });
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      deleteUploadedFiles(files);
      throw e;
    } finally {
      try { conn.release(); } catch { /* ignore */ }
    }
  }
);

// ── GET /api/submissions/assignment/:assignmentId ────────────────────────────
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
    // 반장: 전체 멤버 제출 현황
    const [rows] = await pool.execute(
      `SELECT u.id AS user_id, u.display_name, u.email,
              s.id         AS submission_id,
              s.link_url, s.status,
              s.feedback,  s.submitted_at, s.reviewed_at
       FROM class_members cm
       INNER JOIN users u ON u.id = cm.user_id
       LEFT JOIN submissions s ON s.assignment_id = ? AND s.user_id = cm.user_id
       WHERE cm.class_id = ?
       ORDER BY u.display_name`,
      [assignmentId, classId]
    ) as any[];

    // 각 제출에 파일 목록 첨부
    for (const row of rows as any[]) {
      if (row.submission_id) {
        const [files] = await pool.execute(
          "SELECT id, file_url, original_name, file_size FROM submission_files WHERE submission_id = ? ORDER BY id",
          [row.submission_id]
        ) as any[];
        row.files = files;
      } else {
        row.files = [];
      }
    }
    res.json({ submissions: rows, isLeader: true });
  } else {
    // 학생: 본인 제출
    const [rows] = await pool.execute(
      `SELECT id, link_url, status, feedback, submitted_at, reviewed_at
       FROM submissions WHERE assignment_id = ? AND user_id = ?`,
      [assignmentId, userId]
    ) as any[];

    if ((rows as any[]).length > 0) {
      const [files] = await pool.execute(
        "SELECT id, file_url, original_name, file_size FROM submission_files WHERE submission_id = ? ORDER BY id",
        [(rows as any[])[0].id]
      ) as any[];
      (rows as any[])[0].files = files;
    }
    res.json({ submissions: rows, isLeader: false });
  }
});

// ── POST /api/submissions/:id/approve ────────────────────────────────────────
router.post("/:id/approve", requireAuth, async (req, res) => {
  const subId  = Number(req.params.id);
  const userId = req.user!.id;

  const [rows] = await pool.execute(
    `SELECT s.id, a.class_id FROM submissions s
     INNER JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?`,
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

// ── POST /api/submissions/:id/return ─────────────────────────────────────────
router.post("/:id/return", requireAuth, async (req, res) => {
  const subId    = Number(req.params.id);
  const userId   = req.user!.id;
  const { feedback } = req.body as { feedback?: string };

  const [rows] = await pool.execute(
    `SELECT s.id, a.class_id FROM submissions s
     INNER JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?`,
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

// ── POST /api/submissions/limit-request — 파일 한도 확장 요청 ──────────────────
router.post("/limit-request", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { assignment_id, requested_max_files, requested_max_size_mb, reason } =
    req.body as any;

  if (!assignment_id || !requested_max_files || !requested_max_size_mb) {
    res.status(400).json({ error: "submission.missingFields" });
    return;
  }

  // 반장 확인
  const [asgRows] = await pool.execute(
    "SELECT class_id FROM assignments WHERE id = ?",
    [Number(assignment_id)]
  ) as any[];
  if (!(asgRows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const perm = await getClassPermission(userId, (asgRows as any[])[0].class_id);
  if (perm === null || perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  // 기존 pending 요청 있으면 업데이트
  await pool.execute(
    `INSERT INTO submission_limit_requests
       (assignment_id, requester_id, requested_max_files, requested_max_size_mb, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [
      Number(assignment_id),
      userId,
      Number(requested_max_files),
      Number(requested_max_size_mb),
      reason?.trim() || null,
    ]
  );
  res.status(201).json({ message: "requested" });
});

export default router;
