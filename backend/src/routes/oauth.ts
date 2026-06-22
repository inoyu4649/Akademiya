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
  hafsOrgPerm:  number | null;
  expiresAt:    number;
}

const gmcOAuthCodes = new Map<string, GmcOAuthEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of gmcOAuthCodes) {
    if (v.expiresAt < now) gmcOAuthCodes.delete(k);
  }
}, 5 * 60 * 1000);

async function getHafsOrgPerm(userId: number): Promise<number | null> {
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
router.post("/gmcauto-code", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const email  = req.user!.email;

  const [userRows] = await pool.execute(
    "SELECT display_name FROM users WHERE id = ?",
    [userId]
  ) as any[];
  const displayName = (userRows as any[])[0]?.display_name ?? email.split("@")[0];
  const hafsOrgPerm = await getHafsOrgPerm(userId);

  const code = crypto.randomBytes(20).toString("hex");
  gmcOAuthCodes.set(code, { userId, displayName, email, hafsOrgPerm, expiresAt: Date.now() + 15 * 60 * 1000 });

  res.json({ success: true, code });
});

// ── POST /api/oauth/gmcauto-verify ──────────────────────────────────────────
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
  gmcOAuthCodes.delete(code);
  res.json({ success: true, userId: entry.userId, displayName: entry.displayName, email: entry.email, hafsOrgPerm: entry.hafsOrgPerm });
});

export default router;
