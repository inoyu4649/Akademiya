import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

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

// 현재 사용자가 해당 report의 현재 stage를 처리할 권한이 있는지 확인
async function canHandleReport(
  userId: number,
  report: any,
  userRole: string
): Promise<boolean> {
  if (report.status !== "pending") return false;

  if (report.stage === "class_leader") {
    if (!report.class_id) return false;
    const perm = await getClassPermission(userId, report.class_id);
    return perm !== null && perm >= 1;
  }

  if (report.stage === "org_admin") {
    if (!report.org_id) return false;
    const perm = await getOrgPermission(userId, report.org_id);
    return perm !== null && perm >= 3;
  }

  if (report.stage === "akademiya") {
    return userRole === "admin";
  }

  return false;
}

// ── POST /api/reports ─────────────────────────────────────────────────────────
// 신고 접수
router.post("/", requireAuth, async (req, res) => {
  const { reported_id, class_id, org_id, reason } = req.body as Record<string, string | number>;
  const reporterId = req.user!.id;

  if (!reported_id || !org_id || !reason) {
    res.status(400).json({ error: "report.missingFields" });
    return;
  }

  const reportedId = Number(reported_id);
  const orgId = Number(org_id);
  const classId = class_id ? Number(class_id) : null;

  if (reporterId === reportedId) {
    res.status(400).json({ error: "report.cannotReportSelf" });
    return;
  }

  // 신고자가 해당 org 멤버인지 확인
  const orgPerm = await getOrgPermission(reporterId, orgId);
  if (orgPerm === null) {
    res.status(403).json({ error: "report.notOrgMember" });
    return;
  }

  // 피신고자도 해당 org 멤버인지 확인 (L-4: 임의 reported_id 지정 차단 — 데이터 무결성)
  const reportedOrgPerm = await getOrgPermission(reportedId, orgId);
  if (reportedOrgPerm === null) {
    res.status(400).json({ error: "report.reportedNotOrgMember" });
    return;
  }

  // 초기 stage 결정
  let stage: "class_leader" | "org_admin" = "class_leader";

  if (classId) {
    // 피신고자가 반장이면 자동으로 org_admin 단계
    const reportedClassPerm = await getClassPermission(reportedId, classId);
    if (reportedClassPerm !== null && reportedClassPerm >= 1) {
      stage = "org_admin";
    }
  } else {
    // class_id 없이 조직 레벨 신고 → org_admin으로 직행
    stage = "org_admin";
  }

  await pool.execute(
    `INSERT INTO user_reports (reporter_id, reported_id, class_id, org_id, reason, stage)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reporterId, reportedId, classId, orgId, String(reason).trim(), stage]
  );

  res.status(201).json({ message: "report.success" });
});

// ── GET /api/reports/mine ─────────────────────────────────────────────────────
// 내가 접수한 신고 목록
router.get("/mine", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const [rows] = await pool.execute(
    `SELECT ur.id, ur.reason, ur.stage, ur.status, ur.created_at, ur.updated_at,
            u.display_name AS reported_name, u.email AS reported_email,
            c.name AS class_name, o.name AS org_name
     FROM user_reports ur
     INNER JOIN users u ON u.id = ur.reported_id
     LEFT JOIN classes c ON c.id = ur.class_id
     LEFT JOIN organizations o ON o.id = ur.org_id
     WHERE ur.reporter_id = ?
     ORDER BY ur.created_at DESC`,
    [userId]
  ) as any[];

  res.json({ reports: rows });
});

// ── GET /api/reports/handle ───────────────────────────────────────────────────
// 내가 처리해야 할 신고 목록
router.get("/handle", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const userRole = req.user!.role;

  let rows: any[] = [];

  if (userRole === "admin") {
    // Akademiya 운영자: akademiya 단계 전체
    const [r] = await pool.execute(
      `SELECT ur.id, ur.reason, ur.stage, ur.status, ur.created_at,
              reporter.display_name AS reporter_name, reporter.email AS reporter_email,
              reported.display_name AS reported_name, reported.email AS reported_email,
              c.name AS class_name, o.name AS org_name
       FROM user_reports ur
       INNER JOIN users reporter ON reporter.id = ur.reporter_id
       INNER JOIN users reported ON reported.id = ur.reported_id
       LEFT JOIN classes c ON c.id = ur.class_id
       LEFT JOIN organizations o ON o.id = ur.org_id
       WHERE ur.stage = 'akademiya' AND ur.status = 'pending'
       ORDER BY ur.created_at`,
    ) as any[];
    rows = r as any[];
  } else {
    // 반장인 반들 → class_leader 단계
    const [leaderClasses] = await pool.execute(
      "SELECT class_id FROM class_members WHERE user_id = ? AND permission >= 1",
      [userId]
    ) as any[];
    const classIds = (leaderClasses as any[]).map((r: any) => r.class_id as number);

    // 조직 관리자인 조직들 → org_admin 단계
    const [adminOrgs] = await pool.execute(
      "SELECT org_id FROM org_members WHERE user_id = ? AND permission >= 3",
      [userId]
    ) as any[];
    const orgIds = (adminOrgs as any[]).map((r: any) => r.org_id as number);

    const conditions: string[] = [];
    const params: any[] = [];

    if (classIds.length > 0) {
      conditions.push(`(ur.stage = 'class_leader' AND ur.class_id IN (${classIds.map(() => "?").join(",")}))`);
      params.push(...classIds);
    }
    if (orgIds.length > 0) {
      conditions.push(`(ur.stage = 'org_admin' AND ur.org_id IN (${orgIds.map(() => "?").join(",")}))`);
      params.push(...orgIds);
    }

    if (conditions.length > 0) {
      const [r] = await pool.execute(
        `SELECT ur.id, ur.reason, ur.stage, ur.status, ur.created_at,
                reporter.display_name AS reporter_name, reporter.email AS reporter_email,
                reported.display_name AS reported_name, reported.email AS reported_email,
                c.name AS class_name, o.name AS org_name
         FROM user_reports ur
         INNER JOIN users reporter ON reporter.id = ur.reporter_id
         INNER JOIN users reported ON reported.id = ur.reported_id
         LEFT JOIN classes c ON c.id = ur.class_id
         LEFT JOIN organizations o ON o.id = ur.org_id
         WHERE ur.status = 'pending' AND (${conditions.join(" OR ")})
         ORDER BY ur.created_at`,
        params
      ) as any[];
      rows = r as any[];
    }
  }

  res.json({ reports: rows });
});

// ── GET /api/reports/:id ──────────────────────────────────────────────────────
// 신고 상세
router.get("/:id", requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  const userId   = req.user!.id;
  const userRole = req.user!.role;

  const [rows] = await pool.execute(
    `SELECT ur.*,
            reporter.display_name AS reporter_name, reporter.email AS reporter_email,
            reported.display_name AS reported_name, reported.email AS reported_email,
            c.name AS class_name, o.name AS org_name
     FROM user_reports ur
     INNER JOIN users reporter ON reporter.id = ur.reporter_id
     INNER JOIN users reported ON reported.id = ur.reported_id
     LEFT JOIN classes c ON c.id = ur.class_id
     LEFT JOIN organizations o ON o.id = ur.org_id
     WHERE ur.id = ?`,
    [reportId]
  ) as any[];

  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const report = (rows as any[])[0];

  // 접근 권한: 신고자 본인, 혹은 처리 권한자
  const isReporter = report.reporter_id === userId;
  const canHandle  = await canHandleReport(userId, report, userRole);
  if (!isReporter && !canHandle) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  // 에스컬레이션 이력
  const [escalations] = await pool.execute(
    `SELECT re.*, u.display_name AS escalated_by_name
     FROM report_escalations re
     INNER JOIN users u ON u.id = re.escalated_by
     WHERE re.report_id = ?
     ORDER BY re.created_at`,
    [reportId]
  ) as any[];

  res.json({ report, escalations });
});

// ── POST /api/reports/:id/resolve ─────────────────────────────────────────────
router.post("/:id/resolve", requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  const userId   = req.user!.id;
  const userRole = req.user!.role;
  const { note } = req.body as { note?: string };

  const [rows] = await pool.execute(
    "SELECT * FROM user_reports WHERE id = ?",
    [reportId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const report = (rows as any[])[0];

  const canHandle = await canHandleReport(userId, report, userRole);
  if (!canHandle) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  await pool.execute(
    "UPDATE user_reports SET status = 'resolved', handler_id = ?, handler_note = ?, updated_at = NOW() WHERE id = ?",
    [userId, note?.trim() || null, reportId]
  );

  res.json({ message: "resolved" });
});

// ── POST /api/reports/:id/escalate ────────────────────────────────────────────
router.post("/:id/escalate", requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  const userId   = req.user!.id;
  const userRole = req.user!.role;
  const { note } = req.body as { note?: string };

  const [rows] = await pool.execute(
    "SELECT * FROM user_reports WHERE id = ?",
    [reportId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const report = (rows as any[])[0];

  if (report.stage === "akademiya") {
    res.status(400).json({ error: "report.alreadyTopStage" });
    return;
  }

  const canHandle = await canHandleReport(userId, report, userRole);
  if (!canHandle) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const nextStage = report.stage === "class_leader" ? "org_admin" : "akademiya";

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE user_reports
         SET stage = ?, status = 'escalated', handler_id = ?, handler_note = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextStage, userId, note?.trim() || null, reportId]
    );
    // 에스컬레이션 후 다시 pending 상태로 재활성화
    await conn.execute(
      "UPDATE user_reports SET status = 'pending' WHERE id = ?",
      [reportId]
    );
    await conn.execute(
      `INSERT INTO report_escalations (report_id, from_stage, to_stage, escalated_by, note)
       VALUES (?, ?, ?, ?, ?)`,
      [reportId, report.stage, nextStage, userId, note?.trim() || null]
    );
    await conn.commit();
    res.json({ message: "escalated", nextStage });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

// ── POST /api/reports/:id/ban ─────────────────────────────────────────────────
// Akademiya 운영자만 — 영구 밴
router.post("/:id/ban", requireAuth, async (req, res) => {
  const reportId = Number(req.params.id);
  const userId   = req.user!.id;
  const userRole = req.user!.role;
  const { note } = req.body as { note?: string };

  if (userRole !== "admin") {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [rows] = await pool.execute(
    "SELECT * FROM user_reports WHERE id = ?",
    [reportId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const report = (rows as any[])[0];

  if (report.status !== "pending" || report.stage !== "akademiya") {
    res.status(400).json({ error: "report.notAtAkademiyaStage" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 피신고자 영구 밴
    await conn.execute(
      "UPDATE users SET is_banned = 1, banned_at = NOW(), banned_reason = ? WHERE id = ?",
      [note?.trim() || "Banned by Akademiya admin", report.reported_id]
    );
    // 기존 세션 즉시 무효화 — 리프레시 토큰 전량 폐기
    await conn.execute(
      "DELETE FROM refresh_tokens WHERE user_id = ?",
      [report.reported_id]
    );
    // 신고 처리
    await conn.execute(
      "UPDATE user_reports SET status = 'resolved', handler_id = ?, handler_note = ?, updated_at = NOW() WHERE id = ?",
      [userId, note?.trim() || null, reportId]
    );
    await conn.commit();
    res.json({ message: "banned" });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});

export default router;
