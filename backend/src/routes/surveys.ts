import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

async function canAccessSurvey(
  userId: number,
  survey: any
): Promise<boolean> {
  if (survey.scope_type === "public") return true;
  if (survey.scope_type === "class") {
    const [rows] = await pool.execute(
      "SELECT id FROM class_members WHERE class_id = ? AND user_id = ?",
      [survey.scope_id, userId]
    ) as any[];
    return (rows as any[]).length > 0;
  }
  if (survey.scope_type === "org") {
    const [rows] = await pool.execute(
      "SELECT id FROM org_members WHERE org_id = ? AND user_id = ?",
      [survey.scope_id, userId]
    ) as any[];
    return (rows as any[]).length > 0;
  }
  return false;
}

async function canEditSurvey(userId: number, survey: any): Promise<boolean> {
  return survey.creator_id === userId;
}

async function canViewStats(userId: number, surveyId: number, creatorId: number): Promise<boolean> {
  if (userId === creatorId) return true;
  const [rows] = await pool.execute(
    "SELECT 1 FROM survey_stat_viewers WHERE survey_id = ? AND user_id = ?",
    [surveyId, userId]
  ) as any[];
  return (rows as any[]).length > 0;
}

// ── POST /api/surveys — 설문 생성 ─────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const {
    title, description, scope_type, scope_id,
    allow_anonymous, expires_at, questions,
  } = req.body as any;

  if (!title?.trim() || !scope_type || !questions?.length) {
    res.status(400).json({ error: "survey.missingFields" });
    return;
  }
  if (!["class", "org", "public"].includes(scope_type)) {
    res.status(400).json({ error: "survey.invalidScope" });
    return;
  }

  const sid = scope_id ? Number(scope_id) : null;

  // scope 권한 확인 (반: 반장, 조직: 관리자, public: 누구나)
  if (scope_type === "class" && sid) {
    const [rows] = await pool.execute(
      "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
      [sid, userId]
    ) as any[];
    if (!(rows as any[]).length || (rows as any[])[0].permission < 1) {
      res.status(403).json({ error: "survey.forbidden" });
      return;
    }
  } else if (scope_type === "org" && sid) {
    const [rows] = await pool.execute(
      "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
      [sid, userId]
    ) as any[];
    if (!(rows as any[]).length || (rows as any[])[0].permission < 3) {
      res.status(403).json({ error: "survey.forbidden" });
      return;
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ins] = await conn.execute(
      `INSERT INTO surveys (creator_id, title, description, scope_type, scope_id, allow_anonymous, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        title.trim(),
        description?.trim() || null,
        scope_type,
        sid,
        allow_anonymous ? 1 : 0,
        expires_at || null,
      ]
    ) as any[];
    const surveyId = (ins as any).insertId;

    // 문항 삽입
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const [qIns] = await conn.execute(
        `INSERT INTO survey_questions (survey_id, order_num, type, title, required)
         VALUES (?, ?, ?, ?, ?)`,
        [surveyId, i, q.type, q.title?.trim(), q.required ? 1 : 0]
      ) as any[];
      const qId = (qIns as any).insertId;

      // 선택지 (single/multiple)
      if (["single", "multiple"].includes(q.type) && q.options?.length) {
        for (let j = 0; j < q.options.length; j++) {
          await conn.execute(
            "INSERT INTO survey_options (question_id, order_num, label) VALUES (?, ?, ?)",
            [qId, j, q.options[j]]
          );
        }
      }
    }

    // 새 설문 알림 (class/org scope만)
    if (scope_type === "class" && sid) {
      const [members] = await conn.execute(
        "SELECT user_id FROM class_members WHERE class_id = ?",
        [sid]
      ) as any[];
      if ((members as any[]).length > 0) {
        const notifParams: (string | number)[] = [];
        const ph = (members as any[]).map(() => "(?, 'new_survey', ?, ?)").join(", ");
        for (const m of members as any[]) {
          notifParams.push(m.user_id, title.trim(), `/surveys/${surveyId}`);
        }
        await conn.execute(
          `INSERT INTO notifications (user_id, type, title, link) VALUES ${ph}`,
          notifParams
        );
      }
    } else if (scope_type === "org" && sid) {
      const [members] = await conn.execute(
        "SELECT user_id FROM org_members WHERE org_id = ?",
        [sid]
      ) as any[];
      if ((members as any[]).length > 0) {
        const notifParams: (string | number)[] = [];
        const ph = (members as any[]).map(() => "(?, 'new_survey', ?, ?)").join(", ");
        for (const m of members as any[]) {
          notifParams.push(m.user_id, title.trim(), `/surveys/${surveyId}`);
        }
        await conn.execute(
          `INSERT INTO notifications (user_id, type, title, link) VALUES ${ph}`,
          notifParams
        );
      }
    }

    await conn.commit();
    res.status(201).json({ surveyId });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── GET /api/surveys/my — 내가 만든 설문 ──────────────────────────────────────
router.get("/my", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const [rows] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active, s.expires_at, s.created_at,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
     FROM surveys s
     WHERE s.creator_id = ?
     ORDER BY s.created_at DESC`,
    [userId]
  ) as any[];
  res.json({ surveys: rows });
});

// ── GET /api/surveys/feed — 내가 속한 반/조직의 진행중 설문 ───────────────────
router.get("/feed", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  // 반 설문
  const [classSurveys] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active, s.expires_at, s.created_at,
            c.name AS scope_name,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count,
            (SELECT COUNT(*) > 0 FROM survey_responses sr2 WHERE sr2.survey_id = s.id AND sr2.user_id = ?) AS already_responded
     FROM surveys s
     JOIN class_members cm ON cm.class_id = s.scope_id AND cm.user_id = ?
     JOIN classes c ON c.id = s.scope_id
     WHERE s.scope_type = 'class' AND s.is_active = 1
       AND (s.expires_at IS NULL OR s.expires_at > NOW())
     ORDER BY s.created_at DESC`,
    [userId, userId]
  ) as any[];

  // 조직 설문
  const [orgSurveys] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active, s.expires_at, s.created_at,
            o.name AS scope_name,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count,
            (SELECT COUNT(*) > 0 FROM survey_responses sr2 WHERE sr2.survey_id = s.id AND sr2.user_id = ?) AS already_responded
     FROM surveys s
     JOIN org_members om ON om.org_id = s.scope_id AND om.user_id = ?
     JOIN organizations o ON o.id = s.scope_id
     WHERE s.scope_type = 'org' AND s.is_active = 1
       AND (s.expires_at IS NULL OR s.expires_at > NOW())
     ORDER BY s.created_at DESC`,
    [userId, userId]
  ) as any[];

  res.json({ surveys: [...(classSurveys as any[]), ...(orgSurveys as any[])] });
});

// ── GET /api/surveys/class/:classId — 반의 설문 목록 ─────────────────────────
router.get("/class/:classId", requireAuth, async (req, res) => {
  const userId  = req.user!.id;
  const classId = Number(req.params.classId);

  const [pm] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(pm as any[]).length) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [rows] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active, s.expires_at, s.created_at,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count,
            (SELECT COUNT(*) > 0 FROM survey_responses sr2 WHERE sr2.survey_id = s.id AND sr2.user_id = ?) AS already_responded
     FROM surveys s
     WHERE s.scope_type = 'class' AND s.scope_id = ? AND s.is_active = 1
       AND (s.expires_at IS NULL OR s.expires_at > NOW())
     ORDER BY s.created_at DESC`,
    [userId, classId]
  ) as any[];
  res.json({ surveys: rows });
});

// ── GET /api/surveys/org/:orgId — 조직의 설문 목록 ───────────────────────────
router.get("/org/:orgId", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const orgId  = Number(req.params.orgId);

  const [pm] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  ) as any[];
  if (!(pm as any[]).length) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [rows] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active, s.expires_at, s.created_at,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count,
            (SELECT COUNT(*) > 0 FROM survey_responses sr2 WHERE sr2.survey_id = s.id AND sr2.user_id = ?) AS already_responded
     FROM surveys s
     WHERE s.scope_type = 'org' AND s.scope_id = ? AND s.is_active = 1
       AND (s.expires_at IS NULL OR s.expires_at > NOW())
     ORDER BY s.created_at DESC`,
    [userId, orgId]
  ) as any[];
  res.json({ surveys: rows });
});

// ── GET /api/surveys/public/:id — 공개 설문 (비로그인 가능) ──────────────────
// NOTE: 반드시 /:id 보다 먼저 등록해야 충돌 방지
router.get("/public/:id", async (req, res) => {
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute(
    `SELECT s.*, u.display_name AS creator_name
     FROM surveys s LEFT JOIN users u ON u.id = s.creator_id
     WHERE s.id = ? AND s.scope_type = 'public' AND s.is_active = 1`,
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }

  const [questions] = await pool.execute(
    `SELECT q.id, q.order_num, q.type, q.title, q.required
     FROM survey_questions q WHERE q.survey_id = ? ORDER BY q.order_num`,
    [surveyId]
  ) as any[];

  for (const q of questions as any[]) {
    if (["single", "multiple"].includes(q.type)) {
      const [opts] = await pool.execute(
        "SELECT id, order_num, label FROM survey_options WHERE question_id = ? ORDER BY order_num",
        [q.id]
      ) as any[];
      q.options = opts;
    }
  }

  res.json({ survey: (rows as any[])[0], questions });
});

// ── GET /api/surveys/:id — 설문 상세 (로그인 필요) ───────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute(
    `SELECT s.*, u.display_name AS creator_name
     FROM surveys s LEFT JOIN users u ON u.id = s.creator_id
     WHERE s.id = ?`,
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const survey = (rows as any[])[0];

  const hasAccess = await canAccessSurvey(userId, survey);
  if (!hasAccess) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  // 이미 응답했는지
  const [respRows] = await pool.execute(
    "SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?",
    [surveyId, userId]
  ) as any[];
  const alreadyResponded = (respRows as any[]).length > 0;

  // 문항 + 선택지
  const [questions] = await pool.execute(
    `SELECT q.id, q.order_num, q.type, q.title, q.required
     FROM survey_questions q WHERE q.survey_id = ? ORDER BY q.order_num`,
    [surveyId]
  ) as any[];

  for (const q of questions as any[]) {
    if (["single", "multiple"].includes(q.type)) {
      const [opts] = await pool.execute(
        "SELECT id, order_num, label FROM survey_options WHERE question_id = ? ORDER BY order_num",
        [q.id]
      ) as any[];
      q.options = opts;
    }
  }

  // 통계 조회 권한
  const canStats = await canViewStats(userId, surveyId, survey.creator_id);
  const isCreator = survey.creator_id === userId;

  res.json({ survey, questions, alreadyResponded, canViewStats: canStats, isCreator });
});

// ── POST /api/surveys/:id/respond — 응답 제출 ────────────────────────────────
router.post("/:id/respond", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const { answers } = req.body as { answers: Array<{ question_id: number; option_ids?: number[]; text_answer?: string }> };

  const [rows] = await pool.execute(
    "SELECT * FROM surveys WHERE id = ? AND is_active = 1",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const survey = (rows as any[])[0];

  if (survey.expires_at && new Date(survey.expires_at) < new Date()) {
    res.status(400).json({ error: "survey.expired" });
    return;
  }

  const hasAccess = await canAccessSurvey(userId, survey);
  if (!hasAccess) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  // 중복 응답 방지
  const [existing] = await pool.execute(
    "SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?",
    [surveyId, userId]
  ) as any[];
  if ((existing as any[]).length) {
    res.status(409).json({ error: "survey.alreadyResponded" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const storeUserId = survey.allow_anonymous ? null : userId;
    const [respIns] = await conn.execute(
      "INSERT INTO survey_responses (survey_id, user_id) VALUES (?, ?)",
      [surveyId, storeUserId]
    ) as any[];
    const responseId = (respIns as any).insertId;

    for (const ans of answers ?? []) {
      if (ans.option_ids?.length) {
        for (const optId of ans.option_ids) {
          await conn.execute(
            "INSERT INTO survey_response_items (response_id, question_id, option_id) VALUES (?, ?, ?)",
            [responseId, ans.question_id, optId]
          );
        }
      } else {
        await conn.execute(
          "INSERT INTO survey_response_items (response_id, question_id, text_answer) VALUES (?, ?, ?)",
          [responseId, ans.question_id, ans.text_answer ?? null]
        );
      }
    }

    await conn.commit();
    res.status(201).json({ message: "responded" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── GET /api/surveys/:id/stats — 통계 조회 ───────────────────────────────────
router.get("/:id/stats", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute(
    "SELECT * FROM surveys WHERE id = ?",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  const survey = (rows as any[])[0];

  if (!(await canViewStats(userId, surveyId, survey.creator_id))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [questions] = await pool.execute(
    "SELECT * FROM survey_questions WHERE survey_id = ? ORDER BY order_num",
    [surveyId]
  ) as any[];

  const totalResponses = (await pool.execute(
    "SELECT COUNT(*) AS cnt FROM survey_responses WHERE survey_id = ?",
    [surveyId]
  ) as any[])[0] as any[];
  const total = (totalResponses as any[])[0].cnt;

  for (const q of questions as any[]) {
    if (["single", "multiple"].includes(q.type)) {
      const [opts] = await pool.execute(
        "SELECT so.id, so.label, COUNT(sri.id) AS count FROM survey_options so LEFT JOIN survey_response_items sri ON sri.option_id = so.id WHERE so.question_id = ? GROUP BY so.id ORDER BY so.order_num",
        [q.id]
      ) as any[];
      q.options = opts;
    } else if (q.type === "text") {
      const [texts] = await pool.execute(
        "SELECT sri.text_answer FROM survey_response_items sri WHERE sri.question_id = ? AND sri.text_answer IS NOT NULL",
        [q.id]
      ) as any[];
      q.text_answers = (texts as any[]).map((r: any) => r.text_answer);
    } else if (q.type === "rating") {
      const [ratings] = await pool.execute(
        "SELECT AVG(CAST(sri.text_answer AS DECIMAL(5,2))) AS avg_rating, COUNT(*) AS count FROM survey_response_items sri WHERE sri.question_id = ?",
        [q.id]
      ) as any[];
      q.rating_stats = (ratings as any[])[0];
    }
  }

  // 통계 조회 권한 부여된 사용자 목록 (creator만 볼 수 있음)
  let statViewers: any[] = [];
  if (survey.creator_id === userId) {
    const [sv] = await pool.execute(
      `SELECT u.id, u.display_name, u.email FROM survey_stat_viewers ssv
       JOIN users u ON u.id = ssv.user_id WHERE ssv.survey_id = ?`,
      [surveyId]
    ) as any[];
    statViewers = sv as any[];
  }

  res.json({ survey, questions, totalResponses: total, statViewers });
});

// ── POST /api/surveys/:id/viewers — 통계 조회 권한 추가 (creator) ─────────────
router.post("/:id/viewers", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const { email } = req.body as { email: string };

  const [surveyRows] = await pool.execute(
    "SELECT creator_id FROM surveys WHERE id = ?",
    [surveyId]
  ) as any[];
  if (!(surveyRows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  if ((surveyRows as any[])[0].creator_id !== userId) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [userRows] = await pool.execute(
    "SELECT id FROM users WHERE email = ?",
    [email?.trim()]
  ) as any[];
  if (!(userRows as any[]).length) {
    res.status(404).json({ error: "survey.userNotFound" });
    return;
  }
  const targetId = (userRows as any[])[0].id;

  await pool.execute(
    "INSERT IGNORE INTO survey_stat_viewers (survey_id, user_id) VALUES (?, ?)",
    [surveyId, targetId]
  );
  res.json({ message: "added" });
});

// ── DELETE /api/surveys/:id/viewers/:userId — 통계 조회 권한 제거 ─────────────
router.delete("/:id/viewers/:uid", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const targetId = Number(req.params.uid);

  const [surveyRows] = await pool.execute(
    "SELECT creator_id FROM surveys WHERE id = ?",
    [surveyId]
  ) as any[];
  if (!(surveyRows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  if ((surveyRows as any[])[0].creator_id !== userId) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  await pool.execute(
    "DELETE FROM survey_stat_viewers WHERE survey_id = ? AND user_id = ?",
    [surveyId, targetId]
  );
  res.json({ message: "removed" });
});

// ── PATCH /api/surveys/:id — 설문 수정 (creator, 응답 없을 때) ────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const { title, description, is_active, expires_at } = req.body as any;

  const [rows] = await pool.execute(
    "SELECT creator_id FROM surveys WHERE id = ?",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  if ((rows as any[])[0].creator_id !== userId) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];
  if (title?.trim())          { updates.push("title = ?");       params.push(title.trim()); }
  if (description !== undefined) { updates.push("description = ?"); params.push(description?.trim() || null); }
  if (is_active !== undefined)   { updates.push("is_active = ?");   params.push(is_active ? 1 : 0); }
  if (expires_at !== undefined)  { updates.push("expires_at = ?");  params.push(expires_at || null); }
  if (updates.length === 0) { res.json({ message: "nothing" }); return; }
  params.push(surveyId);

  await pool.execute(`UPDATE surveys SET ${updates.join(", ")} WHERE id = ?`, params);
  res.json({ message: "updated" });
});

// ── DELETE /api/surveys/:id — 설문 삭제 (creator) ────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute(
    "SELECT creator_id FROM surveys WHERE id = ?",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) {
    res.status(404).json({ error: "notFound" });
    return;
  }
  if ((rows as any[])[0].creator_id !== userId) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  await pool.execute("DELETE FROM surveys WHERE id = ?", [surveyId]);
  res.json({ message: "deleted" });
});

export default router;
