/**
 * Akademiya OpenOAuth — "Sign in with Akademiya" OAuth2 제공자
 *
 * 설계 원칙:
 * - 기존 GMCAuto 전용 연동(routes/oauth.ts, /api/oauth)과는 완전히 별개 — 그 파일은 수정하지 않는다.
 * - 개발자가 등록한 OAuth App(클라이언트)이 임의의 서비스에 "Akademiya로 로그인"을 붙일 수 있게 한다.
 * - Authorization Code + PKCE(S256, 필수) 플로우. Client Secret은 해시로만 저장(평문 저장 금지).
 * - 토큰 교환(/token)·사용자 정보 조회(/userinfo)는 OAuth App의 서버가 직접 호출하는 것을 전제로 한다
 *   (Google Cloud Console의 "웹 애플리케이션" 클라이언트 타입과 동일한 UX — client_secret 보유).
 *   따라서 CORS 화이트리스트 변경 없이도 동작한다(서버-서버 호출은 Origin 헤더가 없어 CORS 대상이 아님).
 * - redirect_uri는 반드시 앱에 등록된 "신뢰 오리진(oauth_app_origins)" 안에 있어야 한다.
 */
import crypto from "crypto";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { hashToken } from "../utils/token.js";

const router: IRouter = Router();

type Row = Record<string, unknown>;

const SCOPES = ["openid", "profile", "email"];
const CODE_TTL_MS = 60_000; // 인가 코드 60초 TTL
const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1시간
const REFRESH_TOKEN_TTL_DAYS = 30;
const CODE_NAME_RE = /^[a-zA-Z0-9-]{3,64}$/;

// "공개(Public)" 범위 — 조직/반에 종속되지 않아 계정당 개수를 제한한다.
// org/class 범위는 해당 조직/반 소속 권한이 전제되므로 무제한.
const PUBLIC_SCOPE_RANGES = ["all", "google_workspace"];

// 학교 공용 IP(같은 반/조직이 동일 egress IP를 공유)를 고려해 여유 있게 설정
// (survey 공개응답 rate limit 상향 사례와 동일한 이유 — [[user-preferences]])
const providerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_OAUTH_REQUESTS" },
  skipSuccessfulRequests: true,
});

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

async function requireDeveloper(req: any, res: any, next: any) {
  const [rows] = await pool.query("SELECT developer_mode FROM users WHERE id = ?", [req.user!.id]);
  const users = rows as Row[];
  if (!users.length || !users[0].developer_mode) {
    res.status(403).json({ error: "DEVELOPER_MODE_REQUIRED" });
    return;
  }
  next();
}

async function getOwnedApp(appId: number, ownerId: number): Promise<Row | null> {
  if (!Number.isFinite(appId)) return null;
  const [rows] = await pool.query("SELECT * FROM oauth_apps WHERE id = ? AND owner_id = ?", [appId, ownerId]);
  const apps = rows as Row[];
  return apps[0] ?? null;
}

/** 이 사용자의 "공개(Public)" 범위 앱 사용량/한도 조회 */
async function getPublicAppUsage(userId: number): Promise<{ used: number; max: number }> {
  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM oauth_apps WHERE owner_id = ? AND scope_range IN ('all','google_workspace')",
    [userId]
  );
  const used = Number((countRows as Row[])[0]?.cnt ?? 0);
  const [userRows] = await pool.query("SELECT max_oauth_public_apps FROM users WHERE id = ?", [userId]);
  const max = Number((userRows as Row[])[0]?.max_oauth_public_apps ?? 5);
  return { used, max };
}

function genClientId(): string {
  return crypto.randomBytes(16).toString("hex"); // 32자
}
function genClientSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}
function genOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 신뢰 리다이렉트 항목으로 등록 가능한 값인지 검증.
 * - 순수 오리진(`https://app.example`)  → 동일 오리진 redirect_uri 허용(레거시 호환)
 * - 전체 redirect_uri(`https://app.example/callback`) → 정확 일치 검증(BCP 권장, 더 안전)
 * 어느 쪽이든 userinfo/fragment는 금지(코드 유출·피싱 표면 축소), 길이 255 이하.
 */
function isValidRedirectEntry(value: string): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) return false;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.username || u.password || u.hash) return false;
    return true;
  } catch {
    return false;
  }
}

/** SHA-256 해시를 상수시간으로 비교 (타이밍 공격 방지) */
function safeCompareHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizeScope(raw: unknown): string[] | null {
  const str = typeof raw === "string" && raw.trim() ? raw : SCOPES.join(" ");
  const requested = str.split(/\s+/).filter(Boolean);
  const unique = [...new Set(requested)];
  if (unique.length === 0 || unique.some((s) => !SCOPES.includes(s))) return null;
  return unique;
}

function base64UrlSha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

/** 등록 항목 1건과 redirect_uri 매칭: 정확 일치(권장) 또는 순수 오리진 등록 시 동일 오리진(레거시). */
function redirectUriMatchesEntry(redirectUri: string, entry: string): boolean {
  if (redirectUri === entry) return true; // 전체 URI 정확 일치 (BCP 권장 경로)
  try {
    const e = new URL(entry);
    if (entry === e.origin) {
      // entry가 경로 없는 순수 오리진 → 같은 오리진의 redirect_uri 허용(기존 등록 호환)
      return new URL(redirectUri).origin === entry;
    }
  } catch {
    /* 잘못된 등록 항목은 무시 */
  }
  return false;
}

/** redirect_uri가 앱의 신뢰 항목 중 하나에 매칭되는지 검사. userinfo/fragment 포함 시 즉시 거부. */
async function isRedirectUriAllowed(appId: number, redirectUri: string): Promise<boolean> {
  try {
    const u = new URL(redirectUri);
    if (u.username || u.password || u.hash) return false;
  } catch {
    return false;
  }
  const [rows] = await pool.query("SELECT origin FROM oauth_app_origins WHERE app_id = ?", [appId]);
  return (rows as Row[]).some((r) => redirectUriMatchesEntry(redirectUri, r.origin as string));
}

async function isBanned(appId: number, userId: number): Promise<Row | null> {
  const [rows] = await pool.query(
    "SELECT reason, banned_at FROM oauth_app_bans WHERE app_id = ? AND user_id = ?",
    [appId, userId]
  );
  const bans = rows as Row[];
  return bans[0] ?? null;
}

function logEvent(appId: number, userId: number | null, eventType: "request" | "success" | "denied" | "banned") {
  pool
    .query("INSERT INTO oauth_login_events (app_id, user_id, event_type) VALUES (?, ?, ?)", [appId, userId, eventType])
    .catch((e) => console.error("[openoauth] event log 실패", e));
}

function appPublicShape(app: Row) {
  return {
    id: app.id as number,
    codeName: app.code_name as string,
    displayName: app.display_name as string,
    mainSiteUrl: app.main_site_url as string,
    loginMeans: app.login_means as string,
    scopeRange: app.scope_range as string,
    scopeOrgId: app.scope_org_id as number | null,
    scopeClassId: app.scope_class_id as number | null,
    scopeGoogleDomain: app.scope_google_domain as string | null,
    clientId: app.client_id as string,
    createdAt: app.created_at,
  };
}

// ════════════════════════════════════════════════════════════════════════
// 관리 API — 개발자 모드 사용자, 자신이 소유한 앱만
// ════════════════════════════════════════════════════════════════════════

// ── GET /apps ──────────────────────────────────────────────────────────────
router.get("/apps", requireAuth, requireDeveloper, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM oauth_apps WHERE owner_id = ? ORDER BY created_at DESC",
    [req.user!.id]
  );
  res.json({ apps: (rows as Row[]).map(appPublicShape) });
});

// ── POST /apps ─────────────────────────────────────────────────────────────
router.post("/apps", requireAuth, requireDeveloper, async (req, res) => {
  const { codeName, displayName, mainSiteUrl, loginMeans, scopeRange, scopeOrgId, scopeClassId, scopeGoogleDomain } =
    req.body as Record<string, unknown>;

  if (typeof codeName !== "string" || !CODE_NAME_RE.test(codeName)) {
    res.status(400).json({ error: "INVALID_CODE_NAME" });
    return;
  }
  if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 120) {
    res.status(400).json({ error: "INVALID_DISPLAY_NAME" });
    return;
  }
  if (typeof mainSiteUrl !== "string" || !isValidHttpUrl(mainSiteUrl)) {
    res.status(400).json({ error: "INVALID_MAIN_SITE_URL" });
    return;
  }
  if (!["akademiya", "google", "both"].includes(loginMeans as string)) {
    res.status(400).json({ error: "INVALID_LOGIN_MEANS" });
    return;
  }
  if (!["all", "org", "class", "google_workspace"].includes(scopeRange as string)) {
    res.status(400).json({ error: "INVALID_SCOPE_RANGE" });
    return;
  }
  // Google Workspace 범위는 Google 전용 앱에서만 선택 가능
  if (scopeRange === "google_workspace" && loginMeans !== "google") {
    res.status(400).json({ error: "GOOGLE_WORKSPACE_REQUIRES_GOOGLE_ONLY" });
    return;
  }
  if (scopeRange === "org" && !Number(scopeOrgId)) {
    res.status(400).json({ error: "SCOPE_ORG_REQUIRED" });
    return;
  }
  if (scopeRange === "class" && !Number(scopeClassId)) {
    res.status(400).json({ error: "SCOPE_CLASS_REQUIRED" });
    return;
  }
  if (scopeRange === "google_workspace" && (typeof scopeGoogleDomain !== "string" || !scopeGoogleDomain.trim())) {
    res.status(400).json({ error: "SCOPE_DOMAIN_REQUIRED" });
    return;
  }

  if (PUBLIC_SCOPE_RANGES.includes(scopeRange as string)) {
    const { used, max } = await getPublicAppUsage(req.user!.id);
    if (used >= max) {
      res.status(403).json({ error: "PUBLIC_APP_QUOTA_EXCEEDED", used, max });
      return;
    }
  }

  const clientId = genClientId();
  const clientSecret = genClientSecret();

  try {
    const [result] = await pool.query(
      `INSERT INTO oauth_apps
        (owner_id, client_id, client_secret_hash, code_name, display_name, main_site_url,
         login_means, scope_range, scope_org_id, scope_class_id, scope_google_domain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user!.id, clientId, hashToken(clientSecret), codeName, displayName.trim(), mainSiteUrl,
        loginMeans, scopeRange,
        scopeRange === "org" ? Number(scopeOrgId) : null,
        scopeRange === "class" ? Number(scopeClassId) : null,
        scopeRange === "google_workspace" ? (scopeGoogleDomain as string).trim().toLowerCase() : null,
      ]
    );
    const appId = (result as { insertId: number }).insertId;

    res.status(201).json({
      id: appId,
      clientId,
      clientSecret, // 평문 — 이 응답이 유일한 노출 기회
      codeName,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      res.status(409).json({ error: "CODE_NAME_EXISTS" });
      return;
    }
    console.error("[openoauth] apps 생성 실패", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ── GET /apps/quota — 공개(Public) 앱 사용량/한도 조회 ───────────────────────
// 라우트 순서 주의: "/apps/:id"보다 먼저 등록해야 "quota"가 :id로 매칭되지 않음
router.get("/apps/quota", requireAuth, requireDeveloper, async (req, res) => {
  const usage = await getPublicAppUsage(req.user!.id);
  res.json(usage);
});

// ── GET /apps/:id ──────────────────────────────────────────────────────────
router.get("/apps/:id", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const [origins] = await pool.query(
    "SELECT id, origin FROM oauth_app_origins WHERE app_id = ? ORDER BY created_at",
    [app.id]
  );
  res.json({ app: appPublicShape(app), origins });
});

// ── PATCH /apps/:id ────────────────────────────────────────────────────────
router.patch("/apps/:id", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const { displayName, mainSiteUrl, loginMeans, scopeRange, scopeOrgId, scopeClassId, scopeGoogleDomain } =
    req.body as Record<string, unknown>;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (displayName !== undefined) {
    if (typeof displayName !== "string" || !displayName.trim() || displayName.length > 120) {
      res.status(400).json({ error: "INVALID_DISPLAY_NAME" }); return;
    }
    updates.push("display_name = ?"); values.push(displayName.trim());
  }
  if (mainSiteUrl !== undefined) {
    if (typeof mainSiteUrl !== "string" || !isValidHttpUrl(mainSiteUrl)) {
      res.status(400).json({ error: "INVALID_MAIN_SITE_URL" }); return;
    }
    updates.push("main_site_url = ?"); values.push(mainSiteUrl);
  }

  const finalLoginMeans = (loginMeans as string) ?? (app.login_means as string);
  const finalScopeRange = (scopeRange as string) ?? (app.scope_range as string);

  if (loginMeans !== undefined) {
    if (!["akademiya", "google", "both"].includes(loginMeans as string)) {
      res.status(400).json({ error: "INVALID_LOGIN_MEANS" }); return;
    }
    updates.push("login_means = ?"); values.push(loginMeans);
  }
  if (scopeRange !== undefined) {
    if (!["all", "org", "class", "google_workspace"].includes(scopeRange as string)) {
      res.status(400).json({ error: "INVALID_SCOPE_RANGE" }); return;
    }
    updates.push("scope_range = ?"); values.push(scopeRange);
  }
  if (finalScopeRange === "google_workspace" && finalLoginMeans !== "google") {
    res.status(400).json({ error: "GOOGLE_WORKSPACE_REQUIRES_GOOGLE_ONLY" }); return;
  }
  if (
    scopeRange !== undefined &&
    PUBLIC_SCOPE_RANGES.includes(finalScopeRange) &&
    !PUBLIC_SCOPE_RANGES.includes(app.scope_range as string)
  ) {
    const { used, max } = await getPublicAppUsage(req.user!.id);
    if (used >= max) {
      res.status(403).json({ error: "PUBLIC_APP_QUOTA_EXCEEDED", used, max });
      return;
    }
  }
  if (scopeOrgId !== undefined) {
    updates.push("scope_org_id = ?"); values.push(scopeOrgId ? Number(scopeOrgId) : null);
  }
  if (scopeClassId !== undefined) {
    updates.push("scope_class_id = ?"); values.push(scopeClassId ? Number(scopeClassId) : null);
  }
  if (scopeGoogleDomain !== undefined) {
    updates.push("scope_google_domain = ?");
    values.push(scopeGoogleDomain ? (scopeGoogleDomain as string).trim().toLowerCase() : null);
  }

  if (updates.length === 0) { res.status(400).json({ error: "NO_CHANGES" }); return; }

  values.push(app.id);
  await pool.query(`UPDATE oauth_apps SET ${updates.join(", ")} WHERE id = ?`, values);

  const updated = await getOwnedApp(Number(req.params.id), req.user!.id);
  res.json({ app: appPublicShape(updated!) });
});

// ── DELETE /apps/:id ───────────────────────────────────────────────────────
router.delete("/apps/:id", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  await pool.query("DELETE FROM oauth_apps WHERE id = ?", [app.id]);
  res.json({ ok: true });
});

// ── POST /apps/:id/regenerate-secret ──────────────────────────────────────
router.post("/apps/:id/regenerate-secret", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const clientSecret = genClientSecret();
  await pool.query("UPDATE oauth_apps SET client_secret_hash = ? WHERE id = ?", [hashToken(clientSecret), app.id]);
  res.json({ clientSecret });
});

// ── Origins (신뢰 리다이렉트 출처/URI 화이트리스트) ─────────────────────────
// 순수 오리진 또는 전체 redirect_uri(정확 일치, 권장) 둘 다 등록 가능.
router.post("/apps/:id/origins", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const { origin } = req.body as { origin?: string };
  if (typeof origin !== "string" || !isValidRedirectEntry(origin)) {
    res.status(400).json({ error: "INVALID_ORIGIN" });
    return;
  }
  try {
    const [result] = await pool.query(
      "INSERT INTO oauth_app_origins (app_id, origin) VALUES (?, ?)",
      [app.id, origin]
    );
    res.status(201).json({ id: (result as { insertId: number }).insertId, origin });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
      res.status(409).json({ error: "ORIGIN_EXISTS" });
      return;
    }
    console.error("[openoauth] origin 추가 실패", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.delete("/apps/:id/origins/:originId", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  await pool.query("DELETE FROM oauth_app_origins WHERE id = ? AND app_id = ?", [Number(req.params.originId), app.id]);
  res.json({ ok: true });
});

// ── GET /apps/:id/stats — 기간별 로그인 통계 ──────────────────────────────
router.get("/apps/:id/stats", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const period = (req.query.period as string) ?? "7d";
  let from: Date;
  let to: Date = new Date();
  const now = new Date();

  if (period === "today") {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  } else if (period === "7d") {
    from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  } else if (period === "30d") {
    from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  } else if (period === "custom") {
    const fromRaw = req.query.from as string;
    const toRaw = req.query.to as string;
    const parsedFrom = fromRaw ? new Date(fromRaw) : null;
    const parsedTo = toRaw ? new Date(toRaw) : null;
    if (!parsedFrom || Number.isNaN(parsedFrom.getTime()) || !parsedTo || Number.isNaN(parsedTo.getTime())) {
      res.status(400).json({ error: "INVALID_RANGE" });
      return;
    }
    from = parsedFrom;
    to = parsedTo;
  } else {
    res.status(400).json({ error: "INVALID_PERIOD" });
    return;
  }

  const [totalsRows] = await pool.query(
    `SELECT
       COUNT(DISTINCT CASE WHEN event_type = 'success' THEN user_id END) AS uniqueUsers,
       SUM(event_type = 'request') AS requestCount
     FROM oauth_login_events
     WHERE app_id = ? AND created_at >= ? AND created_at <= ?`,
    [app.id, from, to]
  );
  const totals = (totalsRows as Row[])[0];

  const [seriesRows] = await pool.query(
    `SELECT DATE(created_at) AS date,
            SUM(event_type = 'request') AS requests,
            COUNT(DISTINCT CASE WHEN event_type = 'success' THEN user_id END) AS users
     FROM oauth_login_events
     WHERE app_id = ? AND created_at >= ? AND created_at <= ?
     GROUP BY DATE(created_at)
     ORDER BY date`,
    [app.id, from, to]
  );

  res.json({
    uniqueUsers: Number(totals?.uniqueUsers ?? 0),
    requestCount: Number(totals?.requestCount ?? 0),
    series: (seriesRows as Row[]).map((r) => ({
      date: r.date,
      requests: Number(r.requests ?? 0),
      users: Number(r.users ?? 0),
    })),
  });
});

// ── 사용자 검색 (BAN 대상 지정용) ──────────────────────────────────────────
router.get("/apps/:id/user-search", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const q = ((req.query.q as string) ?? "").trim();
  if (!q) { res.json({ users: [] }); return; }

  // BAN 대상은 "이 앱을 실제로 이용(로그인 이벤트가 있는)"한 사용자로 한정한다.
  // 과거처럼 전체 users를 검색하면 개발자 모드 계정이 전교생 이메일을 열거할 수 있다.
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id, u.email, u.display_name
       FROM users u
       JOIN oauth_login_events e ON e.user_id = u.id AND e.app_id = ?
      WHERE (u.email LIKE ? OR u.display_name LIKE ?)
      LIMIT 20`,
    [app.id, `%${q}%`, `%${q}%`]
  );
  res.json({ users: rows });
});

// ── BAN 목록/등록/해제 ─────────────────────────────────────────────────────
router.get("/apps/:id/bans", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const [rows] = await pool.query(
    `SELECT b.user_id, u.email, u.display_name, b.reason, b.banned_at
     FROM oauth_app_bans b
     JOIN users u ON u.id = b.user_id
     WHERE b.app_id = ?
     ORDER BY b.banned_at DESC`,
    [app.id]
  );
  res.json({ bans: rows });
});

router.post("/apps/:id/bans", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }

  const { userId, reason } = req.body as { userId?: number; reason?: string };
  const targetId = Number(userId);
  if (!targetId) { res.status(400).json({ error: "MISSING_USER_ID" }); return; }

  const [userRows] = await pool.query("SELECT id FROM users WHERE id = ?", [targetId]);
  if (!(userRows as Row[]).length) { res.status(404).json({ error: "USER_NOT_FOUND" }); return; }

  await pool.query(
    `INSERT INTO oauth_app_bans (app_id, user_id, reason, banned_by, banned_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), banned_by = VALUES(banned_by), banned_at = NOW()`,
    [app.id, targetId, reason?.trim() || null, req.user!.id]
  );
  // 즉시 세션 무효화 — 해당 앱에서 발급받은 모든 토큰 폐기 (기존 reports.ts ban 패턴과 동일)
  await pool.query(
    "UPDATE oauth_tokens SET revoked = 1 WHERE app_id = ? AND user_id = ?",
    [app.id, targetId]
  );
  res.json({ ok: true });
});

router.delete("/apps/:id/bans/:userId", requireAuth, requireDeveloper, async (req, res) => {
  const app = await getOwnedApp(Number(req.params.id), req.user!.id);
  if (!app) { res.status(404).json({ error: "NOT_FOUND" }); return; }
  await pool.query("DELETE FROM oauth_app_bans WHERE app_id = ? AND user_id = ?", [app.id, Number(req.params.userId)]);
  res.json({ ok: true });
});

// ── POST /quota-requests — 공개(Public) 앱 개수 한도 확장 요청 ───────────────
// (자료실 파일 한도 확장 요청 resources.ts의 POST /limit-request와 동일한 패턴)
router.post("/quota-requests", requireAuth, requireDeveloper, async (req, res) => {
  const { requestedMaxApps, reason } = req.body as Record<string, unknown>;
  const { max: currentMax } = await getPublicAppUsage(req.user!.id);
  const requested = Number(requestedMaxApps);

  if (!Number.isFinite(requested) || requested <= currentMax) {
    res.status(400).json({ error: "INVALID_REQUESTED_MAX" });
    return;
  }

  await pool.query(
    `INSERT INTO oauth_app_quota_requests (requester_id, requested_max_apps, reason) VALUES (?, ?, ?)`,
    [req.user!.id, requested, typeof reason === "string" && reason.trim() ? reason.trim() : null]
  );
  res.status(201).json({ message: "requested" });
});

// ════════════════════════════════════════════════════════════════════════
// 제공자 API (공개) — OAuth App이 "Akademiya로 로그인"을 구현할 때 사용
// ════════════════════════════════════════════════════════════════════════

// ── GET /authorize-info — 로그인 화면 렌더링에 필요한 최소 정보 ────────────
router.get("/authorize-info", providerLimiter, async (req, res) => {
  const clientId = req.query.client_id as string;
  const redirectUri = req.query.redirect_uri as string;
  const scope = req.query.scope as string | undefined;

  if (!clientId || !redirectUri) { res.status(400).json({ error: "MISSING_PARAMS" }); return; }

  const [rows] = await pool.query("SELECT * FROM oauth_apps WHERE client_id = ?", [clientId]);
  const app = (rows as Row[])[0];
  if (!app) { res.status(400).json({ error: "INVALID_CLIENT" }); return; }

  try {
    new URL(redirectUri); // 형식 검증(파싱 가능 여부)
  } catch {
    res.status(400).json({ error: "INVALID_REDIRECT_URI" });
    return;
  }
  if (!(await isRedirectUriAllowed(app.id as number, redirectUri))) {
    res.status(400).json({ error: "REDIRECT_URI_NOT_WHITELISTED" });
    return;
  }
  if (normalizeScope(scope) === null) {
    res.status(400).json({ error: "INVALID_SCOPE" });
    return;
  }

  logEvent(app.id as number, null, "request");

  const scopeRange = app.scope_range as string;
  let scopeOrg: { name: string; code: string } | null = null;
  let scopeClass: { name: string; code: string } | null = null;

  if (scopeRange === "org" && app.scope_org_id) {
    const [orgRows] = await pool.query("SELECT name, code FROM organizations WHERE id = ?", [app.scope_org_id]);
    const org = (orgRows as Row[])[0];
    if (org) scopeOrg = { name: org.name as string, code: org.code as string };
  } else if (scopeRange === "class" && app.scope_class_id) {
    const [classRows] = await pool.query(
      `SELECT c.name AS name, c.code AS code, o.code AS org_code
       FROM classes c JOIN organizations o ON o.id = c.org_id
       WHERE c.id = ?`,
      [app.scope_class_id]
    );
    const cls = (classRows as Row[])[0];
    if (cls) scopeClass = { name: cls.name as string, code: `${cls.org_code}${cls.code}` };
  }

  res.json({
    clientId: app.client_id,
    displayName: app.display_name,
    mainSiteUrl: app.main_site_url,
    loginMeans: app.login_means,
    scopeRange,
    scopeOrg,
    scopeClass,
    scopeGoogleDomain: app.scope_google_domain,
  });
});

// ── POST /authorize — 로그인된 사용자가 "허용"을 누른 순간 호출 ───────────
router.post("/authorize", requireAuth, providerLimiter, async (req, res) => {
  const { clientId, redirectUri, state, scope, codeChallenge, codeChallengeMethod } =
    req.body as Record<string, unknown>;

  if (typeof clientId !== "string" || typeof redirectUri !== "string") {
    res.status(400).json({ error: "MISSING_PARAMS" });
    return;
  }

  const [rows] = await pool.query("SELECT * FROM oauth_apps WHERE client_id = ?", [clientId]);
  const app = (rows as Row[])[0];
  if (!app) { res.status(400).json({ error: "INVALID_CLIENT" }); return; }

  try {
    new URL(redirectUri); // 형식 검증(파싱 가능 여부)
  } catch {
    res.status(400).json({ error: "INVALID_REDIRECT_URI" });
    return;
  }
  if (!(await isRedirectUriAllowed(app.id as number, redirectUri))) {
    res.status(400).json({ error: "REDIRECT_URI_NOT_WHITELISTED" });
    return;
  }

  const scopes = normalizeScope(scope);
  if (scopes === null) { res.status(400).json({ error: "INVALID_SCOPE" }); return; }

  // PKCE 필수 (S256만 허용)
  if (typeof codeChallenge !== "string" || !codeChallenge || codeChallengeMethod !== "S256") {
    res.status(400).json({ error: "PKCE_REQUIRED" });
    return;
  }

  const userId = req.user!.id;

  // BAN 확인
  const ban = await isBanned(app.id as number, userId);
  if (ban) {
    logEvent(app.id as number, userId, "banned");
    res.status(403).json({ error: "OAUTH_APP_BANNED", reason: ban.reason, bannedAt: ban.banned_at });
    return;
  }

  // Google 전용 앱은 Google 계정 연동 필수
  if (app.login_means === "google") {
    const [userRows] = await pool.query("SELECT google_id, email FROM users WHERE id = ?", [userId]);
    const u = (userRows as Row[])[0];
    if (!u?.google_id) {
      logEvent(app.id as number, userId, "denied");
      res.status(403).json({ error: "OAUTH_GOOGLE_ONLY" });
      return;
    }
  }

  // 로그인 허용 범위(scope_range) 검증
  const scopeRange = app.scope_range as string;
  let eligible = true;
  if (scopeRange === "org") {
    const [m] = await pool.query(
      "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ?",
      [app.scope_org_id, userId]
    );
    eligible = (m as Row[]).length > 0;
  } else if (scopeRange === "class") {
    const [m] = await pool.query(
      "SELECT 1 FROM class_members WHERE class_id = ? AND user_id = ?",
      [app.scope_class_id, userId]
    );
    eligible = (m as Row[]).length > 0;
  } else if (scopeRange === "google_workspace") {
    const [userRows] = await pool.query("SELECT google_id, email FROM users WHERE id = ?", [userId]);
    const u = (userRows as Row[])[0];
    const domain = (u?.email as string | undefined)?.split("@")[1]?.toLowerCase();
    eligible = !!u?.google_id && domain === app.scope_google_domain;
  }
  if (!eligible) {
    logEvent(app.id as number, userId, "denied");
    res.status(403).json({ error: "OAUTH_NOT_ELIGIBLE" });
    return;
  }

  const code = genOpaqueToken();
  await pool.query(
    `INSERT INTO oauth_auth_codes
       (code_hash, app_id, user_id, redirect_uri, scope, code_challenge, code_challenge_method, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      hashToken(code), app.id, userId, redirectUri, scopes.join(" "),
      codeChallenge, codeChallengeMethod, new Date(Date.now() + CODE_TTL_MS),
    ]
  );

  logEvent(app.id as number, userId, "success");

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (typeof state === "string" && state) redirectUrl.searchParams.set("state", state);

  res.json({ redirectUrl: redirectUrl.toString() });
});

// ── POST /token — 인가 코드 ↔ 토큰 교환 / 리프레시 토큰 회전 ──────────────
router.post("/token", providerLimiter, async (req, res) => {
  const { grantType, clientId, clientSecret } = req.body as Record<string, unknown>;

  if (typeof clientId !== "string" || typeof clientSecret !== "string") {
    res.status(400).json({ error: "MISSING_CLIENT_CREDENTIALS" });
    return;
  }
  const [rows] = await pool.query("SELECT * FROM oauth_apps WHERE client_id = ?", [clientId]);
  const app = (rows as Row[])[0];
  if (!app || !safeCompareHash(hashToken(clientSecret), app.client_secret_hash as string)) {
    res.status(401).json({ error: "INVALID_CLIENT" });
    return;
  }

  if (grantType === "authorization_code") {
    const { code, redirectUri, codeVerifier } = req.body as Record<string, unknown>;
    if (typeof code !== "string" || typeof redirectUri !== "string" || typeof codeVerifier !== "string") {
      res.status(400).json({ error: "MISSING_PARAMS" });
      return;
    }

    const [codeRows] = await pool.query(
      "SELECT * FROM oauth_auth_codes WHERE code_hash = ? AND app_id = ?",
      [hashToken(code), app.id]
    );
    const authCode = (codeRows as Row[])[0];
    if (!authCode || authCode.used || new Date(authCode.expires_at as string) < new Date()) {
      res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
      return;
    }
    if (authCode.redirect_uri !== redirectUri) {
      res.status(400).json({ error: "REDIRECT_URI_MISMATCH" });
      return;
    }

    // PKCE 검증 (S256만 지원)
    const expectedChallenge = authCode.code_challenge_method === "S256"
      ? base64UrlSha256(codeVerifier)
      : codeVerifier;
    if (expectedChallenge !== authCode.code_challenge) {
      res.status(400).json({ error: "INVALID_CODE_VERIFIER" });
      return;
    }

    // 코드 사용 처리 — 원자적 1회용 소비(select→update 사이 레이스로 인한 이중 교환 방지)
    const [claim] = await pool.query(
      "UPDATE oauth_auth_codes SET used = 1 WHERE id = ? AND used = 0",
      [authCode.id]
    );
    if ((claim as { affectedRows: number }).affectedRows !== 1) {
      res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
      return;
    }

    // 발급 직전 재확인 (인가~교환 사이 BAN 되었을 가능성 방어)
    const ban = await isBanned(app.id as number, authCode.user_id as number);
    if (ban) {
      res.status(403).json({ error: "OAUTH_APP_BANNED" });
      return;
    }

    const accessToken = genOpaqueToken();
    const refreshToken = genOpaqueToken();
    await pool.query(
      `INSERT INTO oauth_tokens
         (app_id, user_id, access_token_hash, refresh_token_hash, scope, access_expires_at, refresh_expires_at)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [
        app.id, authCode.user_id, hashToken(accessToken), hashToken(refreshToken), authCode.scope,
        ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_DAYS,
      ]
    );

    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SEC,
      scope: authCode.scope,
    });
    return;
  }

  if (grantType === "refresh_token") {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (typeof refreshToken !== "string") { res.status(400).json({ error: "MISSING_PARAMS" }); return; }

    const [tokenRows] = await pool.query(
      `SELECT * FROM oauth_tokens
       WHERE refresh_token_hash = ? AND app_id = ? AND revoked = 0 AND refresh_expires_at > NOW()`,
      [hashToken(refreshToken), app.id]
    );
    const tokenRow = (tokenRows as Row[])[0];
    if (!tokenRow) { res.status(401).json({ error: "INVALID_REFRESH_TOKEN" }); return; }

    const ban = await isBanned(app.id as number, tokenRow.user_id as number);
    if (ban) {
      await pool.query("UPDATE oauth_tokens SET revoked = 1 WHERE id = ?", [tokenRow.id]);
      res.status(403).json({ error: "OAUTH_APP_BANNED" });
      return;
    }

    await pool.query("UPDATE oauth_tokens SET revoked = 1 WHERE id = ?", [tokenRow.id]);

    const accessToken = genOpaqueToken();
    const newRefreshToken = genOpaqueToken();
    await pool.query(
      `INSERT INTO oauth_tokens
         (app_id, user_id, access_token_hash, refresh_token_hash, scope, access_expires_at, refresh_expires_at)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [
        app.id, tokenRow.user_id, hashToken(accessToken), hashToken(newRefreshToken), tokenRow.scope,
        ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_DAYS,
      ]
    );

    res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SEC,
      scope: tokenRow.scope,
    });
    return;
  }

  res.status(400).json({ error: "UNSUPPORTED_GRANT_TYPE" });
});

// ── GET /userinfo — 발급된 access token으로 사용자 정보 조회 ──────────────
router.get("/userinfo", providerLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "MISSING_TOKEN" }); return; }
  const token = authHeader.slice(7);

  const [rows] = await pool.query(
    "SELECT * FROM oauth_tokens WHERE access_token_hash = ? AND revoked = 0 AND access_expires_at > NOW()",
    [hashToken(token)]
  );
  const tokenRow = (rows as Row[])[0];
  if (!tokenRow) { res.status(401).json({ error: "INVALID_OR_EXPIRED_TOKEN" }); return; }

  const ban = await isBanned(tokenRow.app_id as number, tokenRow.user_id as number);
  if (ban) {
    await pool.query("UPDATE oauth_tokens SET revoked = 1 WHERE id = ?", [tokenRow.id]);
    res.status(403).json({ error: "OAUTH_APP_BANNED" });
    return;
  }

  const [userRows] = await pool.query(
    "SELECT id, email, display_name FROM users WHERE id = ?",
    [tokenRow.user_id]
  );
  const u = (userRows as Row[])[0];
  if (!u) { res.status(404).json({ error: "USER_NOT_FOUND" }); return; }

  const scopes = (tokenRow.scope as string).split(" ");
  const payload: Record<string, unknown> = { sub: String(u.id) };
  if (scopes.includes("profile")) payload.name = u.display_name;
  if (scopes.includes("email")) payload.email = u.email;
  res.json(payload);
});

export default router;
