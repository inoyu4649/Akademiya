import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

// L-1: OG 메타 엔드포인트에서 신뢰할 호스트 화이트리스트 (X-Forwarded-Host 미신뢰 반영 방지)
const ALLOWED_OG_HOSTS = new Set(["akademiya.kr", "www.akademiya.kr"]);

// L-5: 공개(비로그인) 설문 응답 전용 rate limiter — 전역 200/15분보다 엄격하게 IP당 10/15분
const publicRespondLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" },
});

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
            q.parent_question_id, q.trigger_option_id,
            q.trigger_rating_min, q.trigger_rating_max
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
            q.parent_question_id, q.trigger_option_id,
            q.trigger_rating_min, q.trigger_rating_max
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
            parent_question_id, trigger_option_id, trigger_rating_min, trigger_rating_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [surveyId, si, sq.type, sq.title?.trim(), sq.description?.trim() || null,
         sq.required ? 1 : 0, sq.has_other ? 1 : 0, qId, triggerOptId,
         sq.trigger_rating_min ?? null, sq.trigger_rating_max ?? null]
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
    expires_at, questions, public_identity_question,
  } = req.body as any;

  if (!title?.trim() || !scope_type || !questions?.length) {
    res.status(400).json({ error: "survey.missingFields" });
    return;
  }
  if (!["class", "org", "public"].includes(scope_type)) {
    res.status(400).json({ error: "survey.invalidScope" });
    return;
  }

  const isPublic      = scope_type === "public";
  const identityQ     = isPublic ? (public_identity_question?.trim() || null) : null;
  const storeAnon     = isPublic ? (identityQ ? 0 : 1) : (allow_anonymous ? 1 : 0);
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
          allow_anonymous, allow_edit, allow_multiple, expires_at, public_identity_question)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, title.trim(), description?.trim() || null, scope_type, sid,
       storeAnon, storeEdit, storeMulti, toMysqlDatetime(expires_at), identityQ]
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

// ── GET /api/surveys/viewable ─────────────────────────────────────────────────
// 통계 조회 권한이 부여된 설문 (내가 만든 설문 제외)
router.get("/viewable", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const [rows] = await pool.execute(
    `SELECT s.id, s.title, s.scope_type, s.scope_id, s.is_active,
            s.allow_edit, s.allow_multiple, s.expires_at, s.created_at,
            s.creator_id,
            u.display_name AS creator_name,
            CASE
              WHEN s.scope_type = 'class' THEN c.name
              WHEN s.scope_type = 'org'   THEN o.name
              ELSE NULL
            END AS scope_name,
            (SELECT COUNT(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
     FROM survey_stat_viewers ssv
     JOIN surveys s ON s.id = ssv.survey_id
     JOIN users u ON u.id = s.creator_id
     LEFT JOIN classes c ON c.id = s.scope_id AND s.scope_type = 'class'
     LEFT JOIN organizations o ON o.id = s.scope_id AND s.scope_type = 'org'
     WHERE ssv.user_id = ? AND s.creator_id != ?
     ORDER BY s.created_at DESC`,
    [userId, userId]
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

// ── GET /api/surveys/og/:id — 소셜 봇용 OG 메타 HTML ─────────────────────────
router.get("/og/:id", async (req, res) => {
  const surveyId = Number(req.params.id);

  const [rows] = await pool.execute(
    "SELECT title FROM surveys WHERE id = ? AND scope_type = 'public' AND is_active = 1",
    [surveyId]
  ) as any[];

  const surveyTitle = (rows as any[]).length > 0
    ? (rows as any[])[0].title as string
    : "";

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // L-1: X-Forwarded-Host를 그대로 신뢰하지 않고 화이트리스트로 제한
  const requestedHost = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "";
  const host = ALLOWED_OG_HOSTS.has(requestedHost) ? requestedHost : "akademiya.kr";
  // _bot_bypass=1 파라미터: nginx 봇 감지를 우회하여 무한 리다이렉트 루프 방지
  const pageUrl = `https://${host}/surveys/public/${surveyId}?_bot_bypass=1`;
  const canonicalUrl = `https://${host}/surveys/public/${surveyId}`;
  const imageUrl = `https://${host}/logo.png`;
  const pageTitle = surveyTitle ? `${esc(surveyTitle)} — Akademiya 설문` : "Akademiya 설문";
  const pageDesc = surveyTitle
    ? `${esc(surveyTitle)} — Akademiya 공개 설문에 참여하세요. 로그인 없이 응답할 수 있습니다.`
    : "Akademiya 공개 설문에 참여하세요. 로그인 없이 응답할 수 있습니다.";

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": canonicalUrl,
    "name": surveyTitle || "Akademiya 설문",
    "description": pageDesc,
    "url": canonicalUrl,
    "inLanguage": "ko",
    "isPartOf": { "@id": `https://${host}/#website` },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Akademiya", "item": `https://${host}/` },
        { "@type": "ListItem", "position": 2, "name": "설문", "item": canonicalUrl }
      ]
    }
  });

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <meta name="description" content="${pageDesc}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${pageDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <meta property="og:image:alt" content="Akademiya 로고">
  <meta property="og:site_name" content="Akademiya">
  <meta property="og:locale" content="ko_KR">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${pageDesc}">
  <meta name="twitter:image" content="${imageUrl}">
  <script type="application/ld+json">${jsonLd}</script>
  <meta http-equiv="refresh" content="0; url=${pageUrl}">
</head>
<body>
  <p><a href="${pageUrl}">설문 참여하기 →</a></p>
  <script>window.location.replace(${JSON.stringify(pageUrl)});</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
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
router.post("/public/:id/respond", publicRespondLimiter, async (req, res) => {
  const surveyId = Number(req.params.id);
  const { answers, respondent_name } = req.body as {
    answers: Array<{ question_id: number; option_ids?: number[]; text_answer?: string }>;
    respondent_name?: string;
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

  if (survey.public_identity_question && !respondent_name?.trim()) {
    res.status(400).json({ error: "survey.identityRequired" });
    return;
  }

  const storedName = survey.public_identity_question ? (respondent_name!.trim()) : null;

  // L-5: 익명 응답은 user_id가 NULL이라 UNIQUE(survey_id, user_id)가 무력화됨 → IP 기준 중복응답 차단
  const responseIp = req.ip ?? null;
  if (!survey.allow_multiple && responseIp) {
    const [existing] = await pool.execute(
      "SELECT id FROM survey_responses WHERE survey_id = ? AND response_ip = ?",
      [surveyId, responseIp]
    ) as any[];
    if ((existing as any[]).length) {
      res.status(409).json({ error: "survey.alreadyResponded" });
      return;
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [respIns] = await conn.execute(
      "INSERT INTO survey_responses (survey_id, user_id, respondent_name, response_ip) VALUES (?, NULL, ?, ?)",
      [surveyId, storedName, responseIp]
    ) as any[];
    const responseId = (respIns as any).insertId;
    await insertAnswers(conn, surveyId, responseId, answers ?? []);
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
// 통계 오염 방지(M-2): question_id가 해당 survey 소속인지, option_id가 해당 question
// 소속인지 화이트리스트로 검증한 뒤에만 저장. 소속이 아닌 id는 조용히 무시한다
// (비공개 설문 집계를 비인증 공개 응답으로 조작하는 것을 차단).
async function insertAnswers(conn: any, surveyId: number, responseId: number, answers: any[]) {
  // survey 소속 question_id 집합
  const [qRows] = await conn.execute(
    "SELECT id FROM survey_questions WHERE survey_id = ?",
    [surveyId]
  );
  const validQuestionIds = new Set<number>((qRows as any[]).map((r) => Number(r.id)));

  // question별 유효 option_id 집합
  const [oRows] = await conn.execute(
    `SELECT o.id, o.question_id
       FROM survey_options o
       JOIN survey_questions q ON q.id = o.question_id
      WHERE q.survey_id = ?`,
    [surveyId]
  );
  const validOptionsByQuestion = new Map<number, Set<number>>();
  for (const r of oRows as any[]) {
    const qid = Number(r.question_id);
    if (!validOptionsByQuestion.has(qid)) validOptionsByQuestion.set(qid, new Set());
    validOptionsByQuestion.get(qid)!.add(Number(r.id));
  }

  for (const ans of answers) {
    const qid = Number(ans.question_id);
    if (!validQuestionIds.has(qid)) continue; // 이 설문 소속이 아닌 question → 무시

    if (ans.option_ids?.length) {
      const validOpts = validOptionsByQuestion.get(qid) ?? new Set<number>();
      for (const optId of ans.option_ids) {
        if (!validOpts.has(Number(optId))) continue; // 이 question 소속이 아닌 option → 무시
        await conn.execute(
          "INSERT INTO survey_response_items (response_id, question_id, option_id) VALUES (?, ?, ?)",
          [responseId, qid, Number(optId)]
        );
      }
    } else if (!ans.other_text) {
      // text/rating 타입: option도 other도 없는 경우
      await conn.execute(
        "INSERT INTO survey_response_items (response_id, question_id, text_answer) VALUES (?, ?, ?)",
        [responseId, qid, ans.text_answer ?? null]
      );
    }
    // 기타(직접 입력) 응답
    if (ans.other_text) {
      await conn.execute(
        "INSERT INTO survey_response_items (response_id, question_id, text_answer, is_other) VALUES (?, ?, ?, 1)",
        [responseId, qid, ans.other_text]
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
    await insertAnswers(conn, surveyId, (respIns as any).insertId, answers ?? []);
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
    await insertAnswers(conn, surveyId, responseId, answers ?? []);
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

  const isNamed = !survey.allow_anonymous;

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

      // 기명 설문: 선택지별 응답자 목록
      if (isNamed) {
        for (const opt of q.options as any[]) {
          const [voters] = await pool.execute(
            `SELECT u.id, COALESCE(u.display_name, sr.respondent_name) AS display_name, u.email
             FROM survey_response_items sri
             JOIN survey_responses sr ON sr.id = sri.response_id
             LEFT JOIN users u ON u.id = sr.user_id
             WHERE sri.option_id = ?`,
            [opt.id]
          ) as any[];
          opt.voters = voters;
        }
      }

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

        // 기명 설문: 기타 응답 응답자 정보
        if (isNamed) {
          const [otherWithUsers] = await pool.execute(
            `SELECT sri.text_answer, u.id AS user_id,
                    COALESCE(u.display_name, sr.respondent_name) AS display_name, u.email
             FROM survey_response_items sri
             JOIN survey_responses sr ON sr.id = sri.response_id
             LEFT JOIN users u ON u.id = sr.user_id
             WHERE sri.question_id = ? AND sri.is_other = 1 AND sri.text_answer IS NOT NULL`,
            [q.id]
          ) as any[];
          q.other_answers_with_users = otherWithUsers;
        }
      }
    } else if (q.type === "text") {
      const [texts] = await pool.execute(
        "SELECT sri.text_answer FROM survey_response_items sri WHERE sri.question_id = ? AND sri.text_answer IS NOT NULL",
        [q.id]
      ) as any[];
      q.text_answers = (texts as any[]).map((r: any) => r.text_answer);

      // 기명 설문: 응답자 정보 포함
      if (isNamed) {
        const [textsWithUsers] = await pool.execute(
          `SELECT sri.text_answer, u.id AS user_id,
                  COALESCE(u.display_name, sr.respondent_name) AS display_name, u.email
           FROM survey_response_items sri
           JOIN survey_responses sr ON sr.id = sri.response_id
           LEFT JOIN users u ON u.id = sr.user_id
           WHERE sri.question_id = ? AND sri.text_answer IS NOT NULL`,
          [q.id]
        ) as any[];
        q.text_answers_with_users = textsWithUsers;
      }
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

      // 기명 설문: 응답자별 평점
      if (isNamed) {
        const [ratingWithUsers] = await pool.execute(
          `SELECT CAST(sri.text_answer AS UNSIGNED) AS rating, u.id AS user_id,
                  COALESCE(u.display_name, sr.respondent_name) AS display_name, u.email
           FROM survey_response_items sri
           JOIN survey_responses sr ON sr.id = sri.response_id
           LEFT JOIN users u ON u.id = sr.user_id
           WHERE sri.question_id = ? AND sri.text_answer IS NOT NULL
           ORDER BY display_name`,
          [q.id]
        ) as any[];
        q.rating_answers = ratingWithUsers;
      }
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

// ── PATCH /api/surveys/:id — 부분 수정 (활성화/비활성화, 속성 변경 등) ──────────
router.patch("/:id", requireAuth, async (req, res) => {
  const userId   = req.user!.id;
  const surveyId = Number(req.params.id);
  const {
    title, description, is_active, expires_at,
    allow_anonymous, allow_edit, allow_multiple, public_identity_question,
  } = req.body as any;

  const [rows] = await pool.execute("SELECT creator_id, scope_type FROM surveys WHERE id = ?", [surveyId]) as any[];
  if (!(rows as any[]).length) { res.status(404).json({ error: "notFound" }); return; }
  if ((rows as any[])[0].creator_id !== userId) { res.status(403).json({ error: "forbidden" }); return; }

  const scopeType = (rows as any[])[0].scope_type;

  const updates: string[] = [];
  const params: any[] = [];
  if (title?.trim())             { updates.push("title = ?");       params.push(title.trim()); }
  if (description !== undefined) { updates.push("description = ?"); params.push(description?.trim() || null); }
  if (is_active !== undefined)   { updates.push("is_active = ?");   params.push(is_active ? 1 : 0); }
  if (expires_at !== undefined)  { updates.push("expires_at = ?");  params.push(toMysqlDatetime(expires_at)); }
  if (allow_edit !== undefined)     { updates.push("allow_edit = ?");     params.push(allow_edit ? 1 : 0); }
  if (allow_multiple !== undefined) { updates.push("allow_multiple = ?"); params.push(allow_multiple ? 1 : 0); }
  // 공개 설문은 public_identity_question으로 allow_anonymous 자동 결정
  if (scopeType === "public" && public_identity_question !== undefined) {
    const identityQ = public_identity_question?.trim() || null;
    updates.push("public_identity_question = ?");
    params.push(identityQ);
    updates.push("allow_anonymous = ?");
    params.push(identityQ ? 0 : 1);
  } else if (allow_anonymous !== undefined) {
    updates.push("allow_anonymous = ?");
    params.push(allow_anonymous ? 1 : 0);
  }
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
    expires_at, questions, public_identity_question,
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
  const identityQ  = isPublic ? (public_identity_question?.trim() || null) : null;
  const storeAnon  = isPublic ? (identityQ ? 0 : 1) : (allow_anonymous ? 1 : 0);
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
        allow_anonymous = ?, allow_edit = ?, allow_multiple = ?, expires_at = ?,
        public_identity_question = ?
       WHERE id = ?`,
      [title.trim(), description?.trim() || null,
       storeAnon, storeEdit, storeMulti, toMysqlDatetime(expires_at), identityQ, surveyId]
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
