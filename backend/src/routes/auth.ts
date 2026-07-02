import { Router, type IRouter } from "express";
import { PRIVACY_POLICY_VERSION } from "./privacy.js";
import { TERMS_OF_USE_VERSION } from "./terms.js";
import { INTL_TRANSFER_VERSION } from "./intl-transfer.js";
import bcrypt from "bcrypt";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  generateResetCode,
  createOAuthCode,
  consumeOAuthCode,
} from "../utils/token.js";
import { sendPasswordResetEmail } from "../utils/email.js";
import passport from "../config/passport.js";
import type { Response } from "express";

const router: IRouter = Router();
const REFRESH_COOKIE = "refresh_token";
const SALT_ROUNDS = 12;
const RESET_CODE_TTL_MIN = 15;

// GMCAuto에서 곧바로 Google OAuth로 진입했을 때, 로그인 완료 후 되돌아갈 GMC redirect_uri 화이트리스트
// (frontend/src/utils/gmcAuto.ts의 ALLOWED_GMC_ORIGINS와 동일하게 유지)
const ALLOWED_GMC_ORIGINS = ["https://gmc.akademiya.kr", "http://localhost:5174", "http://localhost:3001"];

function isSafeGmcRedirect(uri: string | undefined): uri is string {
  if (!uri) return false;
  try {
    const url = new URL(uri);
    return ALLOWED_GMC_ORIGINS.some((o) => uri.startsWith(o)) && url.pathname === "/auth/callback";
  } catch {
    return false;
  }
}

// AkashaAlt SSO: ai.akademiya.kr 로그인 완료 후 되돌아갈 콜백 URL 화이트리스트
const ALLOWED_AI_CALLBACKS = [
  "https://ai.akademiya.kr/auth/callback",
  "http://localhost:5175/auth/callback",
];

function isSafeAiRedirect(uri: string | undefined): uri is string {
  if (!uri) return false;
  return ALLOWED_AI_CALLBACKS.includes(uri);
}

type DbUser = Record<string, unknown>;

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

function userPayload(u: DbUser) {
  return {
    id: u.id as number,
    email: u.email as string,
    displayName: u.display_name as string,
    country: u.country as string | null,
    phone: u.phone as string | null,
    language: u.language as string | null,
    role: u.role as string,
    developerMode: !!u.developer_mode,
  };
}

// ─── POST /register ──────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { email, password, displayName, country, phone, language, privacyVersion, termsVersion, intlTransferVersion } =
    req.body as Record<string, string>;

  if (!email || !password || !displayName || !country || !phone) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }
  // 거주 국가는 대한민국(KR)만 허용 (GDPR 등 국외 규제 이슈 방지)
  if (country !== "KR") {
    res.status(400).json({ error: "COUNTRY_NOT_ALLOWED" });
    return;
  }
  if (Number(privacyVersion) !== PRIVACY_POLICY_VERSION) {
    res.status(400).json({ error: "PRIVACY_CONSENT_REQUIRED" });
    return;
  }
  if (Number(termsVersion) !== TERMS_OF_USE_VERSION) {
    res.status(400).json({ error: "TERMS_CONSENT_REQUIRED" });
    return;
  }
  if (Number(intlTransferVersion) !== INTL_TRANSFER_VERSION) {
    res.status(400).json({ error: "INTL_TRANSFER_CONSENT_REQUIRED" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "INVALID_EMAIL" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  try {
    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email.toLowerCase()]
    );
    if ((existing as unknown[]).length > 0) {
      res.status(409).json({ error: "EMAIL_EXISTS" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash, display_name, country, phone, language) VALUES (?, ?, ?, ?, ?, ?)",
      [email.toLowerCase(), passwordHash, displayName, country, phone, language || null]
    );
    const userId = (result as { insertId: number }).insertId;

    // ── 학교 이메일 도메인 자동 조직 가입 (제거됨) ──────────────────
    // 이메일/비밀번호 가입은 이메일 소유 검증이 없으므로(스푸핑 가능)
    // 도메인 기반 자동 가입을 적용하지 않는다. 도메인 자동 가입은
    // Google(이메일 검증됨) 로그인 경로(passport.ts)에서만 허용한다.
    // 일반 가입자는 가입 코드/관리자 승인 절차로 조직에 가입한다.

    // 개인정보 처리방침 동의 저장
    await pool.query(
      "INSERT INTO privacy_consents (user_id, service, version) VALUES (?, 'akademiya', ?)",
      [userId, PRIVACY_POLICY_VERSION]
    );
    // 이용약관 동의 저장
    await pool.query(
      "INSERT INTO terms_consents (user_id, service, version) VALUES (?, 'akademiya', ?)",
      [userId, TERMS_OF_USE_VERSION]
    );
    // 국외 이전 동의 저장 (별도 동의)
    await pool.query(
      "INSERT INTO intl_transfer_consents (user_id, service, version) VALUES (?, 'akademiya', ?)",
      [userId, INTL_TRANSFER_VERSION]
    );

    const accessToken = generateAccessToken({ id: userId, email: email.toLowerCase(), role: "user" });
    const refreshToken = generateRefreshToken();
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
      [userId, hashToken(refreshToken)]
    );

    setRefreshCookie(res, refreshToken);
    res.status(201).json({
      accessToken,
      user: { id: userId, email: email.toLowerCase(), displayName, country, phone, language: language || null, role: "user", developerMode: false },
    });
  } catch (err) {
    console.error("[register]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── POST /login ─────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body as Record<string, string>;
  if (!email || !password) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email.toLowerCase()]
    );
    const users = rows as DbUser[];
    const user = users[0];

    if (!user) {
      res.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }
    if (!user.password_hash) {
      res.status(401).json({ error: "GOOGLE_ONLY_ACCOUNT" });
      return;
    }
    const valid = await bcrypt.compare(password, user.password_hash as string);
    if (!valid) {
      res.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }
    if (user.is_banned) {
      res.status(403).json({ error: "ACCOUNT_BANNED" });
      return;
    }

    const accessToken = generateAccessToken({
      id: user.id as number,
      email: user.email as string,
      role: user.role as "user" | "admin",
    });
    const refreshToken = generateRefreshToken();
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
      [user.id, hashToken(refreshToken)]
    );

    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: userPayload(user) });
  } catch (err) {
    console.error("[login]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── POST /refresh ────────────────────────────────────────────────────────────
router.post("/refresh", async (req, res) => {
  const token = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
  if (!token) {
    res.status(401).json({ error: "NO_REFRESH_TOKEN" });
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT rt.user_id, u.email, u.role, u.display_name, u.country, u.phone, u.language, u.is_banned, u.developer_mode
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ? AND rt.expires_at > NOW()`,
      [hashToken(token)]
    );
    const records = rows as DbUser[];
    if (records.length === 0) {
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
      res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
      return;
    }
    const record = records[0];

    // 밴된 사용자는 세션 갱신 차단 + 기존 리프레시 토큰 폐기
    if (record.is_banned) {
      await pool.query("DELETE FROM refresh_tokens WHERE user_id = ?", [record.user_id]);
      res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
      res.status(403).json({ error: "ACCOUNT_BANNED" });
      return;
    }

    await pool.query("DELETE FROM refresh_tokens WHERE token_hash = ?", [hashToken(token)]);
    const newRefresh = generateRefreshToken();
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
      [record.user_id, hashToken(newRefresh)]
    );

    const accessToken = generateAccessToken({
      id: record.user_id as number,
      email: record.email as string,
      role: record.role as "user" | "admin",
    });
    setRefreshCookie(res, newRefresh);
    res.json({ accessToken, user: userPayload(record) });
  } catch (err) {
    console.error("[refresh]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const token = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
  if (token) {
    await pool
      .query("DELETE FROM refresh_tokens WHERE token_hash = ?", [hashToken(token)])
      .catch(() => {});
  }
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  res.json({ ok: true });
});

// ─── POST /forgot-password ────────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email: string };
  if (!email) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }

  res.json({ ok: true }); // 이메일 열거 방지: 항상 200 반환

  try {
    const [rows] = await pool.query(
      "SELECT id, language FROM users WHERE email = ?",
      [email.toLowerCase()]
    );
    const users = rows as { id: number; language: string | null }[];
    if (users.length === 0) return;

    const { id: userId, language } = users[0];
    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), used = 0`,
      [userId, hashToken(code), expiresAt]
    );

    const lang = language || "en";
    await sendPasswordResetEmail(email.toLowerCase(), code, lang);
  } catch (err) {
    console.error("[forgot-password]", err);
  }
});

// ─── POST /reset-password ─────────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body as Record<string, string>;
  if (!email || !code || !newPassword) {
    res.status(400).json({ error: "MISSING_FIELDS" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
    return;
  }

  try {
    const [rows] = await pool.query(
      `SELECT prt.id, prt.user_id
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE u.email = ? AND prt.token_hash = ? AND prt.expires_at > NOW() AND prt.used = 0`,
      [email.toLowerCase(), hashToken(code)]
    );
    const tokens = rows as { id: number; user_id: number }[];
    if (tokens.length === 0) {
      res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
      return;
    }

    const { id: tokenId, user_id } = tokens[0];
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user_id]);
    await pool.query("UPDATE password_reset_tokens SET used = 1 WHERE id = ?", [tokenId]);
    await pool.query("DELETE FROM refresh_tokens WHERE user_id = ?", [user_id]);

    res.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── GET /me ──────────────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, display_name, country, phone, language, role, developer_mode FROM users WHERE id = ?",
      [req.user!.id]
    );
    const users = rows as DbUser[];
    if (users.length === 0) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }
    res.json(userPayload(users[0]));
  } catch (err) {
    console.error("[me]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── PATCH /profile ───────────────────────────────────────────────────────────
router.patch("/profile", requireAuth, async (req, res) => {
  const { currentPassword, displayName, country, phone, newPassword, language } =
    req.body as Record<string, string>;
  const { developerMode } = req.body as { developerMode?: boolean };

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.user!.id]);
    const users = rows as DbUser[];
    const user = users[0];
    if (!user) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    const hasOtherChanges = !!(displayName || country || phone || newPassword || developerMode !== undefined);
    const isLanguageOnlyUpdate = !!language && !hasOtherChanges;

    if (!isLanguageOnlyUpdate && user.password_hash) {
      if (!currentPassword) {
        res.status(400).json({ error: "CURRENT_PASSWORD_REQUIRED" });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, user.password_hash as string);
      if (!valid) {
        res.status(401).json({ error: "WRONG_PASSWORD" });
        return;
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (displayName) { updates.push("display_name = ?"); values.push(displayName); }
    if (country)     { updates.push("country = ?");       values.push(country); }
    if (phone)       { updates.push("phone = ?");          values.push(phone); }
    if (language)    { updates.push("language = ?");       values.push(language); }
    if (developerMode !== undefined) { updates.push("developer_mode = ?"); values.push(developerMode ? 1 : 0); }
    if (newPassword) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: "PASSWORD_TOO_SHORT" });
        return;
      }
      updates.push("password_hash = ?");
      values.push(await bcrypt.hash(newPassword, SALT_ROUNDS));
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "NO_CHANGES" });
      return;
    }

    values.push(req.user!.id);
    await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);

    const [updated] = await pool.query(
      "SELECT id, email, display_name, country, phone, language, role, developer_mode FROM users WHERE id = ?",
      [req.user!.id]
    );
    res.json(userPayload((updated as DbUser[])[0]));
  } catch (err) {
    console.error("[profile]", err);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// ─── DELETE /account — 회원 탈퇴 ─────────────────────────────────────────────
router.delete("/account", requireAuth, async (req, res) => {
  const { password } = req.body as { password?: string };
  const userId = req.user!.id;

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT password_hash FROM users WHERE id = ?",
      [userId]
    );
    const users = rows as { password_hash: string | null }[];
    if (!users.length) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    // 비밀번호 계정: 재확인 필수
    if (users[0].password_hash) {
      if (!password) {
        res.status(400).json({ error: "PASSWORD_REQUIRED" });
        return;
      }
      const valid = await bcrypt.compare(password, users[0].password_hash);
      if (!valid) {
        res.status(401).json({ error: "WRONG_PASSWORD" });
        return;
      }
    }

    await conn.beginTransaction();
    // FK RESTRICT 컬럼을 먼저 NULL로 교체 (삭제 전 제약 해소)
    await conn.execute("UPDATE organizations       SET owner_id    = NULL WHERE owner_id    = ?", [userId]);
    await conn.execute("UPDATE classes             SET owner_id    = NULL WHERE owner_id    = ?", [userId]);
    await conn.execute("UPDATE assignments         SET creator_id  = NULL WHERE creator_id  = ?", [userId]);
    await conn.execute("UPDATE report_escalations  SET escalated_by = NULL WHERE escalated_by = ?", [userId]);
    // 사용자 삭제 — FK ON DELETE CASCADE 항목은 자동 삭제
    await conn.execute("DELETE FROM users WHERE id = ?", [userId]);
    await conn.commit();

    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ─── POST /ai-code ── AkashaAlt SSO: 로그인된 사용자의 OAuth 코드 발급 ──────────
router.post("/ai-code", requireAuth, (req, res) => {
  const code = createOAuthCode(req.user!.id);
  res.json({ code });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
// GMCAuto에서 곧바로 진입한 경우 ?state=<gmc redirect_uri>를 전달받아 콜백까지 왕복시킨다
// (state는 passport-oauth2가 세션으로 검증하는 게 아니라 우리가 직접 화이트리스트로 검증한다 — session:false이므로)
router.get("/google", (req, res, next) => {
  const rawState = typeof req.query.state === "string" ? req.query.state : undefined;
  const state = isSafeGmcRedirect(rawState) ? rawState : undefined;
  passport.authenticate("google", { scope: ["profile", "email"], session: false, state })(req, res, next);
});

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/auth/login?error=oauth_failed`,
  }),
  async (req, res) => {
    try {
      const user = req.user!;
      const code = createOAuthCode(user.id);
      const refreshToken = generateRefreshToken();
      await pool.query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))",
        [user.id, hashToken(refreshToken)]
      );
      setRefreshCookie(res, refreshToken);
      const rawState = typeof req.query.state === "string" ? req.query.state : undefined;
      const gmcRedirect = isSafeGmcRedirect(rawState) ? rawState : undefined;
      const dest = gmcRedirect
        ? `${process.env.FRONTEND_URL}/auth/callback?code=${code}&gmcRedirect=${encodeURIComponent(gmcRedirect)}`
        : `${process.env.FRONTEND_URL}/auth/callback?code=${code}`;
      res.redirect(dest);
    } catch {
      res.redirect(`${process.env.FRONTEND_URL}/auth/login?error=oauth_failed`);
    }
  }
);

// ─── POST /oauth-exchange ─────────────────────────────────────────────────────
router.post("/oauth-exchange", async (req, res) => {
  const { code } = req.body as { code: string };
  if (!code) {
    res.status(400).json({ error: "MISSING_CODE" });
    return;
  }

  const userId = consumeOAuthCode(code);
  if (!userId) {
    res.status(400).json({ error: "INVALID_OR_EXPIRED_CODE" });
    return;
  }

  try {
    const [rows] = await pool.query(
      "SELECT id, email, display_name, country, phone, language, role, developer_mode FROM users WHERE id = ?",
      [userId]
    );
    const users = rows as DbUser[];
    if (users.length === 0) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }
    const u = users[0];
    const accessToken = generateAccessToken({
      id: u.id as number,
      email: u.email as string,
      role: u.role as "user" | "admin",
    });
    res.json({ accessToken, user: userPayload(u) });
  } catch {
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export { isSafeAiRedirect };
export default router;
