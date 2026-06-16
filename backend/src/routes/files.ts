import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router: IRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const uploadDir  = path.resolve(__dirname, "../../uploads");

// 반 멤버십(권한) 조회. 멤버가 아니면 null.
async function classPermission(userId: number, classId: number): Promise<number | null> {
  const [rows] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
}

// ── GET /api/files/:filename — 인증·멤버십 검사 후 첨부 다운로드 ─────────────────
// H-2(저장형 XSS) + M-4(접근 통제) 대응: 공개 정적 서빙(express.static "/uploads")을 대체.
//  - 모든 응답을 Content-Disposition: attachment + nosniff 로 강제 → 동일 출처 인라인 실행 차단
//  - 파일이 속한 리소스의 반 멤버십을 검사 → URL만 알면 누구나 받던 문제 차단
//    · 과제 제출 파일: 제출자 본인 또는 반장(permission>=1)만
//    · 자료실 파일: 해당 반의 멤버면 누구나
router.get("/:filename", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  // path traversal 방지: 디렉터리 구분자 제거하고 basename만 사용
  const filename = path.basename(String(req.params.filename));
  const fileUrl  = `/uploads/${filename}`;

  let originalName: string | null = null;
  let authorized = false;

  // 1) 과제 제출 파일(다중) — 제출자 본인 또는 반장
  const [subFileRows] = await pool.execute(
    `SELECT s.user_id AS owner_id, a.class_id, sf.original_name
       FROM submission_files sf
       JOIN submissions s ON s.id = sf.submission_id
       JOIN assignments a ON a.id = s.assignment_id
      WHERE sf.file_url = ?`,
    [fileUrl]
  ) as any[];
  let owned = (subFileRows as any[])[0] ?? null;

  // 2) 레거시 단일 제출 파일(submissions.file_url)
  if (!owned) {
    const [legacyRows] = await pool.execute(
      `SELECT s.user_id AS owner_id, a.class_id, NULL AS original_name
         FROM submissions s
         JOIN assignments a ON a.id = s.assignment_id
        WHERE s.file_url = ?`,
      [fileUrl]
    ) as any[];
    owned = (legacyRows as any[])[0] ?? null;
  }

  if (owned) {
    originalName = owned.original_name ?? filename;
    const perm = await classPermission(userId, owned.class_id);
    if (perm !== null && (owned.owner_id === userId || perm >= 1)) authorized = true;
  } else {
    // 3) 자료실 파일 — 반 멤버면 누구나
    const [resFileRows] = await pool.execute(
      `SELECT r.class_id, crf.original_name
         FROM class_resource_files crf
         JOIN class_resources r ON r.id = crf.resource_id
        WHERE crf.file_url = ?`,
      [fileUrl]
    ) as any[];
    const resRow = (resFileRows as any[])[0] ?? null;
    if (resRow) {
      originalName = resRow.original_name ?? filename;
      const perm = await classPermission(userId, resRow.class_id);
      if (perm !== null) authorized = true;
    }
  }

  if (!originalName) { res.status(404).json({ error: "notFound" }); return; }
  if (!authorized)   { res.status(403).json({ error: "forbidden" }); return; }

  const absPath = path.join(uploadDir, filename);
  if (!fs.existsSync(absPath)) { res.status(404).json({ error: "notFound" }); return; }

  // 인라인 실행 차단(H-2): 무조건 첨부 다운로드 + MIME 스니핑 금지 + 비공개 캐시
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`
  );
  fs.createReadStream(absPath).pipe(res);
});

export default router;
