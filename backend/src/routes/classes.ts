import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "../lib/push.js";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function getClassPermission(userId: number, classId: number): Promise<number | null> {
  const [rows] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
}

async function getOrgPermission(userId: number, orgId: number): Promise<number | null> {
  const [rows] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  ) as any[];
  if (!(rows as any[]).length) return null;
  return (rows as any[])[0].permission as number;
}

// ── POST /api/classes/apply ───────────────────────────────────────────────────
// 반 생성 신청 (조직 관리자 승인 필요)
router.post("/apply", requireAuth, async (req, res) => {
  const { org_id, name, code } = req.body as Record<string, string | number>;
  const userId = req.user!.id;

  if (!org_id || !name || !code) {
    res.status(400).json({ error: "class.apply.missingFields" });
    return;
  }

  const orgId = Number(org_id);
  const cleanCode = String(code).trim().toUpperCase();

  if (!/^[0-9]{4}$/.test(cleanCode)) {
    res.status(400).json({ error: "class.apply.codeInvalid" });
    return;
  }

  // org 멤버인지 확인
  const orgPerm = await getOrgPermission(userId, orgId);
  if (orgPerm === null) {
    res.status(403).json({ error: "class.apply.notOrgMember" });
    return;
  }

  // 동일 org_id + code 중복 확인
  const [conflict] = await pool.execute(
    "SELECT id FROM classes WHERE org_id = ? AND code = ? AND status != 'rejected'",
    [orgId, cleanCode]
  ) as any[];
  if ((conflict as any[]).length > 0) {
    res.status(409).json({ error: "class.apply.codeDuplicate" });
    return;
  }

  await pool.execute(
    "INSERT INTO classes (org_id, name, code, owner_id) VALUES (?, ?, ?, ?)",
    [orgId, String(name).trim(), cleanCode, userId]
  );

  res.status(201).json({ message: "class.apply.success" });
});

// ── GET /api/classes/my ───────────────────────────────────────────────────────
// 내가 속한 반 목록 + 내 신청 현황
router.get("/my", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const [classes] = await pool.execute(
    `SELECT c.id, c.name, c.code, c.org_id, c.status,
            o.name AS org_name, o.code AS org_code,
            cm.permission
     FROM classes c
     INNER JOIN class_members cm ON cm.class_id = c.id AND cm.user_id = ?
     INNER JOIN organizations o  ON o.id = c.org_id
     WHERE c.status = 'approved'
     ORDER BY o.name, c.name`,
    [userId]
  ) as any[];

  const [applications] = await pool.execute(
    `SELECT c.id, c.name, c.code, c.org_id, c.status,
            o.name AS org_name, o.code AS org_code
     FROM classes c
     INNER JOIN organizations o ON o.id = c.org_id
     WHERE c.owner_id = ? AND c.status IN ('pending','rejected')
     ORDER BY c.created_at DESC`,
    [userId]
  ) as any[];

  res.json({ classes, applications });
});

// ── POST /api/classes/join ────────────────────────────────────────────────────
// 복합 코드(ORGCODE4 + CLASSCODE4 = 8자리)로 가입 신청
router.post("/join", requireAuth, async (req, res) => {
  const { code } = req.body as { code: string };
  const userId = req.user!.id;

  const clean = code?.trim().toUpperCase();
  if (!clean || clean.length !== 8) {
    res.status(400).json({ error: "class.join.codeInvalid" });
    return;
  }

  const orgCode   = clean.slice(0, 4);
  const classCode = clean.slice(4, 8);

  // 조직 확인
  const [orgs] = await pool.execute(
    "SELECT id FROM organizations WHERE code = ? AND status = 'approved'",
    [orgCode]
  ) as any[];
  if (!(orgs as any[]).length) {
    res.status(404).json({ error: "class.join.orgNotFound" });
    return;
  }
  const orgId = (orgs as any[])[0].id as number;

  // org 멤버인지 확인
  const orgPerm = await getOrgPermission(userId, orgId);
  if (orgPerm === null) {
    res.status(403).json({ error: "class.join.notOrgMember" });
    return;
  }

  // 반 확인
  const [classes] = await pool.execute(
    "SELECT id, name FROM classes WHERE org_id = ? AND code = ? AND status = 'approved'",
    [orgId, classCode]
  ) as any[];
  if (!(classes as any[]).length) {
    res.status(404).json({ error: "class.join.notFound" });
    return;
  }
  const cls = (classes as any[])[0];

  // 이미 멤버인지
  const [member] = await pool.execute(
    "SELECT id FROM class_members WHERE class_id = ? AND user_id = ?",
    [cls.id, userId]
  ) as any[];
  if ((member as any[]).length > 0) {
    res.status(409).json({ error: "class.join.alreadyMember" });
    return;
  }

  // 기존 신청 확인
  const [existing] = await pool.execute(
    "SELECT id, status FROM class_join_requests WHERE class_id = ? AND user_id = ?",
    [cls.id, userId]
  ) as any[];
  const req0 = (existing as any[])[0];

  if (req0) {
    if (req0.status === "pending") {
      res.status(409).json({ error: "class.join.alreadyPending" });
      return;
    }
    await pool.execute(
      "UPDATE class_join_requests SET status = 'pending', created_at = NOW() WHERE id = ?",
      [req0.id]
    );
  } else {
    await pool.execute(
      "INSERT INTO class_join_requests (class_id, user_id) VALUES (?, ?)",
      [cls.id, userId]
    );
  }

  res.status(201).json({ message: "class.join.success", className: cls.name });
});

// ── GET /api/classes/:id ──────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const classId = Number(req.params.id);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [classes] = await pool.execute(
    `SELECT c.id, c.name, c.code, c.org_id, c.status,
            o.name AS org_name, o.code AS org_code
     FROM classes c
     INNER JOIN organizations o ON o.id = c.org_id
     WHERE c.id = ? AND c.status = 'approved'`,
    [classId]
  ) as any[];
  if (!(classes as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }

  const [members] = await pool.execute(
    `SELECT u.id, u.display_name, u.email, cm.permission, cm.joined_at
     FROM class_members cm
     INNER JOIN users u ON u.id = cm.user_id
     WHERE cm.class_id = ?
     ORDER BY cm.permission DESC, u.display_name`,
    [classId]
  ) as any[];

  res.json({ class: (classes as any[])[0], members, myPermission: perm });
});

// ── GET /api/classes/:id/join-requests ────────────────────────────────────────
// 반장(permission>=1)만 조회 가능
router.get("/:id/join-requests", requireAuth, async (req, res) => {
  const classId = Number(req.params.id);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null || perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [rows] = await pool.execute(
    `SELECT cjr.id, cjr.created_at, u.id AS user_id, u.display_name, u.email
     FROM class_join_requests cjr
     INNER JOIN users u ON u.id = cjr.user_id
     WHERE cjr.class_id = ? AND cjr.status = 'pending'
     ORDER BY cjr.created_at`,
    [classId]
  ) as any[];

  res.json({ requests: rows });
});

// ── POST /api/classes/:id/join-requests/:reqId/approve ────────────────────────
router.post("/:id/join-requests/:reqId/approve", requireAuth, async (req, res) => {
  const classId = Number(req.params.id);
  const reqId   = Number(req.params.reqId);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null || perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [reqs] = await pool.execute(
    "SELECT id, user_id FROM class_join_requests WHERE id = ? AND class_id = ? AND status = 'pending'",
    [reqId, classId]
  ) as any[];
  if (!(reqs as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const request = (reqs as any[])[0];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("UPDATE class_join_requests SET status = 'approved' WHERE id = ?", [reqId]);
    await conn.execute(
      "INSERT IGNORE INTO class_members (class_id, user_id, permission) VALUES (?, ?, 0)",
      [classId, request.user_id]
    );
    await conn.commit();
    res.json({ message: "approved" });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// ── POST /api/classes/:id/join-requests/:reqId/reject ─────────────────────────
router.post("/:id/join-requests/:reqId/reject", requireAuth, async (req, res) => {
  const classId = Number(req.params.id);
  const reqId   = Number(req.params.reqId);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null || perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  await pool.execute(
    "UPDATE class_join_requests SET status = 'rejected' WHERE id = ? AND class_id = ? AND status = 'pending'",
    [reqId, classId]
  );
  res.json({ message: "rejected" });
});

// ── DELETE /api/classes/:id/leave ─────────────────────────────────────────────
// 반 탈퇴 (마지막 반장은 탈퇴 불가)
router.delete("/:id/leave", requireAuth, async (req, res) => {
  const classId = Number(req.params.id);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null) {
    res.status(400).json({ error: "class.leave.notMember" });
    return;
  }

  // 유일한 반장(permission 1)인 경우 탈퇴 불가
  if (perm >= 1) {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM class_members WHERE class_id = ? AND permission >= 1",
      [classId]
    ) as any[];
    if ((rows[0] as any).cnt <= 1) {
      res.status(400).json({ error: "class.leave.lastLeader" });
      return;
    }
  }

  await pool.execute(
    "DELETE FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  );
  res.json({ ok: true });
});

// ── DELETE /api/classes/:id — 반 삭제 (permission 1+) ────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const classId = Number(req.params.id);
  const userId  = req.user!.id;

  const perm = await getClassPermission(userId, classId);
  if (perm === null || perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [classes] = await pool.execute(
    "SELECT id, name FROM classes WHERE id = ? AND status = 'approved'",
    [classId]
  ) as any[];
  if (!(classes as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }

  await pool.execute("DELETE FROM classes WHERE id = ?", [classId]);
  res.json({ ok: true });
});

// ── DELETE /api/classes/:id/members/:targetId — 강퇴 (permission 1+) ─────────
router.delete("/:id/members/:targetId", requireAuth, async (req, res) => {
  const classId  = Number(req.params.id);
  const targetId = Number(req.params.targetId);
  const userId   = req.user!.id;
  const { reason } = req.body as { reason?: string };

  const perm = await getClassPermission(userId, classId);
  if (perm === null || perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (targetId === userId) {
    res.status(400).json({ error: "cannotKickSelf" });
    return;
  }

  const [classes] = await pool.execute(
    "SELECT id, name FROM classes WHERE id = ? AND status = 'approved'",
    [classId]
  ) as any[];
  if (!(classes as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const cls = (classes as any[])[0];

  const [members] = await pool.execute(
    "SELECT id FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, targetId]
  ) as any[];
  if (!(members as any[]).length) {
    res.status(404).json({ error: "memberNotFound" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM class_members WHERE class_id = ? AND user_id = ?", [classId, targetId]);
    const kickTitle = `반 [${cls.name}]에서 강퇴되었습니다.`;
    const kickBody  = reason?.trim() || "반장에 의해 강퇴되었습니다.";
    await conn.execute(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, 'class_kicked', ?, ?)`,
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

// ── PATCH /api/classes/:id/members/:targetId/permission ───────────────────────
// 반장 지정(1) / 해제(0) — 반장만 가능
router.patch("/:id/members/:targetId/permission", requireAuth, async (req, res) => {
  const classId  = Number(req.params.id);
  const targetId = Number(req.params.targetId);
  const userId   = req.user!.id;
  const { permission } = req.body as { permission: number };

  if (![0, 1].includes(Number(permission))) {
    res.status(400).json({ error: "invalidPermission" });
    return;
  }

  const perm = await getClassPermission(userId, classId);
  if (perm === null || perm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (targetId === userId) {
    res.status(400).json({ error: "cannotChangeSelf" });
    return;
  }

  const [result] = await pool.execute(
    "UPDATE class_members SET permission = ? WHERE class_id = ? AND user_id = ?",
    [Number(permission), classId, targetId]
  ) as any[];
  if ((result as any).affectedRows === 0) {
    res.status(404).json({ error: "memberNotFound" });
    return;
  }
  res.json({ message: "updated" });
});

export default router;
