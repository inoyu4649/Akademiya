import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  surveyApi,
  type Survey, type SurveyQuestion, type SurveyAnswer, type MyAnswerItem,
} from "../../api/survey.api";
import styles from "./SurveyPage.module.css";

function buildAnswerState(items: MyAnswerItem[]): Record<number, SurveyAnswer> {
  const state: Record<number, SurveyAnswer> = {};
  for (const item of items) {
    const qId = item.question_id;
    if (!state[qId]) state[qId] = { question_id: qId };
    if (item.is_other) {
      state[qId].other_text = item.text_answer ?? "";
    } else if (item.option_id != null) {
      state[qId].option_ids = [...(state[qId].option_ids ?? []), item.option_id];
    } else if (item.text_answer != null) {
      state[qId].text_answer = item.text_answer;
    }
  }
  return state;
}

/** 질문 블록 렌더링 (최상위 + 부속 질문 공용) */
function QuestionBlock({
  q, label, indent, answers, setAnswer, toggleOption, toggleOther,
}: {
  q: SurveyQuestion;
  label: string;
  indent?: boolean;
  answers: Record<number, SurveyAnswer>;
  setAnswer: (qId: number, patch: Partial<SurveyAnswer>) => void;
  toggleOption: (qId: number, optId: number, multi: boolean) => void;
  toggleOther: (qId: number, isSingle: boolean) => void;
}) {
  const { t } = useTranslation();
  const otherSelected = !!q.has_other && answers[q.id]?.other_text !== undefined;
  return (
    <div className={`${styles.questionBlock} ${indent ? styles.questionBlockIndent : ""}`}>
      <div className={styles.questionLabel}>
        <span className={styles.questionNum}>{label}.</span>
        {q.title}
        {q.required === 1 && <span className={styles.requiredMark}>*</span>}
      </div>
      {q.description && <p className={styles.questionDesc}>{q.description}</p>}

      {q.type === "single" && (
        <>
          {q.options?.map((opt) => (
            <label key={opt.id} className={styles.optLabel}>
              <input
                type="radio" name={`q${q.id}`}
                checked={(answers[q.id]?.option_ids ?? []).includes(opt.id)}
                onChange={() => toggleOption(q.id, opt.id, false)}
              />
              {opt.label}
            </label>
          ))}
          {!!q.has_other && (
            <>
              <label className={styles.optLabel}>
                <input
                  type="radio" name={`q${q.id}`}
                  checked={otherSelected}
                  onChange={() => toggleOther(q.id, true)}
                />
                {t("survey.otherOption")}
              </label>
              {otherSelected && (
                <input
                  className={`${styles.input} ${styles.otherInput}`}
                  value={answers[q.id]?.other_text ?? ""}
                  onChange={(e) => setAnswer(q.id, { other_text: e.target.value })}
                  placeholder={t("survey.otherInputPlaceholder")}
                  maxLength={500}
                />
              )}
            </>
          )}
        </>
      )}

      {q.type === "multiple" && (
        <>
          {q.options?.map((opt) => (
            <label key={opt.id} className={styles.optLabel}>
              <input
                type="checkbox"
                checked={(answers[q.id]?.option_ids ?? []).includes(opt.id)}
                onChange={() => toggleOption(q.id, opt.id, true)}
              />
              {opt.label}
            </label>
          ))}
          {!!q.has_other && (
            <>
              <label className={styles.optLabel}>
                <input
                  type="checkbox"
                  checked={otherSelected}
                  onChange={() => toggleOther(q.id, false)}
                />
                {t("survey.otherOption")}
              </label>
              {otherSelected && (
                <input
                  className={`${styles.input} ${styles.otherInput}`}
                  value={answers[q.id]?.other_text ?? ""}
                  onChange={(e) => setAnswer(q.id, { other_text: e.target.value })}
                  placeholder={t("survey.otherInputPlaceholder")}
                  maxLength={500}
                />
              )}
            </>
          )}
        </>
      )}

      {q.type === "text" && (
        <textarea
          className={styles.textarea} rows={3}
          value={answers[q.id]?.text_answer ?? ""}
          onChange={(e) => setAnswer(q.id, { text_answer: e.target.value })}
          placeholder={t("survey.textAnswerPlaceholder")}
        />
      )}

      {q.type === "rating" && (
        <div className={styles.ratingRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n} type="button"
              className={`${styles.ratingBtn} ${answers[q.id]?.text_answer === String(n) ? styles.ratingBtnActive : ""}`}
              onClick={() => setAnswer(q.id, { text_answer: String(n) })}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SurveyDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const surveyId = Number(id);

  const [survey,    setSurvey]    = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [canStats,  setCanStats]  = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [editMode,   setEditMode]   = useState(false);
  const [toast,      setToast]      = useState("");
  const [answers,    setAnswers]    = useState<Record<number, SurveyAnswer>>({});

  useEffect(() => {
    surveyApi.detail(surveyId)
      .then(({ survey: s, questions: qs, alreadyResponded: ar,
               myAnswers, canViewStats: cs, isCreator: ic }) => {
        setSurvey(s);
        setQuestions(qs);
        setAlreadyResponded(ar);
        setCanStats(cs);
        setIsCreator(ic);
        if (ar && s.allow_edit && myAnswers?.length) {
          setAnswers(buildAnswerState(myAnswers));
        }
      })
      .catch(() => navigate("/surveys"))
      .finally(() => setLoading(false));
  }, [surveyId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function setAnswer(qId: number, patch: Partial<SurveyAnswer>) {
    setAnswers((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], ...patch, question_id: qId },
    }));
  }

  function toggleOption(qId: number, optId: number, multi: boolean) {
    setAnswers((prev) => {
      const cur  = prev[qId]?.option_ids ?? [];
      const next = multi
        ? cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId]
        : [optId];
      if (!multi) {
        // 단일 선택: 실제 선택지 클릭 시 "기타" 해제
        const { other_text, ...rest } = prev[qId] ?? { question_id: qId };
        return { ...prev, [qId]: { ...rest, question_id: qId, option_ids: next } };
      }
      return { ...prev, [qId]: { ...prev[qId], question_id: qId, option_ids: next } };
    });
  }

  function toggleOther(qId: number, isSingle: boolean) {
    setAnswers((prev) => {
      const cur = prev[qId];
      if (cur?.other_text !== undefined) {
        // 기타 해제
        const { other_text, ...rest } = cur;
        return { ...prev, [qId]: rest };
      }
      // 기타 선택
      if (isSingle) {
        // 단일 선택: 기존 option_ids 비움
        const { option_ids, ...rest } = cur ?? { question_id: qId };
        return { ...prev, [qId]: { ...rest, question_id: qId, option_ids: [], other_text: "" } };
      }
      return { ...prev, [qId]: { ...cur, question_id: qId, other_text: "" } };
    });
  }

  /** 현재 answers 기준으로 표시해야 할 모든 질문(부속 포함) 수집 */
  function getVisibleQuestions(): Array<{ q: SurveyQuestion; label: string; indent: boolean }> {
    const result: Array<{ q: SurveyQuestion; label: string; indent: boolean }> = [];
    questions.forEach((q, qi) => {
      result.push({ q, label: `${qi + 1}`, indent: false });
      const selectedOptionIds = answers[q.id]?.option_ids ?? [];
      (q.children ?? []).forEach((sq, sqi) => {
        const show =
          sq.trigger_option_id == null ||
          selectedOptionIds.includes(sq.trigger_option_id);
        if (show) {
          result.push({ q: sq, label: `${qi + 1}-${sqi + 1}`, indent: true });
        }
      });
    });
    return result;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const visible = getVisibleQuestions();
    for (const { q } of visible) {
      if (!q.required) continue;
      const ans = answers[q.id];
      if (q.type === "text" || q.type === "rating") {
        if (!ans?.text_answer?.trim()) { showToast(t("survey.requiredFieldMissing", { title: q.title })); return; }
      } else {
        const hasOption = (ans?.option_ids?.length ?? 0) > 0;
        const otherFilled = !!q.has_other && !!ans?.other_text?.trim();
        if (!hasOption && !otherFilled) {
          showToast(t("survey.requiredFieldMissing", { title: q.title })); return;
        }
      }
    }

    // "기타" 텍스트 검증 (required 여부 무관)
    for (const { q } of visible) {
      if (q.type !== "single" && q.type !== "multiple") continue;
      if (!q.has_other) continue;
      const ans = answers[q.id];
      if (ans?.other_text !== undefined && !ans.other_text.trim()) {
        showToast(t("survey.otherTextRequired")); return;
      }
    }

    setSubmitting(true);
    try {
      if (editMode) {
        await surveyApi.editResponse(surveyId, Object.values(answers));
        setEditMode(false);
        showToast(t("survey.editSuccess"));
      } else {
        await surveyApi.respond(surveyId, Object.values(answers));
        setSubmitted(true);
        setAlreadyResponded(true);
        showToast(t("survey.submitSuccess"));
      }
    } catch (err: any) {
      const code = err?.response?.data?.error ?? "";
      if (code === "survey.alreadyResponded") showToast(t("survey.alreadyRespondedErr"));
      else if (code === "survey.expired")     showToast(t("survey.expiredErr"));
      else if (code === "survey.editNotAllowed") showToast(t("survey.editNotAllowed"));
      else showToast(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive() {
    if (!survey) return;
    try {
      await surveyApi.update(surveyId, { is_active: !survey.is_active });
      setSurvey((prev) => prev ? { ...prev, is_active: prev.is_active ? 0 : 1 } : prev);
      showToast(t("survey.updated"));
    } catch { showToast(t("common.error")); }
  }

  async function handleDelete() {
    if (!confirm(t("survey.confirmDelete"))) return;
    try {
      await surveyApi.delete(surveyId);
      navigate("/surveys");
    } catch { showToast(t("common.error")); }
  }

  if (loading) return <div className={styles.page}><p className={styles.empty}>{t("common.loading")}</p></div>;
  if (!survey) return null;

  const isExpired  = !!survey.expires_at && new Date(survey.expires_at) < new Date();
  const canRespond =
    (!alreadyResponded || !!survey.allow_multiple || editMode) &&
    !!survey.is_active &&
    !isExpired &&
    !submitted;

  const visibleQuestions = getVisibleQuestions();

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <button className={styles.backBtn} onClick={() => navigate("/surveys")}>
        ← {t("common.back")}
      </button>

      <div className={styles.surveyHeader}>
        <div className={styles.surveyMeta}>
          <span className={`${styles.scopeBadge} ${styles[`scope_${survey.scope_type}`]}`}>
            {t(`survey.scope_${survey.scope_type}`)}
          </span>
          {!survey.is_active && <span className={styles.inactiveBadge}>{t("survey.inactive")}</span>}
          {isExpired           && <span className={styles.expiredBadge}>{t("survey.expired")}</span>}
          {!!survey.allow_edit     && <span className={styles.featureBadge}>{t("survey.badgeEdit")}</span>}
          {!!survey.allow_multiple && <span className={styles.featureBadge}>{t("survey.badgeMultiple")}</span>}
          {(alreadyResponded || submitted) && !survey.allow_multiple && (
            <span className={styles.respondedBadge}>{t("survey.responded")}</span>
          )}
        </div>
        <h1 className={styles.pageTitle}>{survey.title}</h1>
        {survey.description && <p className={styles.surveyDesc}>{survey.description}</p>}
        <div className={styles.surveyInfo}>
          <span>{t("survey.by")}: {survey.creator_name}</span>
          {survey.expires_at && (
            <span>· {t("survey.expiresAt")}: {new Date(survey.expires_at).toLocaleString()}</span>
          )}
        </div>

        {/* 크리에이터 액션 */}
        {isCreator && (
          <div className={styles.creatorActions}>
            <button className={styles.statsBtn} onClick={() => navigate(`/surveys/${surveyId}/stats`)}>
              📊 {t("survey.viewStats")}
            </button>
            <button className={styles.statsBtn} onClick={() => navigate(`/surveys/${surveyId}/edit`)}>
              ✏️ {t("survey.editSurvey")}
            </button>
            <button className={styles.toggleBtn} onClick={handleToggleActive}>
              {survey.is_active ? t("survey.deactivate") : t("survey.activate")}
            </button>
            <button className={styles.deleteBtn} onClick={handleDelete}>
              {t("survey.delete")}
            </button>
            {survey.scope_type === "public" && (
              <button
                className={styles.copyUrlBtn}
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/surveys/public/${surveyId}`);
                  showToast(t("survey.urlCopied"));
                }}
              >
                🔗 {t("survey.copyUrl")}
              </button>
            )}
          </div>
        )}

        {!isCreator && canStats && (
          <button className={styles.statsBtn} onClick={() => navigate(`/surveys/${surveyId}/stats`)}>
            📊 {t("survey.viewStats")}
          </button>
        )}
      </div>

      {/* 이미 응답 */}
      {(alreadyResponded || submitted) && !editMode && !survey.allow_multiple && (
        <div className={styles.respondedBox}>
          <span>✓</span>
          <p>{t("survey.alreadyRespondedMsg")}</p>
          {!!survey.allow_edit && survey.is_active && !isExpired && (
            <button className={styles.editResponseBtn} onClick={() => setEditMode(true)}>
              ✏️ {t("survey.editResponse")}
            </button>
          )}
        </div>
      )}

      {!!survey.allow_multiple && survey.is_active && !isExpired && (
        <p className={styles.multipleNote}>{t("survey.multipleAllowed")}</p>
      )}

      {!canRespond && !alreadyResponded && !submitted && !editMode && (
        <div className={styles.respondedBox}>
          <p>{isExpired ? t("survey.expiredErr") : t("survey.notActiveErr")}</p>
        </div>
      )}

      {/* 응답 폼 */}
      {(canRespond || editMode) && (
        <form onSubmit={handleSubmit} className={styles.respondForm}>
          {editMode && (
            <div className={styles.editModeBanner}>
              ✏️ {t("survey.editingResponse")}
              <button type="button" className={styles.cancelEditBtn} onClick={() => setEditMode(false)}>
                {t("common.cancel")}
              </button>
            </div>
          )}

          {visibleQuestions.map(({ q, label, indent }) => (
            <QuestionBlock
              key={q.id}
              q={q}
              label={label}
              indent={indent}
              answers={answers}
              setAnswer={setAnswer}
              toggleOption={toggleOption}
              toggleOther={toggleOther}
            />
          ))}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting
              ? t("common.loading")
              : editMode ? t("survey.updateResponse") : t("survey.submit")}
          </button>
        </form>
      )}
    </div>
  );
}
