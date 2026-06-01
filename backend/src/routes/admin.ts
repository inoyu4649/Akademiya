import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

// GET /api/admin/orgs — 대기 중인 조직 신청 목록
router.get("/orgs", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT o.id, o.name, o.code, o.status, o.timezone, o.google_domain, o.created_at,
            u.id as owner_id, u.display_name as owner_name, u.email as owner_email
     FROM organizations o
     INNER JOIN users u ON u.id = o.owner_id
     WHERE o.status = 'pending'
     ORDER BY o.created_at`
  ) as any[];
  res.json({ orgs: rows });
});

// POST /api/admin/orgs/:id/approve — 조직 승인
router.post("/orgs/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const orgId = Number(req.params.id);

  const [orgs] = await pool.execute(
    "SELECT id, owner_id FROM organizations WHERE id = ? AND status = 'pending'",
    [orgId]
  ) as any[];
  if (!(orgs as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const org = (orgs as any[])[0];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("UPDATE organizations SET status = 'approved' WHERE id = ?", [orgId]);
    // 오너를 관리자(permission=3)로 org_members에 추가
    await conn.execute(
      "INSERT IGNORE INTO org_members (org_id, user_id, permission) VALUES (?, ?, 3)",
      [orgId, org.owner_id]
    );
    await conn.commit();
    res.json({ message: "approved" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* 연결 끊김 시 rollback 실패 무시 */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// POST /api/admin/orgs/:id/reject — 조직 거절 (행 삭제 + 신청자 알림)
router.post("/orgs/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const orgId = Number(req.params.id);

  // 삭제 전 신청자 정보 조회
  const [orgs] = await pool.execute(
    "SELECT id, name, owner_id FROM organizations WHERE id = ? AND status = 'pending'",
    [orgId]
  ) as any[];
  if (!(orgs as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const org = (orgs as any[])[0];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 행 삭제 (rejected 상태로 남기지 않음)
    await conn.execute("DELETE FROM organizations WHERE id = ?", [orgId]);
    // 신청자에게 알림
    await conn.execute(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, 'org_rejected', ?, ?)`,
      [
        org.owner_id,
        `조직 개설 신청이 거절되었습니다: ${org.name}`,
        "Akademiya 관리자가 조직 개설 신청을 거절했습니다. 내용을 수정하여 다시 신청할 수 있습니다.",
      ]
    );
    await conn.commit();
    res.json({ message: "rejected" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── GET /api/admin/reports ────────────────────────────────────────────────────
// Akademiya 운영자: akademiya 단계 신고 목록 (resolve/ban)
router.get("/reports", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT ur.id, ur.reason, ur.stage, ur.status, ur.created_at, ur.handler_note,
            reporter.display_name AS reporter_name, reporter.email AS reporter_email,
            reported.display_name AS reported_name, reported.email AS reported_email,
            reported.is_banned,
            c.name AS class_name, o.name AS org_name
     FROM user_reports ur
     INNER JOIN users reporter ON reporter.id = ur.reporter_id
     INNER JOIN users reported ON reported.id = ur.reported_id
     LEFT JOIN classes c ON c.id = ur.class_id
     LEFT JOIN organizations o ON o.id = ur.org_id
     WHERE ur.stage = 'akademiya' AND ur.status = 'pending'
     ORDER BY ur.created_at`
  ) as any[];
  res.json({ reports: rows });
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// 밴된 사용자 목록
router.get("/users/banned", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, email, display_name, banned_at, banned_reason
     FROM users
     WHERE is_banned = 1
     ORDER BY banned_at DESC`
  ) as any[];
  res.json({ users: rows });
});

// ── POST /api/admin/users/:id/unban ──────────────────────────────────────────
router.post("/users/:id/unban", requireAuth, requireAdmin, async (req, res) => {
  const targetId = Number(req.params.id);
  await pool.execute(
    "UPDATE users SET is_banned = 0, banned_at = NULL, banned_reason = NULL WHERE id = ?",
    [targetId]
  );
  res.json({ message: "unbanned" });
});

// ── GET /api/admin/bug-reports ────────────────────────────────────────────────
router.get("/bug-reports", requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status as string | undefined;
  const where  = status ? "WHERE br.status = ?" : "";
  const params = status ? [status] : [];

  const [rows] = await pool.execute(
    `SELECT br.id, br.title, br.body, br.browser, br.os, br.status, br.admin_note,
            br.created_at, br.updated_at,
            u.display_name AS user_name, u.email AS user_email
     FROM bug_reports br
     INNER JOIN users u ON u.id = br.user_id
     ${where}
     ORDER BY br.created_at DESC
     LIMIT 100`,
    params
  ) as any[];
  res.json({ reports: rows });
});

// ── PATCH /api/admin/bug-reports/:id ──────────────────────────────────────────
router.patch("/bug-reports/:id", requireAuth, requireAdmin, async (req, res) => {
  const reportId = Number(req.params.id);
  const { status, admin_note } = req.body as { status?: string; admin_note?: string };

  const allowed = ["open", "in_progress", "closed"];
  if (status && !allowed.includes(status)) {
    res.status(400).json({ error: "invalidStatus" });
    return;
  }

  const [result] = await pool.execute(
    `UPDATE bug_reports
     SET status = COALESCE(?, status), admin_note = COALESCE(?, admin_note)
     WHERE id = ?`,
    [status ?? null, admin_note !== undefined ? admin_note : null, reportId]
  ) as any[];

  if ((result as any).affectedRows === 0) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  res.json({ message: "updated" });
});

export default router;
