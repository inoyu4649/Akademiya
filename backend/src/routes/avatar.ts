/**
 * 프로필 사진 업로드/조회
 *
 * - 업로드는 인증 필요, 조회(GET /:filename)는 공개(비민감 정보이며 OAuth 제공자
 *   userinfo의 picture 값이 서드파티 서버에서 직접 접근 가능해야 하므로 인증 불필요).
 * - 클라이언트가 보내는 MIME 타입은 위조 가능하므로 신뢰하지 않고, 파일 내용의
 *   매직 바이트로 실제 이미지 형식을 검증한다(png/jpg/webp만 허용, svg 등 스크립트
 *   실행 가능한 형식은 저장형 XSS 위험이 있어 제외 — files.ts의 H-2 대응과 동일 원칙).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Router, type IRouter } from "express";
import multer from "multer";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const avatarDir  = path.resolve(__dirname, "../../uploads/avatars");
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const SIGNATURES: { ext: string; mime: string; check: (buf: Buffer) => boolean }[] = [
  { ext: "png",  mime: "image/png",  check: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: "jpg",  mime: "image/jpeg", check: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", check: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
];

function detectRealType(buf: Buffer) {
  return SIGNATURES.find((s) => s.check(buf)) ?? null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      cb(new Error("INVALID_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

function deleteAvatarFile(avatarUrl: string | null) {
  if (!avatarUrl) return;
  const filename = path.basename(avatarUrl);
  try { fs.unlinkSync(path.join(avatarDir, filename)); } catch { /* ignore */ }
}

// ── POST / — 업로드/교체 ─────────────────────────────────────────────────
router.post("/", requireAuth, (req, res) => {
  upload.single("avatar")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: "INVALID_FILE" }); return; }
    if (!req.file) { res.status(400).json({ error: "MISSING_FILE" }); return; }

    const real = detectRealType(req.file.buffer);
    if (!real) { res.status(400).json({ error: "INVALID_FILE_TYPE" }); return; }

    const filename = `${req.user!.id}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${real.ext}`;
    fs.writeFileSync(path.join(avatarDir, filename), req.file.buffer);

    const [rows] = await pool.query("SELECT avatar_url FROM users WHERE id = ?", [req.user!.id]);
    const prevUrl = ((rows as { avatar_url: string | null }[])[0]?.avatar_url) ?? null;

    const avatarUrl = `/api/avatars/${filename}`;
    await pool.query("UPDATE users SET avatar_url = ? WHERE id = ?", [avatarUrl, req.user!.id]);
    deleteAvatarFile(prevUrl);

    res.json({ avatarUrl });
  });
});

// ── DELETE / — 기본 아이콘으로 복원 ──────────────────────────────────────
router.delete("/", requireAuth, async (req, res) => {
  const [rows] = await pool.query("SELECT avatar_url FROM users WHERE id = ?", [req.user!.id]);
  const prevUrl = ((rows as { avatar_url: string | null }[])[0]?.avatar_url) ?? null;
  await pool.query("UPDATE users SET avatar_url = NULL WHERE id = ?", [req.user!.id]);
  deleteAvatarFile(prevUrl);
  res.json({ avatarUrl: null });
});

// ── GET /:filename — 공개 서빙 ───────────────────────────────────────────
router.get("/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // path traversal 방지
  const real = SIGNATURES.find((s) => filename.endsWith(`.${s.ext}`));
  if (!real) { res.status(404).end(); return; }

  const filePath = path.join(avatarDir, filename);
  if (!fs.existsSync(filePath)) { res.status(404).end(); return; }

  res.setHeader("Content-Type", real.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(filePath).pipe(res);
});

export default router;
