import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router: IRouter = Router();

// ── 조직(Organization) 운영 ──────────────────────────────────────────────────
// v2.0부터 조직은 사용자에게 노출되지 않는다. GMCAuto 3처럼 "특정 학교 재학생만
// 로그인 가능"한 OAuth 클라이언트를 위한 소속 판별 수단이므로, 생성·수정·삭제
// 권한 전체를 Akademiya 운영자에게만 둔다. 사용자는 계정 센터에서 코드로
// 가입 신청하거나 google_domain 자동인식으로 가입될 뿐이다.

// GET /api/admin/orgs — 전체 조직 목록 (구성원 수 + 대기 중 가입 신청 수 포함)
router.get("/orgs", requireAuth, requireAdmin, async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT o.id, o.name, o.code, o.status, o.timezone, o.google_domain, o.created_at,
            u.display_name AS owner_name, u.email AS owner_email,
            (SELECT COUNT(*) FROM org_members om WHERE om.org_id = o.id) AS member_count,
            (SELECT COUNT(*) FROM org_join_requests ojr
              WHERE ojr.org_id = o.id AND ojr.status = 'pending')        AS pending_count
     FROM organizations o
     LEFT JOIN users u ON u.id = o.owner_id
     ORDER BY o.status = 'pending' DESC, o.name`
  ) as any[];
  res.json({ orgs: rows });
});

// POST /api/admin/orgs — 조직 생성 (운영자 전용)
router.post("/orgs", requireAuth, requireAdmin, async (req, res) => {
  const { name, code, google_domain, timezone } = req.body as Record<string, string>;
  const adminId = req.user!.id;

  if (!name?.trim()) {
    res.status(400).json({ error: "org.apply.nameRequired" });
    return;
  }
  const cleanCode = code?.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(cleanCode ?? "")) {
    res.status(400).json({ error: "org.apply.codeInvalid" });
    return;
  }

  const [conflict] = await pool.execute(
    "SELECT id FROM organizations WHERE code = ?",
    [cleanCode]
  ) as any[];
  if ((conflict as any[]).length > 0) {
    res.status(409).json({ error: "org.apply.codeDuplicate" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO organizations (name, code, owner_id, google_domain, timezone, status)
       VALUES (?, ?, ?, ?, ?, 'approved')`,
      [name.trim(), cleanCode, adminId, google_domain?.trim().toLowerCase() || null, timezone?.trim() || "Asia/Seoul"]
    ) as any[];
    const orgId = (result as any).insertId as number;
    // 생성한 운영자를 조직 관리자(permission=3)로 등록
    await conn.execute(
      "INSERT IGNORE INTO org_members (org_id, user_id, permission) VALUES (?, ?, 3)",
      [orgId, adminId]
    );
    await conn.commit();
    res.status(201).json({ id: orgId });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// PATCH /api/admin/orgs/:id — 조직 수정 (이름/Google 워크스페이스 도메인/타임존)
router.patch("/orgs/:id", requireAuth, requireAdmin, async (req, res) => {
  const orgId = Number(req.params.id);
  const { name, google_domain, timezone } = req.body as Record<string, string | null>;

  const updates: string[] = [];
  const values: any[] = [];
  if (typeof name === "string" && name.trim()) {
    updates.push("name = ?");
    values.push(name.trim());
  }
  // google_domain은 null/빈 문자열로 해제할 수 있어야 하므로 undefined만 걸러낸다
  if (google_domain !== undefined) {
    updates.push("google_domain = ?");
    values.push(google_domain?.trim().toLowerCase() || null);
  }
  if (typeof timezone === "string" && timezone.trim()) {
    updates.push("timezone = ?");
    values.push(timezone.trim());
  }
  if (updates.length === 0) {
    res.status(400).json({ error: "noChanges" });
    return;
  }

  values.push(orgId);
  const [result] = await pool.execute(
    `UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`,
    values
  ) as any[];
  if ((result as any).affectedRows === 0) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  res.json({ message: "updated" });
});

// POST /api/admin/orgs/:id/approve — 조직 승인 (구버전에서 넘어온 pending 신청 처리용)
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

// DELETE /api/admin/orgs/:id — 조직 삭제 (구성원·가입신청은 FK CASCADE로 함께 삭제)
router.delete("/orgs/:id", requireAuth, requireAdmin, async (req, res) => {
  const orgId = Number(req.params.id);
  const [result] = await pool.execute("DELETE FROM organizations WHERE id = ?", [orgId]) as any[];
  if ((result as any).affectedRows === 0) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  res.json({ message: "deleted" });
});

// GET /api/admin/orgs/:id/members — 조직 구성원 + 대기 중 가입 신청
router.get("/orgs/:id/members", requireAuth, requireAdmin, async (req, res) => {
  const orgId = Number(req.params.id);

  const [members] = await pool.execute(
    `SELECT u.id, u.display_name, u.email, om.permission, om.joined_at
     FROM org_members om
     INNER JOIN users u ON u.id = om.user_id
     WHERE om.org_id = ?
     ORDER BY om.permission DESC, u.display_name`,
    [orgId]
  ) as any[];

  const [requests] = await pool.execute(
    `SELECT ojr.id, ojr.created_at, u.id AS user_id, u.display_name, u.email
     FROM org_join_requests ojr
     INNER JOIN users u ON u.id = ojr.user_id
     WHERE ojr.org_id = ? AND ojr.status = 'pending'
     ORDER BY ojr.created_at`,
    [orgId]
  ) as any[];

  res.json({ members, requests });
});

// ── GET /api/admin/users/banned — 밴된 사용자 목록 ───────────────────────────
router.get("/users/banned", requireAuth, requireAdmin, async (_req, res) => {
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

// ── GET /api/admin/oauth-quota-requests — OAuth 공개 앱 한도 확장 요청 목록 ──
router.get("/oauth-quota-requests", requireAuth, requireAdmin, async (req, res) => {
  const status = (req.query.status as string) || "pending";
  const [rows] = await pool.execute(
    `SELECT oqr.id, oqr.requested_max_apps, oqr.reason, oqr.status, oqr.admin_note, oqr.created_at,
            u.max_oauth_public_apps AS current_max_apps,
            u.display_name AS requester_name, u.email AS requester_email
     FROM oauth_app_quota_requests oqr
     LEFT JOIN users u ON u.id = oqr.requester_id
     WHERE oqr.status = ?
     ORDER BY oqr.created_at DESC`,
    [status]
  ) as any[];
  res.json({ requests: rows });
});

// ── POST /api/admin/oauth-quota-requests/:id/approve ─────────────────────────
router.post("/oauth-quota-requests/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const reqId   = Number(req.params.id);
  const adminId = req.user!.id;
  const { admin_note } = req.body as { admin_note?: string };

  const [rows] = await pool.execute(
    "SELECT * FROM oauth_app_quota_requests WHERE id = ? AND status = 'pending'",
    [reqId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const r = (rows as any[])[0];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      "UPDATE users SET max_oauth_public_apps = ? WHERE id = ?",
      [r.requested_max_apps, r.requester_id]
    );
    await conn.execute(
      `UPDATE oauth_app_quota_requests
       SET status = 'approved', admin_note = ?, reviewed_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [admin_note?.trim() || null, adminId, reqId]
    );
    if (r.requester_id) {
      await conn.execute(
        `INSERT INTO notifications (user_id, type, title, body, link)
         VALUES (?, 'broadcast', ?, ?, ?)`,
        [
          r.requester_id,
          "OAuth 공개 앱 한도 확장 요청이 승인되었습니다",
          `최대 ${r.requested_max_apps}개로 확장되었습니다.`,
          `/developer/oauth`,
        ]
      );
    }
    await conn.commit();
    res.json({ message: "approved" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── POST /api/admin/oauth-quota-requests/:id/reject ───────────────────────────
router.post("/oauth-quota-requests/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const reqId   = Number(req.params.id);
  const adminId = req.user!.id;
  const { admin_note } = req.body as { admin_note?: string };

  const [rows] = await pool.execute(
    "SELECT requester_id FROM oauth_app_quota_requests WHERE id = ? AND status = 'pending'",
    [reqId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const r = (rows as any[])[0];
  await pool.execute(
    `UPDATE oauth_app_quota_requests
     SET status = 'rejected', admin_note = ?, reviewed_by = ?, updated_at = NOW()
     WHERE id = ?`,
    [admin_note?.trim() || null, adminId, reqId]
  );
  if (r.requester_id) {
    await pool.execute(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES (?, 'broadcast', ?, ?, ?)`,
      [
        r.requester_id,
        "OAuth 공개 앱 한도 확장 요청이 거절되었습니다",
        admin_note?.trim() || "Akademiya 관리자가 OAuth 공개 앱 한도 확장 요청을 거절했습니다.",
        `/developer/oauth`,
      ]
    );
  }
  res.json({ message: "rejected" });
});

export default router;
