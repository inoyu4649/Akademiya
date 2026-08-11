import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "../lib/push.js";

const router: IRouter = Router();

async function getOrgPermission(userId: number, orgId: number): Promise<number | null> {
  const [rows] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  ) as any[];
  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
}

// ── 조직(Organization)에 대하여 ─────────────────────────────────────────────
// v2.0부터 조직은 일반 사용자에게 노출되는 기능이 아니다. GMCAuto 3처럼
// "특정 학교 재학생만 로그인 가능"한 OAuth 클라이언트를 위한 소속 판별 수단으로만
// 존재하며, 조직의 생성·수정·삭제는 Akademiya 운영자(/api/admin/orgs)만 수행한다.
// 사용자가 할 수 있는 일은 계정 센터에서의 가입(코드 또는 Google 도메인 자동인식)과
// 탈퇴, 그리고 자신의 소속 조회뿐이다.

// GET /api/orgs/my — 내 조직 목록 + 가입 신청 현황
router.get("/my", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const [orgs] = await pool.execute(
    `SELECT o.id, o.name, o.code, o.status, o.timezone, om.permission
     FROM organizations o
     INNER JOIN org_members om ON om.org_id = o.id AND om.user_id = ?
     WHERE o.status = 'approved'
     ORDER BY o.name`,
    [userId]
  ) as any[];

  // 승인 대기 중인 내 가입 신청 (계정 센터에서 "승인 대기" 배지로 표시)
  const [pendingJoins] = await pool.execute(
    `SELECT ojr.id, ojr.status, ojr.created_at, o.id AS org_id, o.name, o.code
     FROM org_join_requests ojr
     INNER JOIN organizations o ON o.id = ojr.org_id
     WHERE ojr.user_id = ? AND ojr.status = 'pending'
     ORDER BY ojr.created_at DESC`,
    [userId]
  ) as any[];

  res.json({ orgs, pendingJoins });
});

// POST /api/orgs/join — 코드로 가입 신청
router.post("/join", requireAuth, async (req, res) => {
  const { code } = req.body as Record<string, string>;
  const userId = req.user!.id;

  const cleanCode = code?.trim().toUpperCase();
  if (!cleanCode) {
    res.status(400).json({ error: "org.join.codeRequired" });
    return;
  }

  const [orgs] = await pool.execute(
    "SELECT id, name, google_domain FROM organizations WHERE code = ? AND status = 'approved'",
    [cleanCode]
  ) as any[];
  if (!(orgs as any[]).length) {
    res.status(404).json({ error: "org.join.notFound" });
    return;
  }
  const org = (orgs as any[])[0];

  const [member] = await pool.execute(
    "SELECT id FROM org_members WHERE org_id = ? AND user_id = ?",
    [org.id, userId]
  ) as any[];
  if ((member as any[]).length > 0) {
    res.status(409).json({ error: "org.join.alreadyMember" });
    return;
  }

  // ── Google 학교 이메일 도메인 자동 가입 ─────────────────────────
  // 조직에 google_domain이 설정되어 있고 사용자 이메일 도메인과 일치하면
  // join_request 없이 org_members에 즉시 추가 (승인 불필요).
  // 단, 이메일 소유가 검증된 Google 계정(google_id 보유)에만 허용한다.
  // 이메일/비밀번호 가입 이메일은 미검증이라 스푸핑으로 무단 편입될 수 있음.
  const orgDomain   = (org.google_domain as string | null)?.toLowerCase();
  const userDomain  = req.user!.email.split("@")[1]?.toLowerCase() ?? "";
  const [verifiedRows] = await pool.execute(
    "SELECT google_id FROM users WHERE id = ?",
    [userId]
  ) as any[];
  const isGoogleVerified = !!(verifiedRows as any[])[0]?.google_id;
  if (orgDomain && userDomain === orgDomain && isGoogleVerified) {
    await pool.execute(
      "INSERT IGNORE INTO org_members (org_id, user_id, permission) VALUES (?, ?, 0)",
      [org.id, userId]
    );
    res.status(201).json({ message: "org.join.autoApproved", orgName: org.name });
    return;
  }

  // ── 일반 가입 신청 (관리자 승인 필요) ───────────────────────────
  const [existingReq] = await pool.execute(
    "SELECT id, status FROM org_join_requests WHERE org_id = ? AND user_id = ?",
    [org.id, userId]
  ) as any[];
  const existing = (existingReq as any[])[0];

  if (existing) {
    if (existing.status === "pending") {
      res.status(409).json({ error: "org.join.alreadyPending" });
      return;
    }
    // rejected → 재신청 허용
    await pool.execute(
      "UPDATE org_join_requests SET status = 'pending', created_at = NOW() WHERE id = ?",
      [existing.id]
    );
  } else {
    await pool.execute(
      "INSERT INTO org_join_requests (org_id, user_id) VALUES (?, ?)",
      [org.id, userId]
    );
  }

  res.status(201).json({ message: "org.join.success", orgName: org.name });
});

// GET /api/orgs/:id — 조직 상세
router.get("/:id", requireAuth, async (req, res) => {
  const orgId = Number(req.params.id);
  const userId = req.user!.id;

  const perm = await getOrgPermission(userId, orgId);
  if (perm === null) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [orgs] = await pool.execute(
    "SELECT id, name, code, timezone, google_domain FROM organizations WHERE id = ? AND status = 'approved'",
    [orgId]
  ) as any[];
  if (!(orgs as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }

  const [members] = await pool.execute(
    `SELECT u.id, u.display_name, u.email, om.permission, om.joined_at
     FROM org_members om
     INNER JOIN users u ON u.id = om.user_id
     WHERE om.org_id = ?
     ORDER BY om.permission DESC, u.display_name`,
    [orgId]
  ) as any[];

  res.json({ org: (orgs as any[])[0], members, myPermission: perm });
});

// GET /api/orgs/:id/join-requests — 가입 신청 목록 (permission 3+)
router.get("/:id/join-requests", requireAuth, async (req, res) => {
  const orgId = Number(req.params.id);
  const userId = req.user!.id;

  const perm = await getOrgPermission(userId, orgId);
  if (perm === null || perm < 3) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [rows] = await pool.execute(
    `SELECT ojr.id, ojr.created_at, u.id as user_id, u.display_name, u.email
     FROM org_join_requests ojr
     INNER JOIN users u ON u.id = ojr.user_id
     WHERE ojr.org_id = ? AND ojr.status = 'pending'
     ORDER BY ojr.created_at`,
    [orgId]
  ) as any[];

  res.json({ requests: rows });
});

// POST /api/orgs/:id/join-requests/:reqId/approve
router.post("/:id/join-requests/:reqId/approve", requireAuth, async (req, res) => {
  const orgId = Number(req.params.id);
  const reqId = Number(req.params.reqId);
  const userId = req.user!.id;

  const perm = await getOrgPermission(userId, orgId);
  if (perm === null || perm < 3) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [reqs] = await pool.execute(
    "SELECT id, user_id FROM org_join_requests WHERE id = ? AND org_id = ? AND status = 'pending'",
    [reqId, orgId]
  ) as any[];
  if (!(reqs as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const request = (reqs as any[])[0];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("UPDATE org_join_requests SET status = 'approved' WHERE id = ?", [reqId]);
    await conn.execute(
      "INSERT IGNORE INTO org_members (org_id, user_id, permission) VALUES (?, ?, 0)",
      [orgId, request.user_id]
    );
    await conn.commit();
    res.json({ message: "approved" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* 연결 이미 끊김 — rollback 실패는 무시 */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// POST /api/orgs/:id/join-requests/:reqId/reject
router.post("/:id/join-requests/:reqId/reject", requireAuth, async (req, res) => {
  const orgId = Number(req.params.id);
  const reqId = Number(req.params.reqId);
  const userId = req.user!.id;

  const perm = await getOrgPermission(userId, orgId);
  if (perm === null || perm < 3) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  await pool.execute(
    "UPDATE org_join_requests SET status = 'rejected' WHERE id = ? AND org_id = ? AND status = 'pending'",
    [reqId, orgId]
  );
  res.json({ message: "rejected" });
});

// PATCH /api/orgs/:id/members/:targetId/permission — 권한 변경 (permission 3+)
router.patch("/:id/members/:targetId/permission", requireAuth, async (req, res) => {
  const orgId = Number(req.params.id);
  const targetId = Number(req.params.targetId);
  const userId = req.user!.id;
  const { permission } = req.body as { permission: number };

  if (![0, 1, 2, 3].includes(Number(permission))) {
    res.status(400).json({ error: "invalidPermission" });
    return;
  }
  const perm = await getOrgPermission(userId, orgId);
  if (perm === null || perm < 3) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (targetId === userId) {
    res.status(400).json({ error: "cannotChangeSelf" });
    return;
  }

  const [result] = await pool.execute(
    "UPDATE org_members SET permission = ? WHERE org_id = ? AND user_id = ?",
    [Number(permission), orgId, targetId]
  ) as any[];
  if ((result as any).affectedRows === 0) {
    res.status(404).json({ error: "memberNotFound" });
    return;
  }
  res.json({ message: "updated" });
});

// ── DELETE /api/orgs/:id/leave ────────────────────────────────────────────────
// 조직 탈퇴 (마지막 관리자는 탈퇴 불가)
router.delete("/:id/leave", requireAuth, async (req, res) => {
  const orgId  = Number(req.params.id);
  const userId = req.user!.id;

  const perm = await getOrgPermission(userId, orgId);
  if (perm === null) {
    res.status(400).json({ error: "org.leave.notMember" });
    return;
  }

  // 유일한 관리자(permission 3)인 경우 탈퇴 불가
  if (perm >= 3) {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM org_members WHERE org_id = ? AND permission >= 3",
      [orgId]
    ) as any[];
    if ((rows[0] as any).cnt <= 1) {
      res.status(400).json({ error: "org.leave.lastAdmin" });
      return;
    }
  }

  await pool.execute(
    "DELETE FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  );
  res.json({ ok: true });
});

// 조직 삭제는 Akademiya 운영자 전용(DELETE /api/admin/orgs/:id)이다.
// 조직 관리자(permission 3)는 구성원 관리만 할 수 있고 조직 자체는 지울 수 없다.

// ── DELETE /api/orgs/:id/members/:targetId — 강퇴 (permission 3+) ─────────────
router.delete("/:id/members/:targetId", requireAuth, async (req, res) => {
  const orgId    = Number(req.params.id);
  const targetId = Number(req.params.targetId);
  const userId   = req.user!.id;
  const { reason } = req.body as { reason?: string };

  const perm = await getOrgPermission(userId, orgId);
  if (perm === null || perm < 3) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (targetId === userId) {
    res.status(400).json({ error: "cannotKickSelf" });
    return;
  }

  const [orgs] = await pool.execute(
    "SELECT id, name FROM organizations WHERE id = ? AND status = 'approved'",
    [orgId]
  ) as any[];
  if (!(orgs as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const org = (orgs as any[])[0];

  const [members] = await pool.execute(
    "SELECT id FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, targetId]
  ) as any[];
  if (!(members as any[]).length) {
    res.status(404).json({ error: "memberNotFound" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM org_members WHERE org_id = ? AND user_id = ?", [orgId, targetId]);
    const kickTitle = `조직 [${org.name}]에서 강퇴되었습니다.`;
    const kickBody  = reason?.trim() || "관리자에 의해 강퇴되었습니다.";
    await conn.execute(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, 'org_kicked', ?, ?)`,
      [targetId, kickTitle, kickBody]
    );
    await conn.commit();
    // 푸시 알림 (fire & forget)
    sendPushToUser(targetId, { title: kickTitle, body: kickBody }).catch(() => { /* ignore */ });
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

export default router;
