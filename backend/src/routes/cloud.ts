// ============================================================================
//  Akademiya Cloud — 계정 단위 파일 저장소 API
// ============================================================================
//  호출자는 두 종류다(middleware/apiAuth.ts 참조):
//    · Akademiya 웹앱          — Access Token(JWT)
//    · OpenOAuth 서드파티 앱   — 불투명 토큰 + 'cloud' scope  (예: PyDe Web 서버)
//
//  권한 모델은 설문(routes/surveys.ts)의 scope_type + survey_stat_viewers 구조를
//  파일 단위로 옮긴 것이다. 소유자 > 사용자 지정 공유 > 조직 공유 > 링크 순으로
//  가장 높은 권한을 채택한다.
//
//  ⚠️ IDOR 방어 원칙: 모든 라우트는 요청 본문/쿼리의 user_id를 절대 신뢰하지 않고
//     req.actor!.userId(토큰에서 유도된 값)만 사용한다. 파일 조회는 예외 없이
//     resolveAccess()를 거치며, 이 함수가 null을 반환하면 존재 여부조차 알려주지
//     않기 위해 항상 404로 응답한다(403과 404를 구분하면 파일 존재가 노출된다).
// ============================================================================
import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { pool } from "../db/pool.js";
import { requireApiActor } from "../middleware/apiAuth.js";

const router: IRouter = Router();

type Row = Record<string, unknown>;

// ── 한도 ─────────────────────────────────────────────────────────────────────
// 대상이 교육용 소스 파일이라는 전제. .ipynb는 출력 이미지가 base64로 박혀 커질 수
// 있어 개당 한도를 넉넉히 5MB로 두되, 계정 총량으로 남용을 막는다.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILES_PER_USER = 300;
const NAME_MAX = 180;
const FOLDER_MAX = 180;

// ── Rate limit ───────────────────────────────────────────────────────────────
// ⚠️ IP 기준으로 잡으면 안 된다. PyDe Web 서버가 도커 내부에서 사용자 요청을 대리
//    호출하므로 전체 사용자가 컨테이너 IP 하나를 공유한다(학교 공용 IP 문제의 극단
//    버전 — 한 명이 캡을 채우면 전원이 막힌다). 인증된 user_id를 키로 쓴다.
const cloudLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600, // 자동 저장은 5분에 1회 수준 — 파일 탐색/열기까지 감안해도 충분히 여유
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" },
  keyGenerator: (req: Request) => `u${req.actor?.userId ?? 0}`,
  validate: { keyGeneratorIpFallback: false },
});

// 링크 공개 파일의 익명 열람 — 학교 한 반이 동시에 링크를 열어도 막히지 않도록 여유 있게
// (설문 공개 응답 리미터를 300으로 올렸던 사례와 같은 이유)
const publicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" },
});

// ── 이름/경로 검증 ───────────────────────────────────────────────────────────
// 본문을 파일시스템에 쓰지 않으므로 경로 순회 자체는 성립하지 않지만, 이름은 다운로드
// 시 Content-Disposition과 클라이언트 파일 트리에 그대로 쓰이므로 여기서 좁힌다.
//   · 제어문자(\p{C})·경로 구분자·윈도우 예약문자 금지
//   · 앞뒤 공백/마침표 금지("..", " x", "x." 등 트릭 차단)
const FORBIDDEN_CHARS = /[\p{C}/\\:*?"<>|]/u;

function isValidSegment(s: string): boolean {
  if (!s || s.length > NAME_MAX) return false;
  if (FORBIDDEN_CHARS.test(s)) return false;
  if (s !== s.trim()) return false;
  if (s.startsWith(".") || s.endsWith(".")) return false;
  return true;
}

/** 파일명 검증 — 확장자를 포함한 한 개의 세그먼트 */
function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").trim();
  return isValidSegment(name) ? name : null;
}

/** 폴더 경로 검증 — 빈 문자열(루트) 또는 '/'로 이어진 세그먼트들 */
function normalizeFolder(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return null;
  const folder = raw.normalize("NFC").trim().replace(/^\/+|\/+$/g, "");
  if (!folder) return "";
  if (folder.length > FOLDER_MAX) return null;
  const segments = folder.split("/");
  return segments.every(isValidSegment) ? segments.join("/") : null;
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

// ── 권한 해석 ────────────────────────────────────────────────────────────────
type Role = "owner" | "editor" | "viewer";

const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

interface Access {
  file: Row;
  role: Role;
}

/**
 * 파일 하나에 대한 유효 권한을 계산한다.
 * @param userId    인증된 사용자 id. 익명(링크 열람)이면 null
 * @param linkToken 클라이언트가 제시한 공유 링크 토큰(없으면 null)
 */
async function resolveAccess(
  fileId: number,
  userId: number | null,
  linkToken: string | null
): Promise<Access | null> {
  if (!Number.isInteger(fileId) || fileId <= 0) return null;

  const [fileRows] = await pool.query("SELECT * FROM cloud_files WHERE id = ?", [fileId]);
  const file = (fileRows as Row[])[0];
  if (!file) return null;

  if (userId && file.owner_id === userId) return { file, role: "owner" };

  const granted: Role[] = [];

  if (userId) {
    // 사용자 지정 공유 + 조직 공유를 한 번에 조회
    const [shareRows] = await pool.query(
      `SELECT s.role FROM cloud_file_shares s
        WHERE s.file_id = ? AND s.subject_type = 'user' AND s.subject_id = ?
       UNION ALL
       SELECT s.role FROM cloud_file_shares s
         JOIN org_members m ON m.org_id = s.subject_id AND m.user_id = ?
        WHERE s.file_id = ? AND s.subject_type = 'org'`,
      [fileId, userId, userId, fileId]
    );
    for (const r of shareRows as Row[]) granted.push(r.role as Role);
  }

  // 링크 공유 — 토큰이 정확히 일치할 때만.
  // 익명 방문자는 link_share가 'editor'여도 항상 viewer로 강등한다
  // (편집 이력을 남길 주체가 없으므로 익명 쓰기는 허용하지 않는다).
  if (
    linkToken &&
    file.link_token &&
    file.link_share !== "none" &&
    safeEqual(linkToken, file.link_token as string)
  ) {
    granted.push(file.link_share === "editor" && userId ? "editor" : "viewer");
  }

  if (!granted.length) return null;
  const best = granted.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
  return { file, role: best };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** 클라이언트가 제시한 공유 링크 토큰 (URL 쿼리에 담지 않고 헤더로 받는다 — 로그 유출 방지) */
function linkTokenOf(req: Request): string | null {
  const raw = req.headers["x-cloud-link-token"];
  const token = Array.isArray(raw) ? raw[0] : raw;
  return typeof token === "string" && token.length > 0 && token.length <= 64 ? token : null;
}

function fileMeta(f: Row) {
  return {
    id: f.id as number,
    folder: f.folder as string,
    name: f.name as string,
    sizeBytes: f.size_bytes as number,
    revision: f.revision as number,
    linkShare: f.link_share as string,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
  };
}

async function usage(userId: number): Promise<{ files: number; bytes: number }> {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS files, COALESCE(SUM(size_bytes), 0) AS bytes FROM cloud_files WHERE owner_id = ?",
    [userId]
  );
  const r = (rows as Row[])[0];
  return { files: Number(r.files), bytes: Number(r.bytes) };
}

// ============================================================================
//  익명 라우트 — 링크 공개 파일 열람 (인증 없음, 토큰이 곧 권한)
// ============================================================================
router.get("/public/:token", publicLinkLimiter, async (req, res) => {
  const token = req.params.token;
  if (!token || token.length > 64) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  const [rows] = await pool.query(
    `SELECT f.*, u.display_name AS owner_name
       FROM cloud_files f JOIN users u ON u.id = f.owner_id
      WHERE f.link_token = ? AND f.link_share <> 'none'`,
    [token]
  );
  const file = (rows as Row[])[0];
  if (!file) {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  res.json({
    file: { ...fileMeta(file), ownerName: file.owner_name },
    content: file.content,
    // 익명은 항상 읽기 전용. 로그인 후 편집 가능한 링크인지 클라이언트에 알려준다.
    role: "viewer",
    editableWhenSignedIn: file.link_share === "editor",
  });
});

// ============================================================================
//  이하 전부 인증 필요 ('cloud' scope)
// ============================================================================
router.use(requireApiActor("cloud"), cloudLimiter);

// ── GET /api/cloud/files — 내 파일 + 공유받은 파일 목록 (본문 제외) ──────────
router.get("/files", async (req, res) => {
  const userId = req.actor!.userId;
  const folder = normalizeFolder(req.query.folder);
  if (folder === null) {
    res.status(400).json({ error: "INVALID_FOLDER" });
    return;
  }
  // folder 파라미터를 아예 안 보내면 전체, 보내면 그 폴더만
  const filterFolder = req.query.folder !== undefined;

  const [ownRows] = await pool.query(
    `SELECT id, folder, name, size_bytes, revision, link_share, created_at, updated_at
       FROM cloud_files
      WHERE owner_id = ? ${filterFolder ? "AND folder = ?" : ""}
      ORDER BY folder, name`,
    filterFolder ? [userId, folder] : [userId]
  );

  // 공유받은 파일 — 사용자 지정 + 조직 단위. 소유자 정보를 함께 내려 목록에서 구분한다.
  const [sharedRows] = await pool.query(
    `SELECT f.id, f.folder, f.name, f.size_bytes, f.revision, f.link_share,
            f.created_at, f.updated_at,
            u.display_name AS owner_name, u.email AS owner_email,
            -- ⚠️ MAX(enum)을 쓰면 안 된다. MySQL은 ENUM 집계를 인덱스 순서가 아니라
            --    문자열로 비교해서 'viewer' > 'editor'가 되어 권한이 낮게 뒤집힌다.
            IF(MAX(s.role = 'editor') = 1, 'editor', 'viewer') AS role
       FROM cloud_file_shares s
       JOIN cloud_files f ON f.id = s.file_id
       JOIN users       u ON u.id = f.owner_id
       LEFT JOIN org_members m
              ON s.subject_type = 'org' AND m.org_id = s.subject_id AND m.user_id = ?
      WHERE (s.subject_type = 'user' AND s.subject_id = ?)
         OR (s.subject_type = 'org'  AND m.id IS NOT NULL)
      GROUP BY f.id, u.display_name, u.email
      ORDER BY f.updated_at DESC`,
    [userId, userId]
  );

  res.json({
    files: (ownRows as Row[]).map(fileMeta),
    shared: (sharedRows as Row[]).map((f) => ({
      ...fileMeta(f),
      role: f.role as string,
      ownerName: f.owner_name as string,
      ownerEmail: f.owner_email as string,
    })),
    usage: await usage(userId),
    limits: { maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: MAX_TOTAL_BYTES, maxFiles: MAX_FILES_PER_USER },
  });
});

// ── POST /api/cloud/files — 새 파일 ──────────────────────────────────────────
router.post("/files", async (req, res) => {
  const userId = req.actor!.userId;
  const { name: rawName, folder: rawFolder, content: rawContent } = req.body as Record<string, unknown>;

  const name = normalizeName(rawName);
  const folder = normalizeFolder(rawFolder);
  if (!name) { res.status(400).json({ error: "INVALID_NAME" }); return; }
  if (folder === null) { res.status(400).json({ error: "INVALID_FOLDER" }); return; }

  const content = typeof rawContent === "string" ? rawContent : "";
  const size = byteLength(content);
  if (size > MAX_FILE_BYTES) { res.status(413).json({ error: "FILE_TOO_LARGE", maxFileBytes: MAX_FILE_BYTES }); return; }

  const used = await usage(userId);
  if (used.files >= MAX_FILES_PER_USER) { res.status(413).json({ error: "TOO_MANY_FILES", maxFiles: MAX_FILES_PER_USER }); return; }
  if (used.bytes + size > MAX_TOTAL_BYTES) { res.status(413).json({ error: "QUOTA_EXCEEDED", maxTotalBytes: MAX_TOTAL_BYTES }); return; }

  try {
    const [result] = await pool.query(
      "INSERT INTO cloud_files (owner_id, folder, name, content, size_bytes) VALUES (?, ?, ?, ?, ?)",
      [userId, folder, name, content, size]
    );
    const id = (result as { insertId: number }).insertId;
    const [rows] = await pool.query("SELECT * FROM cloud_files WHERE id = ?", [id]);
    res.status(201).json({ file: fileMeta((rows as Row[])[0]) });
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      res.status(409).json({ error: "NAME_ALREADY_EXISTS" });
      return;
    }
    throw err;
  }
});

// ── GET /api/cloud/files/:id — 본문 조회 ─────────────────────────────────────
router.get("/files/:id", async (req, res) => {
  const userId = req.actor!.userId;
  const access = await resolveAccess(Number(req.params.id), userId, linkTokenOf(req));
  if (!access) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const [ownerRows] = await pool.query("SELECT display_name FROM users WHERE id = ?", [access.file.owner_id]);
  const owner = (ownerRows as Row[])[0];

  res.json({
    file: { ...fileMeta(access.file), ownerName: owner?.display_name ?? null },
    content: access.file.content,
    role: access.role,
  });
});

// ── PUT /api/cloud/files/:id — 본문 저장 (낙관적 잠금) ───────────────────────
router.put("/files/:id", async (req, res) => {
  const userId = req.actor!.userId;
  const fileId = Number(req.params.id);
  const access = await resolveAccess(fileId, userId, linkTokenOf(req));
  if (!access) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  if (access.role === "viewer") { res.status(403).json({ error: "READ_ONLY" }); return; }

  const { content: rawContent, revision } = req.body as Record<string, unknown>;
  if (typeof rawContent !== "string") { res.status(400).json({ error: "INVALID_CONTENT" }); return; }

  const size = byteLength(rawContent);
  if (size > MAX_FILE_BYTES) { res.status(413).json({ error: "FILE_TOO_LARGE", maxFileBytes: MAX_FILE_BYTES }); return; }

  // 할당량은 항상 "소유자" 기준으로 계산한다 — 공유받은 편집자가 남의 용량을 쓰는 구조라,
  // 증가분만 검사해 소유자 한도를 넘기지 않도록 한다.
  const ownerId = access.file.owner_id as number;
  const delta = size - (access.file.size_bytes as number);
  if (delta > 0) {
    const used = await usage(ownerId);
    if (used.bytes + delta > MAX_TOTAL_BYTES) {
      res.status(413).json({ error: "QUOTA_EXCEEDED", maxTotalBytes: MAX_TOTAL_BYTES });
      return;
    }
  }

  // revision을 보내지 않으면 강제 덮어쓰기(사용자가 충돌 경고에서 "덮어쓰기"를 고른 경우)
  const expected = Number(revision);
  const useLock = Number.isInteger(expected) && expected > 0;

  const [result] = await pool.query(
    `UPDATE cloud_files SET content = ?, size_bytes = ?, revision = revision + 1
      WHERE id = ? ${useLock ? "AND revision = ?" : ""}`,
    useLock ? [rawContent, size, fileId, expected] : [rawContent, size, fileId]
  );

  if ((result as { affectedRows: number }).affectedRows === 0) {
    // 잠금 실패 = 그 사이 다른 편집자가 저장함. 현재 revision을 알려 클라이언트가 분기하게 한다.
    const [cur] = await pool.query("SELECT revision, updated_at FROM cloud_files WHERE id = ?", [fileId]);
    const row = (cur as Row[])[0];
    if (!row) { res.status(404).json({ error: "NOT_FOUND" }); return; }
    res.status(409).json({ error: "REVISION_CONFLICT", currentRevision: row.revision, updatedAt: row.updated_at });
    return;
  }

  res.json({ revision: (access.file.revision as number) + 1, sizeBytes: size });
});

// ── PATCH /api/cloud/files/:id — 이름 변경 / 폴더 이동 (소유자 전용) ─────────
router.patch("/files/:id", async (req, res) => {
  const userId = req.actor!.userId;
  const fileId = Number(req.params.id);
  const access = await resolveAccess(fileId, userId, linkTokenOf(req));
  if (!access) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  if (access.role !== "owner") { res.status(403).json({ error: "OWNER_ONLY" }); return; }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (req.body.name !== undefined) {
    const name = normalizeName(req.body.name);
    if (!name) { res.status(400).json({ error: "INVALID_NAME" }); return; }
    updates.push("name = ?"); params.push(name);
  }
  if (req.body.folder !== undefined) {
    const folder = normalizeFolder(req.body.folder);
    if (folder === null) { res.status(400).json({ error: "INVALID_FOLDER" }); return; }
    updates.push("folder = ?"); params.push(folder);
  }
  if (!updates.length) { res.status(400).json({ error: "NOTHING_TO_UPDATE" }); return; }

  try {
    params.push(fileId);
    await pool.query(`UPDATE cloud_files SET ${updates.join(", ")} WHERE id = ?`, params);
  } catch (err) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      res.status(409).json({ error: "NAME_ALREADY_EXISTS" });
      return;
    }
    throw err;
  }

  const [rows] = await pool.query("SELECT * FROM cloud_files WHERE id = ?", [fileId]);
  res.json({ file: fileMeta((rows as Row[])[0]) });
});

// ── DELETE /api/cloud/files/:id (소유자 전용) ────────────────────────────────
router.delete("/files/:id", async (req, res) => {
  const userId = req.actor!.userId;
  const fileId = Number(req.params.id);
  const access = await resolveAccess(fileId, userId, linkTokenOf(req));
  if (!access) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  if (access.role !== "owner") { res.status(403).json({ error: "OWNER_ONLY" }); return; }

  await pool.query("DELETE FROM cloud_files WHERE id = ? AND owner_id = ?", [fileId, userId]);
  res.json({ message: "deleted" });
});

// ============================================================================
//  공유 관리 — 전부 소유자 전용
//  (설문의 POST/DELETE /:id/viewers 구조를 파일 + 조직/링크까지 확장한 것)
// ============================================================================
async function requireOwnedFile(req: Request): Promise<Row | null> {
  const fileId = Number(req.params.id);
  if (!Number.isInteger(fileId) || fileId <= 0) return null;
  const [rows] = await pool.query("SELECT * FROM cloud_files WHERE id = ? AND owner_id = ?", [
    fileId,
    req.actor!.userId,
  ]);
  return (rows as Row[])[0] ?? null;
}

// ── GET /api/cloud/files/:id/shares — 공유 현황 ──────────────────────────────
router.get("/files/:id/shares", async (req, res) => {
  const file = await requireOwnedFile(req);
  if (!file) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  // 대상이 삭제된 고아 행은 JOIN에서 자연히 빠진다(다형 FK를 걸 수 없는 구조의 보완)
  const [userShares] = await pool.query(
    `SELECT s.id, s.role, u.id AS user_id, u.display_name, u.email
       FROM cloud_file_shares s JOIN users u ON u.id = s.subject_id
      WHERE s.file_id = ? AND s.subject_type = 'user'`,
    [file.id]
  );
  const [orgShares] = await pool.query(
    `SELECT s.id, s.role, o.id AS org_id, o.name, o.code
       FROM cloud_file_shares s JOIN organizations o ON o.id = s.subject_id
      WHERE s.file_id = ? AND s.subject_type = 'org'`,
    [file.id]
  );

  res.json({
    users: userShares,
    orgs: orgShares,
    link: { share: file.link_share, token: file.link_token ?? null },
  });
});

// ── POST /api/cloud/files/:id/shares — 이메일 지정 또는 조직 전체 공유 ───────
router.post("/files/:id/shares", async (req, res) => {
  const file = await requireOwnedFile(req);
  if (!file) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const { type, email, orgId, role: rawRole } = req.body as Record<string, unknown>;
  const role = rawRole === "editor" ? "editor" : "viewer";

  let subjectType: "user" | "org";
  let subjectId: number;

  if (type === "user") {
    const addr = typeof email === "string" ? email.trim() : "";
    if (!addr) { res.status(400).json({ error: "INVALID_EMAIL" }); return; }
    const [userRows] = await pool.query("SELECT id FROM users WHERE email = ?", [addr]);
    const target = (userRows as Row[])[0];
    if (!target) { res.status(404).json({ error: "USER_NOT_FOUND" }); return; }
    if (target.id === file.owner_id) { res.status(400).json({ error: "CANNOT_SHARE_WITH_OWNER" }); return; }
    subjectType = "user";
    subjectId = target.id as number;
  } else if (type === "org") {
    const id = Number(orgId);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "INVALID_ORG" }); return; }
    // 아무 조직에나 뿌릴 수 없다 — 공유자 본인이 소속된 조직만 허용
    const [memberRows] = await pool.query(
      "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?",
      [id, req.actor!.userId]
    );
    if (!(memberRows as Row[]).length) { res.status(403).json({ error: "NOT_ORG_MEMBER" }); return; }
    subjectType = "org";
    subjectId = id;
  } else {
    res.status(400).json({ error: "INVALID_SHARE_TYPE" });
    return;
  }

  // 이미 있으면 권한만 갱신 (viewer ↔ editor 전환)
  await pool.query(
    `INSERT INTO cloud_file_shares (file_id, subject_type, subject_id, role, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [file.id, subjectType, subjectId, role, req.actor!.userId]
  );

  res.json({ message: "shared" });
});

// ── DELETE /api/cloud/files/:id/shares/:shareId ──────────────────────────────
router.delete("/files/:id/shares/:shareId", async (req, res) => {
  const file = await requireOwnedFile(req);
  if (!file) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  await pool.query("DELETE FROM cloud_file_shares WHERE id = ? AND file_id = ?", [
    Number(req.params.shareId),
    file.id,
  ]);
  res.json({ message: "removed" });
});

// ── PUT /api/cloud/files/:id/link — 링크 공개 설정 ───────────────────────────
// role: 'none' → 공개 해제(토큰 폐기), 'viewer'/'editor' → 공개(토큰 없으면 발급)
router.put("/files/:id/link", async (req, res) => {
  const file = await requireOwnedFile(req);
  if (!file) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const raw = (req.body as Record<string, unknown>).share;
  const share = raw === "viewer" || raw === "editor" ? raw : "none";

  if (share === "none") {
    // 토큰까지 함께 폐기한다 — 다시 켜면 새 URL이 발급되므로 기존 링크는 영구히 죽는다
    await pool.query("UPDATE cloud_files SET link_share = 'none', link_token = NULL WHERE id = ?", [file.id]);
    res.json({ share: "none", token: null });
    return;
  }

  const token = (file.link_token as string | null) ?? crypto.randomBytes(32).toString("base64url");
  await pool.query("UPDATE cloud_files SET link_share = ?, link_token = ? WHERE id = ?", [
    share,
    token,
    file.id,
  ]);
  res.json({ share, token });
});

// ── GET /api/cloud/orgs — 공유 대상으로 고를 수 있는 내 조직 목록 ────────────
// (조직 UI는 사용자에게 비노출이지만, "우리 조직 전원에게 공유"를 하려면 목록이 필요하다)
router.get("/orgs", async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.id, o.name, o.code
       FROM org_members m JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ? AND o.status = 'approved'
      ORDER BY o.name`,
    [req.actor!.userId]
  );
  res.json({ orgs: rows });
});

// ── GET /api/cloud/usage ─────────────────────────────────────────────────────
router.get("/usage", async (req, res) => {
  res.json({
    usage: await usage(req.actor!.userId),
    limits: { maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: MAX_TOTAL_BYTES, maxFiles: MAX_FILES_PER_USER },
  });
});

export default router;
