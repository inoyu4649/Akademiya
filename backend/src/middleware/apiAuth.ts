// Akademiya 1st-party 세션(JWT)과 OpenOAuth 서드파티 토큰을 동시에 받는 인증 미들웨어.
//
// 배경: Akademiya Cloud는 두 종류의 호출자를 갖는다.
//   1) Akademiya 프론트엔드 — 기존 requireAuth와 같은 Access Token(JWT)
//   2) PyDe Web 같은 OpenOAuth 앱의 서버 — 불투명(opaque) access token
// 두 경우 모두 Authorization: Bearer <token> 형태라 헤더만으로는 구분되지 않으므로,
// JWT 검증을 먼저 시도하고 실패하면 oauth_tokens 조회로 넘어간다
// (불투명 토큰은 JWT 형식이 아니라 jwt.verify가 항상 실패한다).
//
// ⚠️ 서드파티 경로는 /userinfo와 동일한 3중 검사를 거친다:
//    토큰 유효성 → 발급 당시 scope → 앱이 지금도 그 scope를 켜두었는지.
//    세 번째 검사가 없으면 앱 소유자가 권한을 꺼도 기존 토큰이 계속 통과한다.
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { hashToken } from "../utils/token.js";

type Row = Record<string, unknown>;

export interface ApiActor {
  userId: number;
  /** 'session' = Akademiya 웹앱 직접 로그인, 'oauth' = OpenOAuth 서드파티 앱 대리 호출 */
  via: "session" | "oauth";
  /** via === 'oauth'일 때 호출한 OAuth App의 id (감사·차단용) */
  appId?: number;
}

function scopeTokens(raw: unknown): string[] {
  return typeof raw === "string" ? raw.split(/\s+/).filter(Boolean) : [];
}

/**
 * requiredScope를 부여받은 호출자만 통과시킨다.
 * 1st-party JWT는 사용자 본인의 세션이므로 scope 검사 대상이 아니다(전체 권한).
 */
export function requireApiActor(requiredScope: string) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "MISSING_TOKEN" });
      return;
    }
    const token = authHeader.slice(7);

    // ── 1) Akademiya 웹앱 세션(JWT) ──────────────────────────────────────────
    try {
      const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!, {
        algorithms: ["HS256"],
      }) as Express.User;
      req.user = payload;
      req.actor = { userId: payload.id, via: "session" };
      next();
      return;
    } catch {
      // JWT가 아니거나 만료됨 → 불투명 토큰 경로로 폴백
    }

    // ── 2) OpenOAuth 불투명 토큰 ─────────────────────────────────────────────
    try {
      const [rows] = await pool.query(
        `SELECT t.id, t.user_id, t.app_id, t.scope,
                a.enabled_scopes, u.is_banned
         FROM oauth_tokens t
         JOIN oauth_apps a ON a.id = t.app_id
         JOIN users      u ON u.id = t.user_id
         WHERE t.access_token_hash = ? AND t.revoked = 0 AND t.access_expires_at > NOW()`,
        [hashToken(token)]
      );
      const tokenRow = (rows as Row[])[0];
      if (!tokenRow) {
        res.status(401).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
        return;
      }
      if (tokenRow.is_banned) {
        res.status(403).json({ error: "ACCOUNT_BANNED" });
        return;
      }

      // 발급 당시 부여된 scope + 앱에 지금도 켜져 있는 scope, 둘 다 만족해야 한다
      if (
        !scopeTokens(tokenRow.scope).includes(requiredScope) ||
        !scopeTokens(tokenRow.enabled_scopes).includes(requiredScope)
      ) {
        res.status(403).json({ error: "INSUFFICIENT_SCOPE", requiredScope });
        return;
      }

      // 앱 단위 BAN — 차단된 사용자는 즉시 토큰까지 폐기한다(/userinfo와 동일 정책)
      const [banRows] = await pool.query(
        "SELECT 1 FROM oauth_app_bans WHERE app_id = ? AND user_id = ?",
        [tokenRow.app_id, tokenRow.user_id]
      );
      if ((banRows as Row[]).length) {
        await pool.query("UPDATE oauth_tokens SET revoked = 1 WHERE id = ?", [tokenRow.id]);
        res.status(403).json({ error: "OAUTH_APP_BANNED" });
        return;
      }

      req.actor = {
        userId: tokenRow.user_id as number,
        via: "oauth",
        appId: tokenRow.app_id as number,
      };
      next();
    } catch (err) {
      console.error("[apiAuth] 토큰 검증 실패", err);
      res.status(500).json({ error: "SERVER_ERROR" });
    }
  };
}
