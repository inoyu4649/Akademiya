import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// CSV 수식 인젝션 방지(M-6): 셀 선두가 = + - @ (또는 탭/CR)이면 ' 접두 후 큰따옴표 이스케이프.
// Excel/스프레드시트가 사용자 입력(제목·반이름)을 수식으로 해석·실행하는 것을 차단.
function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

// ── GET /api/stats/class/:classId ─────────────────────────────────────────────
// 반 통계: 반장(permission>=1) 또는 조직 permission>=1
router.get("/class/:classId", requireAuth, async (req, res) => {
  const userId  = (req as any).user.id;
  const classId = Number(req.params.classId);

  // 반 멤버 권한 확인
  const [memberRows] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(memberRows as any[]).length) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const myClassPerm = (memberRows as any[])[0].permission as number;

  // 반 정보 + 조직 권한 확인
  const [classRows] = await pool.execute(
    "SELECT c.id, c.name, c.org_id FROM classes c WHERE c.id = ?",
    [classId]
  ) as any[];
  if (!(classRows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const cls = (classRows as any[])[0];

  const [orgPermRows] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [cls.org_id, userId]
  ) as any[];
  const myOrgPerm = (orgPermRows as any[]).length
    ? ((orgPermRows as any[])[0].permission as number)
    : 0;

  // 반장 또는 조직 perm >= 1 만 열람 가능
  if (myClassPerm < 1 && myOrgPerm < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const canDownload = myOrgPerm >= 2 || myClassPerm >= 1;

  // 반 멤버 수
  const [cntRows] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM class_members WHERE class_id = ?",
    [classId]
  ) as any[];
  const totalMembers = Number((cntRows as any[])[0].cnt);

  // 과제별 제출 현황
  const [assignRows] = await pool.execute(
    `SELECT
       a.id, a.title, a.due_at,
       COUNT(DISTINCT s.user_id)                                              AS total_submitted,
       SUM(CASE WHEN s.status = 'submitted' THEN 1 ELSE 0 END)               AS submitted,
       SUM(CASE WHEN s.status = 'approved'  THEN 1 ELSE 0 END)               AS approved,
       SUM(CASE WHEN s.status = 'returned'  THEN 1 ELSE 0 END)               AS returned
     FROM assignments a
     LEFT JOIN submissions s ON s.assignment_id = a.id
     WHERE a.class_id = ?
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [classId]
  ) as any[];

  const assignments = (assignRows as any[]).map((a) => ({
    id:              a.id,
    title:           a.title,
    due_at:          a.due_at,
    total_members:   totalMembers,
    submitted:       Number(a.submitted),
    approved:        Number(a.approved),
    returned:        Number(a.returned),
    not_submitted:   totalMembers - Number(a.total_submitted),
    submission_rate: totalMembers > 0
      ? Math.round((Number(a.total_submitted) / totalMembers) * 100)
      : 0,
  }));

  res.json({
    class:        { id: cls.id, name: cls.name },
    totalMembers,
    canDownload,
    assignments,
  });
});

// ── GET /api/stats/class/:classId/csv ─────────────────────────────────────────
// CSV 다운로드 (조직 permission >= 2 또는 반장)
router.get("/class/:classId/csv", requireAuth, async (req, res) => {
  const userId  = (req as any).user.id;
  const classId = Number(req.params.classId);

  // 권한 확인
  const [memberRows] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(memberRows as any[]).length) { res.status(403).json({ error: "forbidden" }); return; }
  const myClassPerm = (memberRows as any[])[0].permission as number;

  const [classRows] = await pool.execute("SELECT org_id, name FROM classes WHERE id = ?", [classId]) as any[];
  if (!(classRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const cls = (classRows as any[])[0];

  const [orgPermRows] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [cls.org_id, userId]
  ) as any[];
  const myOrgPerm = (orgPermRows as any[]).length ? ((orgPermRows as any[])[0].permission as number) : 0;

  if (myClassPerm < 1 && myOrgPerm < 2) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [cntRows] = await pool.execute("SELECT COUNT(*) AS cnt FROM class_members WHERE class_id = ?", [classId]) as any[];
  const totalMembers = Number((cntRows as any[])[0].cnt);

  const [assignRows] = await pool.execute(
    `SELECT a.id, a.title, a.due_at,
       COUNT(DISTINCT s.user_id) AS total_submitted,
       SUM(CASE WHEN s.status='submitted' THEN 1 ELSE 0 END) AS submitted,
       SUM(CASE WHEN s.status='approved'  THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN s.status='returned'  THEN 1 ELSE 0 END) AS returned
     FROM assignments a LEFT JOIN submissions s ON s.assignment_id=a.id
     WHERE a.class_id=? GROUP BY a.id ORDER BY a.created_at DESC`,
    [classId]
  ) as any[];

  const header = "Assignment,Due Date,Total Members,Submitted,Approved,Returned,Not Submitted,Rate(%)";
  const lines  = (assignRows as any[]).map((a) => {
    const ts   = Number(a.total_submitted);
    const rate = totalMembers > 0 ? Math.round((ts / totalMembers) * 100) : 0;
    const due  = a.due_at ? new Date(a.due_at).toISOString().slice(0, 16).replace("T", " ") : "";
    return [
      csvCell(a.title),
      `"${due}"`,
      totalMembers,
      a.submitted,
      a.approved,
      a.returned,
      totalMembers - ts,
      rate,
    ].join(",");
  });

  const csv = [header, ...lines].join("\n");
  const filename = `stats_${cls.name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send("﻿" + csv); // BOM for Excel
});

// ── GET /api/stats/org/:orgId ─────────────────────────────────────────────────
// 조직 통계: 조직 permission >= 1
router.get("/org/:orgId", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const orgId  = Number(req.params.orgId);

  const [orgPermRows] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  ) as any[];
  if (!(orgPermRows as any[]).length || (orgPermRows as any[])[0].permission < 1) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const myOrgPerm = (orgPermRows as any[])[0].permission as number;

  const [orgRows] = await pool.execute("SELECT id, name FROM organizations WHERE id = ?", [orgId]) as any[];
  if (!(orgRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const org = (orgRows as any[])[0];

  const canDownload = myOrgPerm >= 2;

  const [classRows] = await pool.execute(
    `SELECT c.id, c.name,
       (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = c.id) AS member_count,
       (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id)     AS total_assignments,
       (SELECT COUNT(DISTINCT s.user_id)
          FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
         WHERE a.class_id = c.id)                                       AS total_submitters
     FROM classes c
     WHERE c.org_id = ? AND c.status = 'approved'
     ORDER BY c.name`,
    [orgId]
  ) as any[];

  const classes = (classRows as any[]).map((c) => {
    const possible = Number(c.member_count) * Number(c.total_assignments);
    return {
      id:               c.id,
      name:             c.name,
      member_count:     Number(c.member_count),
      total_assignments:Number(c.total_assignments),
      total_submitters: Number(c.total_submitters),
      submission_rate:  possible > 0
        ? Math.round((Number(c.total_submitters) / possible) * 100)
        : 0,
    };
  });

  res.json({ org: { id: org.id, name: org.name }, canDownload, classes });
});

// ── GET /api/stats/org/:orgId/csv ─────────────────────────────────────────────
router.get("/org/:orgId/csv", requireAuth, async (req, res) => {
  const userId = (req as any).user.id;
  const orgId  = Number(req.params.orgId);

  const [orgPermRows] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  ) as any[];
  if (!(orgPermRows as any[]).length || (orgPermRows as any[])[0].permission < 2) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [orgRows] = await pool.execute("SELECT name FROM organizations WHERE id = ?", [orgId]) as any[];
  if (!(orgRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const orgName = (orgRows as any[])[0].name;

  const [classRows] = await pool.execute(
    `SELECT c.id, c.name,
       (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = c.id) AS member_count,
       (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id)     AS total_assignments,
       (SELECT COUNT(DISTINCT s.user_id)
          FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
         WHERE a.class_id = c.id)                                       AS total_submitters
     FROM classes c WHERE c.org_id = ? AND c.status = 'approved' ORDER BY c.name`,
    [orgId]
  ) as any[];

  const header = "Class,Members,Assignments,Submitters,Rate(%)";
  const lines  = (classRows as any[]).map((c) => {
    const possible = Number(c.member_count) * Number(c.total_assignments);
    const rate     = possible > 0 ? Math.round((Number(c.total_submitters) / possible) * 100) : 0;
    return [csvCell(c.name), c.member_count, c.total_assignments, c.total_submitters, rate].join(",");
  });

  const csv = [header, ...lines].join("\n");
  const filename = `org_stats_${String(orgName).replace(/[^a-zA-Z0-9가-힣]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send("﻿" + csv);
});

export default router;
