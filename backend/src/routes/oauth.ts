/**
 * GMCAuto ↔ Akademiya OAuth 연동 엔드포인트
 *
 * 설계 원칙:
 * - Akademiya DB와 GMCAuto DB는 완전히 분리 (이 파일은 Akademiya 쪽)
 * - 추후 GMCAuto 서비스 제거 시 이 파일만 삭제하면 됨
 * - 코드 기반 one-time 인증 (15분 TTL, 메모리 저장)
 */
import crypto from "crypto";
import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// ── 인메모리 코드 저장소 (15분 TTL) ─────────────────────────────────────────
interface GmcOAuthEntry {
  userId:       number;
  displayName:  string;
  email:        string;
  hafsOrgPerm:  number | null;  // HAFS 조직 권한 (null = 비회원)
  expiresAt:    number;
}

const gmcOAuthCodes = new Map<string, GmcOAuthEntry>();

// 만료된 코드 자동 정리 (5분 간격)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of gmcOAuthCodes) {
    if (v.expiresAt < now) gmcOAuthCodes.delete(k);
  }
}, 5 * 60 * 1000);

/** HAFS 조직 내 user의 permission 조회 */
async function getHafsOrgPerm(userId: number): Promise<number | null> {
  // HAFS 조직은 code = 'HAFS', status = 'approved' 인 조직
  const [orgs] = await pool.execute(
    "SELECT id FROM organizations WHERE UPPER(code) = 'HAFS' AND status = 'approved'"
  ) as any[];

  if (!(orgs as any[]).length) return null;
  const hafsOrgId = (orgs as any[])[0].id as number;

  const [rows] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [hafsOrgId, userId]
  ) as any[];

  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
}

// ── POST /api/oauth/gmcauto-code ────────────────────────────────────────────
// 로그인된 Akademiya 사용자에게 GMCAuto용 단기 코드 발급
// (Akademiya 프론트엔드에서 호출 — Authorization: Bearer <accessToken>)
router.post("/gmcauto-code", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const email  = req.user!.email;

  // displayName은 JWT에 포함되지 않으므로 DB에서 조회
  const [userRows] = await pool.execute(
    "SELECT display_name FROM users WHERE id = ?",
    [userId]
  ) as any[];
  const displayName = (userRows as any[])[0]?.display_name ?? email.split("@")[0];

  const hafsOrgPerm = await getHafsOrgPerm(userId);

  // HAFS 조직 회원이 아니어도 코드 발급은 허용
  // (GMCAuto 측에서 HAFS 회원 여부 판단)

  const code = crypto.randomBytes(20).toString("hex");
  gmcOAuthCodes.set(code, {
    userId,
    displayName,
    email,
    hafsOrgPerm,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15분
  });

  res.json({ success: true, code });
});

// ── POST /api/oauth/gmcauto-verify ──────────────────────────────────────────
// GMCAuto 서버가 code를 검증하고 사용자 정보를 가져옴 (인증 불필요, 서버 간 호출)
// 보안: code는 40자 랜덤 hex, 1회용, 15분 TTL
router.post("/gmcauto-verify", async (req, res) => {
  const { code } = req.body as { code?: string };

  if (!code || typeof code !== "string" || code.length !== 40) {
    res.status(400).json({ success: false, message: "유효하지 않은 코드 형식" });
    return;
  }

  const entry = gmcOAuthCodes.get(code);
  if (!entry) {
    res.status(401).json({ success: false, message: "코드가 존재하지 않거나 만료됨" });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    gmcOAuthCodes.delete(code);
    res.status(401).json({ success: false, message: "코드가 만료되었습니다 (15분)" });
    return;
  }

  // 1회용 — 즉시 삭제
  gmcOAuthCodes.delete(code);

  res.json({
    success:     true,
    userId:      entry.userId,
    displayName: entry.displayName,
    email:       entry.email,
    hafsOrgPerm: entry.hafsOrgPerm,
  });
});

export default router;
