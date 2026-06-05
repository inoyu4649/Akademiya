import { Router, type IRouter } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

/** ISO 8601 → MySQL DATETIME 문자열 (YYYY-MM-DD HH:MM:SS, UTC) */
function toMysqlDatetime(v: string | null | undefined): string | null {
  if (!v) return null;
  return new Date(v).toISOString().slice(0, 19).replace("T", " ");
}

async function canAccessSurvey(userId: number, survey: any): Promise<boolean> {
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

async function canViewStats(
  userId: number, surveyId: number, creatorId: number
): Promise<boolean> {
  if (userId === creatorId) return true;
  const [rows] = await pool.execute(
    "SELECT 1 FROM survey_stat_viewers WHERE survey_id = ? AND user_id = ?",
    [surveyId, userId]
  ) as any[];
  return (rows as any[]).length > 0;
}

/** 문항 + 선택지 로드 — 계층 구조(children) 반환 */
async function loadQuestions(surveyId: number): Promise<any[]> {
  const [questions] = await pool.execute(
    `SELECT q.id, q.order_num, q.type, q.title, q.description, q.required, q.has_other,
            q.parent_question_id, q.trigger_option_id
     FROM survey_questions q
     WHERE q.survey_id = ?
     ORDER BY (q.parent_question_id IS NOT NULL), q.order_num`,
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

  // 계층 구조 빌드
  const topLevel: any[] = [];
  const childMap: Record<number, any[]> = {};
  for (const q of questions as any[]) {
    if (q.parent_question_id == null) {
      q.children = [];
      topLevel.push(q);
    } else {
      if (!childMap[q.parent_question_id]) childMap[q.parent_question_id] = [];
      childMap[q.parent_question_id].push(q);
    }
  }
  for (const q of topLevel) {
    q.children = childMap[q.id] ?? [];
  }
  return topLevel;
}

/** 문항 + 선택지 평탄 로드 (통계용) */
async function loadQuestionsFlat(surveyId: number): Promise<any[]> {
  const [questions] = await pool.execute(
    `SELECT q.id, q.order_num, q.type, q.title, q.description, q.required, q.has_other,
            q.parent_question_id, q.trigger_option_id
     FROM survey_questions q
     WHERE q.survey_id = ?
     ORDER BY (q.parent_question_id IS NOT NULL), q.order_num`,
    [surveyId]
  ) as any[];
  return questions as any[];
}

/** 질문 목록을 DB에 삽입 (생성 및 수정 공용) */
async function insertQuestions(conn: any, surveyId: number, questions: any[]) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const [qIns] = await conn.execute(
      `INSERT INTO survey_questions
         (survey_id, order_num, type, title, description, required, has_other,
          parent_question_id, trigger_option_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [surveyId, i, q.type, q.title?.trim(), q.description?.trim() || null,
       q.required ? 1 : 0, q.has_other ? 1 : 0]
    ) as any[];
    const qId = (qIns as any).insertId;

    // 선택지 삽입
    const optionIdMap: Record<number, number> = {}; // optionIndex → DB id
    if (["single", "multiple"].includes(q.type) && q.options?.length) {
      for (let j = 0; j < q.options.length; j++) {
        const [optIns] = await conn.execute(
          "INSERT INTO survey_options (question_id, order_num, label) VALUES (?, ?, ?)",
          [qId, j, q.options[j]]
        ) as any[];
        optionIdMap[j] = (optIns as any).insertId;
      }
    }

    // 부속 질문 삽입
    const subQuestions: any[] = q.sub_questions ?? [];
    for (let si = 0; si < subQuestions.length; si++) {
      const sq = subQuestions[si];
      // trigger_option_idx → 실제 option DB id
      const triggerOptId =
        sq.trigger_option_idx != null && optionIdMap[sq.trigger_option_idx] != null
          ? optionIdMap[sq.trigger_option_idx]
          : null;

      const [sqIns] = await conn.execute(
        `INSERT INTO survey_questions
           (survey_id, order_num, type, title, description, required, has_other,
            parent_question_id, trigger_option_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [surveyId, si, sq.type, sq.title?.trim(), sq.description?.trim() || null,
         sq.required ? 1 : 0, sq.has_other ? 1 : 0, qId, triggerOptId]
      ) as any[];
      const sqId = (sqIns as any).insertId;

      if (["single", "multiple"].includes(sq.type) && sq.options?.length) {
        for (let oj = 0; oj < sq.options.length; oj++) {
          await conn.execute(
            "INSERT INTO survey_options (question_id, order_num, label) VALUES (?, ?, ?)",
            [sqId, oj, sq.options[oj]]
          );
        }
      }
    }
  }
}

// ── POST /api/surveys — 설문 생성 ─────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const {
    title, description, scope_type, scope_id,
    allow_anonymous, allow_edit, allow_multiple,
    expires_at, questions,
  } = req.body as any;

  if (!title?.trim() || !scope_type || !questions?.length) {
    res.status(400).json({ error: "survey.missingFields" });
    return;
  }
  if (!["class", "org", "public"].includes(scope_type)) {
    res.status(400).json({ error: "survey.invalidScope" });
    return;
  }

  const isPublic   = scope_type === "public";
  const storeAnon  = isPublic ? 1 : (allow_anonymous ? 1 : 0);
  const storeEdit  = allow_edit    ? 1 : 0;
  const storeMulti = allow_multiple ? 1 : 0;
  const sid        = scope_id ? Number(scope_id) : null;

  // scope 권한 확인
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
      `INSERT INTO surveys
         (creator_id, title, description, scope_type, scope_id,
          allow_anonymous, allow_edit, allow_multiple, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title.trim(), description?.trim() || null, scope_type, sid,
       storeAnon, storeEdit, storeMulti, toMysqlDatetime(expires_at)]
    ) as any[];
    const surveyId = (ins as any).insertId;

    await insertQuestions(conn, surveyId, questions);

    // 새 설문 알림 (class/org)
    const notifyMembers = async (memberQuery: string, params: any[]) => {
      const [members] = await conn.execute(memberQuery, params) as any[];
      if ((members as any[]).length > 0) {
        const ph = (members as any[]).map(() => "(?, 'new_survey', ?, ?)").join(", ");
        const np: (string | number)[] = [];
        for (const m of members as any[]) {
          np.push(m.user_id, title.trim(), `/surveys/${surveyId}`);
        }
        await conn.execute(
          `INSERT INTO notifications (user_id, type, title, link) VALUES ${ph}`,
          np
        );
      }
    };
    if (scope_type === "class" && sid) {
      await notifyMembers("SELECT user_id FROM class_members WHERE class_id = ?", [sid]);
    } else if (scope_type === "org" && sid) {
      await notifyMembers("SELECT user_id FROM org_members WHERE org_id = ?", [sid]);
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

// ── GET /api/surveys/my ────────────────────────────────────────────────────────
router.get("/my", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const [rows] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active,
            s.allow_edit, s.allow_multiple, s.expires_at, s.created_at,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
     FROM surveys s WHERE s.creator_id = ? ORDER BY s.created_at DESC`,
    [userId]
  ) as any[];
  res.json({ surveys: rows });
});

// ── GET /api/surveys/feed ─────────────────────────────────────────────────────
router.get("/feed", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const [classSurveys] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active,
            s.allow_edit, s.allow_multiple, s.expires_at, s.created_at,
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

  const [orgSurveys] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active,
            s.allow_edit, s.allow_multiple, s.expires_at, s.created_at,
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

// ── GET /api/surveys/class/:classId ──────────────────────────────────────────
router.get("/class/:classId", requireAuth, async (req, res) => {
  const userId  = req.user!.id;
  const classId = Number(req.params.classId);

  const [pm] = await pool.execute(
    "SELECT permission FROM class_members WHERE class_id = ? AND user_id = ?",
    [classId, userId]
  ) as any[];
  if (!(pm as any[]).length) { res.status(403).json({ error: "forbidden" }); return; }

  const [rows] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active,
            s.allow_edit, s.allow_multiple, s.expires_at, s.created_at,
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

// ── GET /api/surveys/org/:orgId ───────────────────────────────────────────────
router.get("/org/:orgId", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const orgId  = Number(req.params.orgId);

  const [pm] = await pool.execute(
    "SELECT permission FROM org_members WHERE org_id = ? AND user_id = ?",
    [orgId, userId]
  ) as any[];
  if (!(pm as any[]).length) { res.status(403).json({ error: "forbidden" }); return; }

  const [rows] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active,
            s.allow_edit, s.allow_multiple, s.expires_at, s.created_at,
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

// ── GET /api/surveys/public/:id — 공개 설문 (비로그인) ────────────────────────
router.get("/public/:id", async (req, res) => {
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute(
    `SELECT s.*, u.display_name AS creator_name
     FROM surveys s LEFT JOIN users u ON u.id = s.creator_id
     WHERE s.id = ? AND s.scope_type = 'public' AND s.is_active = 1`,
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }

  const questions = await loadQuestions(surveyId);
  res.json({ survey: (rows as any[])[0], questions });
});

// ── POST /api/surveys/public/:id/respond — 공개 설문 응답 (비로그인) ──────────
router.post("/public/:id/respond", async (req, res) => {
  const surveyId = Number(req.params.id);
  const { answers } = req.body as {
    answers: Array<{ question_id: number; option_ids?: number[]; text_answer?: string }>;
  };

  const [rows] = await pool.execute(
    "SELECT * FROM surveys WHERE id = ? AND scope_type = 'public' AND is_active = 1",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const survey = (rows as any[])[0];

  if (survey.expires_at && new Date(survey.expires_at) < new Date()) {
    res.status(400).json({ error: "survey.expired" });
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [respIns] = await conn.execute(
      "INSERT INTO survey_responses (survey_id, user_id) VALUES (?, NULL)",
      [surveyId]
    ) as any[];
    const responseId = (respIns as any).insertId;
    await insertAnswers(conn, responseId, answers ?? []);
    await conn.commit();
    res.status(201).json({ message: "responded" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── GET /api/surveys/:id — 설문 상세 ─────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute(
    `SELECT s.*, u.display_name AS creator_name
     FROM surveys s LEFT JOIN users u ON u.id = s.creator_id WHERE s.id = ?`,
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const survey = (rows as any[])[0];

  const hasAccess = await canAccessSurvey(userId, survey);
  if (!hasAccess) { res.status(403).json({ error: "forbidden" }); return; }

  const [respRows] = await pool.execute(
    "SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1",
    [surveyId, userId]
  ) as any[];
  const alreadyResponded = (respRows as any[]).length > 0;

  let myAnswers: any[] = [];
  if (alreadyResponded && survey.allow_edit) {
    const responseId = (respRows as any[])[0].id;
    const [items] = await pool.execute(
      "SELECT question_id, option_id, text_answer FROM survey_response_items WHERE response_id = ?",
      [responseId]
    ) as any[];
    myAnswers = items as any[];
  }

  const questions = await loadQuestions(surveyId);
  const canStats  = await canViewStats(userId, surveyId, survey.creator_id);

  // 응답 수 (수정 페이지용)
  const [[countRow]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM survey_responses WHERE survey_id = ?",
    [surveyId]
  ) as any[];

  res.json({
    survey,
    questions,
    alreadyResponded,
    myAnswers,
    canViewStats: canStats,
    isCreator: survey.creator_id === userId,
    responseCount: (countRow as any).cnt,
  });
});

// ── 응답 삽입 헬퍼 ─────────────────────────────────────────────────────────────
async function insertAnswers(conn: any, responseId: number, answers: any[]) {
  for (const ans of answers) {
    if (ans.option_ids?.length) {
      for (const optId of ans.option_ids) {
        await conn.execute(
          "INSERT INTO survey_response_items (response_id, question_id, option_id) VALUES (?, ?, ?)",
          [responseId, ans.question_id, optId]
        );
      }
    } else if (!ans.other_text) {
      // text/rating 타입: option도 other도 없는 경우
      await conn.execute(
        "INSERT INTO survey_response_items (response_id, question_id, text_answer) VALUES (?, ?, ?)",
        [responseId, ans.question_id, ans.text_answer ?? null]
      );
    }
    // 기타(직접 입력) 응답
    if (ans.other_text) {
      await conn.execute(
        "INSERT INTO survey_response_items (response_id, question_id, text_answer, is_other) VALUES (?, ?, ?, 1)",
        [responseId, ans.question_id, ans.other_text]
      );
    }
  }
}

// ── POST /api/surveys/:id/respond — 응답 제출 ─────────────────────────────────
router.post("/:id/respond", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const { answers } = req.body as { answers: any[] };

  const [rows] = await pool.execute(
    "SELECT * FROM surveys WHERE id = ? AND is_active = 1",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const survey = (rows as any[])[0];

  if (survey.expires_at && new Date(survey.expires_at) < new Date()) {
    res.status(400).json({ error: "survey.expired" });
    return;
  }

  const hasAccess = await canAccessSurvey(userId, survey);
  if (!hasAccess) { res.status(403).json({ error: "forbidden" }); return; }

  if (!survey.allow_multiple) {
    const [existing] = await pool.execute(
      "SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ?",
      [surveyId, userId]
    ) as any[];
    if ((existing as any[]).length) {
      res.status(409).json({ error: "survey.alreadyResponded" });
      return;
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const storeUserId = survey.allow_anonymous ? null : userId;
    const [respIns] = await conn.execute(
      "INSERT INTO survey_responses (survey_id, user_id) VALUES (?, ?)",
      [surveyId, storeUserId]
    ) as any[];
    await insertAnswers(conn, (respIns as any).insertId, answers ?? []);
    await conn.commit();
    res.status(201).json({ message: "responded" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── PUT /api/surveys/:id/respond — 응답 수정 (allow_edit만) ───────────────────
router.put("/:id/respond", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const { answers } = req.body as { answers: any[] };

  const [rows] = await pool.execute(
    "SELECT * FROM surveys WHERE id = ? AND is_active = 1",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const survey = (rows as any[])[0];

  if (!survey.allow_edit) { res.status(403).json({ error: "survey.editNotAllowed" }); return; }

  if (survey.expires_at && new Date(survey.expires_at) < new Date()) {
    res.status(400).json({ error: "survey.expired" });
    return;
  }

  const [existing] = await pool.execute(
    "SELECT id FROM survey_responses WHERE survey_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1",
    [surveyId, userId]
  ) as any[];
  if (!(existing as any[]).length) { res.status(404).json({ error: "survey.noResponse" }); return; }
  const responseId = (existing as any[])[0].id;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM survey_response_items WHERE response_id = ?", [responseId]);
    await insertAnswers(conn, responseId, answers ?? []);
    await conn.commit();
    res.json({ message: "updated" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── GET /api/surveys/:id/stats ────────────────────────────────────────────────
router.get("/:id/stats", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute("SELECT * FROM surveys WHERE id = ?", [surveyId]) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const survey = (rows as any[])[0];

  if (!(await canViewStats(userId, surveyId, survey.creator_id))) {
    res.status(403).json({ error: "forbidden" }); return;
  }

  const questions = await loadQuestionsFlat(surveyId);

  const [[totalRow]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM survey_responses WHERE survey_id = ?",
    [surveyId]
  ) as any[];
  const total = (totalRow as any).cnt;

  for (const q of questions) {
    if (["single", "multiple"].includes(q.type)) {
      const [opts] = await pool.execute(
        `SELECT so.id, so.label, COUNT(sri.id) AS count
         FROM survey_options so
         LEFT JOIN survey_response_items sri ON sri.option_id = so.id
         WHERE so.question_id = ?
         GROUP BY so.id ORDER BY so.order_num`,
        [q.id]
      ) as any[];
      q.options = opts;
      // 기타(직접 입력) 통계
      if (q.has_other) {
        const [[otherRow]] = await pool.execute(
          "SELECT COUNT(*) AS count FROM survey_response_items WHERE question_id = ? AND is_other = 1",
          [q.id]
        ) as any[];
        q.other_count = Number((otherRow as any).count);
        const [otherTexts] = await pool.execute(
          "SELECT text_answer FROM survey_response_items WHERE question_id = ? AND is_other = 1 AND text_answer IS NOT NULL",
          [q.id]
        ) as any[];
        q.other_answers = (otherTexts as any[]).map((r: any) => r.text_answer);
      }
    } else if (q.type === "text") {
      const [texts] = await pool.execute(
        "SELECT sri.text_answer FROM survey_response_items sri WHERE sri.question_id = ? AND sri.text_answer IS NOT NULL",
        [q.id]
      ) as any[];
      q.text_answers = (texts as any[]).map((r: any) => r.text_answer);
    } else if (q.type === "rating") {
      const [[ratingRow]] = await pool.execute(
        "SELECT AVG(CAST(sri.text_answer AS DECIMAL(5,2))) AS avg_rating, COUNT(*) AS count FROM survey_response_items sri WHERE sri.question_id = ?",
        [q.id]
      ) as any[];
      q.rating_stats = ratingRow;
      const [dist] = await pool.execute(
        `SELECT CAST(sri.text_answer AS UNSIGNED) AS rating, COUNT(*) AS count
         FROM survey_response_items sri
         WHERE sri.question_id = ? AND sri.text_answer IS NOT NULL
         GROUP BY rating ORDER BY rating`,
        [q.id]
      ) as any[];
      q.rating_distribution = dist;
    }
  }

  // 통계도 계층 구조로 반환
  const topLevel: any[] = [];
  const childMap: Record<number, any[]> = {};
  for (const q of questions) {
    if (q.parent_question_id == null) {
      q.children = [];
      topLevel.push(q);
    } else {
      if (!childMap[q.parent_question_id]) childMap[q.parent_question_id] = [];
      childMap[q.parent_question_id].push(q);
    }
  }
  for (const q of topLevel) {
    q.children = childMap[q.id] ?? [];
  }

  let statViewers: any[] = [];
  if (survey.creator_id === userId) {
    const [sv] = await pool.execute(
      `SELECT u.id, u.display_name, u.email FROM survey_stat_viewers ssv
       JOIN users u ON u.id = ssv.user_id WHERE ssv.survey_id = ?`,
      [surveyId]
    ) as any[];
    statViewers = sv as any[];
  }

  res.json({ survey, questions: topLevel, totalResponses: total, statViewers });
});

// ── POST /api/surveys/:id/viewers ─────────────────────────────────────────────
router.post("/:id/viewers", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const { email } = req.body as { email: string };

  const [surveyRows] = await pool.execute("SELECT creator_id FROM surveys WHERE id = ?", [surveyId]) as any[];
  if (!(surveyRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  if ((surveyRows as any[])[0].creator_id !== userId) { res.status(403).json({ error: "forbidden" }); return; }

  const [userRows] = await pool.execute("SELECT id FROM users WHERE email = ?", [email?.trim()]) as any[];
  if (!(userRows as any[]).length) { res.status(404).json({ error: "survey.userNotFound" }); return; }

  await pool.execute(
    "INSERT IGNORE INTO survey_stat_viewers (survey_id, user_id) VALUES (?, ?)",
    [surveyId, (userRows as any[])[0].id]
  );
  res.json({ message: "added" });
});

// ── DELETE /api/surveys/:id/viewers/:uid ─────────────────────────────────────
router.delete("/:id/viewers/:uid", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const targetId = Number(req.params.uid);

  const [surveyRows] = await pool.execute("SELECT creator_id FROM surveys WHERE id = ?", [surveyId]) as any[];
  if (!(surveyRows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  if ((surveyRows as any[])[0].creator_id !== userId) { res.status(403).json({ error: "forbidden" }); return; }

  await pool.execute(
    "DELETE FROM survey_stat_viewers WHERE survey_id = ? AND user_id = ?",
    [surveyId, targetId]
  );
  res.json({ message: "removed" });
});

// ── PATCH /api/surveys/:id — 부분 수정 (활성화/비활성화 등) ───────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const { title, description, is_active, expires_at } = req.body as any;

  const [rows] = await pool.execute("SELECT creator_id FROM surveys WHERE id = ?", [surveyId]) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  if ((rows as any[])[0].creator_id !== userId) { res.status(403).json({ error: "forbidden" }); return; }

  const updates: string[] = [];
  const params: any[] = [];
  if (title?.trim())             { updates.push("title = ?");       params.push(title.trim()); }
  if (description !== undefined) { updates.push("description = ?"); params.push(description?.trim() || null); }
  if (is_active !== undefined)   { updates.push("is_active = ?");   params.push(is_active ? 1 : 0); }
  if (expires_at !== undefined)  { updates.push("expires_at = ?");  params.push(toMysqlDatetime(expires_at)); }
  if (updates.length === 0) { res.json({ message: "nothing" }); return; }
  params.push(surveyId);

  await pool.execute(`UPDATE surveys SET ${updates.join(", ")} WHERE id = ?`, params);
  res.json({ message: "updated" });
});

// ── PUT /api/surveys/:id — 설문 전체 수정 (문항 포함) ────────────────────────
router.put("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const {
    title, description,
    allow_anonymous, allow_edit, allow_multiple,
    expires_at, questions,
  } = req.body as any;

  if (!title?.trim()) {
    res.status(400).json({ error: "survey.missingFields" });
    return;
  }

  const [rows] = await pool.execute(
    "SELECT creator_id, scope_type FROM surveys WHERE id = ?",
    [surveyId]
  ) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  const { creator_id, scope_type } = (rows as any[])[0];
  if (creator_id !== userId) { res.status(403).json({ error: "forbidden" }); return; }

  const isPublic   = scope_type === "public";
  const storeAnon  = isPublic ? 1 : (allow_anonymous ? 1 : 0);
  const storeEdit  = allow_edit    ? 1 : 0;
  const storeMulti = allow_multiple ? 1 : 0;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 기존 응답 + 문항 삭제 (CASCADE로 response_items 자동 삭제)
    await conn.execute("DELETE FROM survey_responses WHERE survey_id = ?", [surveyId]);
    await conn.execute(
      "DELETE FROM survey_questions WHERE survey_id = ? AND parent_question_id IS NULL",
      [surveyId]
    );

    // surveys 기본 정보 업데이트
    await conn.execute(
      `UPDATE surveys SET title = ?, description = ?,
        allow_anonymous = ?, allow_edit = ?, allow_multiple = ?, expires_at = ?
       WHERE id = ?`,
      [title.trim(), description?.trim() || null,
       storeAnon, storeEdit, storeMulti, toMysqlDatetime(expires_at), surveyId]
    );

    // 문항 재삽입
    if (questions?.length) {
      await insertQuestions(conn, surveyId, questions);
    }

    await conn.commit();
    res.json({ message: "updated" });
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    try { conn.release(); } catch { /* ignore */ }
  }
});

// ── DELETE /api/surveys/:id ───────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute("SELECT creator_id FROM surveys WHERE id = ?", [surveyId]) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  if ((rows as any[])[0].creator_id !== userId) { res.status(403).json({ error: "forbidden" }); return; }

  await pool.execute("DELETE FROM surveys WHERE id = ?", [surveyId]);
  res.json({ message: "deleted" });
});

export default router;
