import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const router: IRouter = Router();

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

// 파일당 최대 100MB (총합 20MB는 라우터에서 검사)
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

const MAX_RESOURCE_SIZE_MB = 20;

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

// ── GET /api/resources/class/:classId — 자료 목록 ───────────────────────────
router.get("/class/:classId", requireAuth, async (req, res) => {
  const classId = Number(req.params.classId);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null) { res.status(403).json({ error: "forbidden" }); return; }

  const [rows] = await pool.execute(
    `SELECT r.id, r.title, r.description, r.link_url, r.created_at,
            u.display_name AS creator_name
     FROM class_resources r
     INNER JOIN users u ON u.id = r.creator_id
     WHERE r.class_id = ?
     ORDER BY r.created_at DESC`,
    [classId]
  ) as any[];

  for (const row of rows as any[]) {
    const [files] = await pool.execute(
      "SELECT id, file_url, original_name, file_size FROM class_resource_files WHERE resource_id = ? ORDER BY id",
      [row.id]
    ) as any[];
    row.files = files;
  }

  res.json({ resources: rows, isLeader: perm >= 1 });
});

// ── POST /api/resources — 자료 업로드 (반장만) ───────────────────────────────
router.post(
  "/",
  requireAuth,
  (req, res, next) => {
    upload.array("files", 10)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ error: "resource.fileTooLarge" });
        return;
      }
      if (err) { next(err); return; }
      next();
    });
  },
  async (req, res) => {
    const userId      = req.user!.id;
    const { class_id, title, description, link_url } = req.body as any;
    const files       = (req.files ?? []) as Express.Multer.File[];
    const classId     = Number(class_id);
    const titleTrim   = title?.trim() ?? "";
    const linkTrim    = link_url?.trim() || null;

    if (!classId || !titleTrim) {
      deleteUploadedFiles(files);
      res.status(400).json({ error: "resource.missingFields" });
      return;
    }

    if (files.length === 0 && !linkTrim) {
      res.status(400).json({ error: "resource.noContent" });
      return;
    }

    const perm = await getClassPermission(userId, classId);
    if (perm === null) {
      deleteUploadedFiles(files);
      res.status(403).json({ error: "forbidden" });
      return;
    }
    if (perm < 1) {
      deleteUploadedFiles(files);
      res.status(403).json({ error: "resource.leaderOnly" });
      return;
    }

    // 총 파일 크기 20MB 확인
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_RESOURCE_SIZE_MB * 1024 * 1024) {
      deleteUploadedFiles(files);
      res.status(400).json({ error: "resource.totalTooLarge", maxSizeMb: MAX_RESOURCE_SIZE_MB });
      return;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [ins] = await conn.execute(
        `INSERT INTO class_resources (class_id, creator_id, title, description, link_url)
         VALUES (?, ?, ?, ?, ?)`,
        [classId, userId, titleTrim, description?.trim() || null, linkTrim]
      ) as any[];
      const resourceId = (ins as any).insertId;

      for (const f of files) {
        await conn.execute(
          "INSERT INTO class_resource_files (resource_id, file_url, original_name, file_size) VALUES (?, ?, ?, ?)",
          [resourceId, `/uploads/${f.filename}`, f.originalname, f.size]
        );
      }

      await conn.commit();
      res.status(201).json({ id: resourceId, message: "resource.uploaded" });
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      deleteUploadedFiles(files);
      throw e;
    } finally {
      try { conn.release(); } catch { /* ignore */ }
    }
  }
);

// ── DELETE /api/resources/:id — 자료 삭제 (반장만) ──────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const resourceId = Number(req.params.id);
  const userId     = req.user!.id;

  const [rows] = await pool.execute(
    "SELECT id, class_id FROM class_resources WHERE id = ?",
    [resourceId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const resource = (rows as any[])[0];
  const perm = await getClassPermission(userId, resource.class_id);
  if (perm === null || perm < 1) { res.status(403).json({ error: "forbidden" }); return; }

  // 물리 파일 삭제
  const [files] = await pool.execute(
    "SELECT file_url FROM class_resource_files WHERE resource_id = ?",
    [resourceId]
  ) as any[];
  for (const f of files as any[]) {
    const filePath = path.join(uploadDir, path.basename(f.file_url));
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  await pool.execute("DELETE FROM class_resources WHERE id = ?", [resourceId]);
  res.json({ message: "resource.deleted" });
});

export default router;
