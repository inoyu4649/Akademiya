import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi, type Survey, type SurveyQuestion, type SurveyAnswer } from "../../api/survey.api";
import styles from "./SurveyPage.module.css";

export default function SurveyDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const surveyId = Number(id);

  const [survey,    setSurvey]    = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [alreadyResponded, setAlreadyResponded] = useState(false);
  const [canStats, setCanStats]   = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [loading,  setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast]         = useState("");

  // 응답 상태 (question_id → 선택지 or 텍스트)
  const [answers, setAnswers] = useState<Record<number, SurveyAnswer>>({});

  useEffect(() => {
    surveyApi.detail(surveyId)
      .then(({ survey: s, questions: qs, alreadyResponded: ar, canViewStats: cs, isCreator: ic }) => {
        setSurvey(s);
        setQuestions(qs);
        setAlreadyResponded(ar);
        setCanStats(cs);
        setIsCreator(ic);
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
      const cur = prev[qId]?.option_ids ?? [];
      let next: number[];
      if (multi) {
        next = cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId];
      } else {
        next = [optId];
      }
      return { ...prev, [qId]: { question_id: qId, option_ids: next } };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 필수 문항 확인
    for (const q of questions) {
      if (!q.required) continue;
      const ans = answers[q.id];
      if (q.type === "text" || q.type === "rating") {
        if (!ans?.text_answer?.trim()) {
          showToast(t("survey.requiredFieldMissing", { title: q.title }));
          return;
        }
      } else {
        if (!ans?.option_ids?.length) {
          showToast(t("survey.requiredFieldMissing", { title: q.title }));
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      await surveyApi.respond(surveyId, Object.values(answers));
      setSubmitted(true);
      setAlreadyResponded(true);
      showToast(t("survey.submitSuccess"));
    } catch (err: any) {
      const code = err?.response?.data?.error ?? "";
      if (code === "survey.alreadyResponded") showToast(t("survey.alreadyRespondedErr"));
      else if (code === "survey.expired")     showToast(t("survey.expiredErr"));
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
    } catch {
      showToast(t("common.error"));
    }
  }

  async function handleDelete() {
    if (!confirm(t("survey.confirmDelete"))) return;
    try {
      await surveyApi.delete(surveyId);
      navigate("/surveys");
    } catch {
      showToast(t("common.error"));
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.empty}>{t("common.loading")}</p></div>;
  if (!survey) return null;

  const isExpired = survey.expires_at && new Date(survey.expires_at) < new Date();
  const canRespond = !alreadyResponded && survey.is_active && !isExpired && !submitted;

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
          {isExpired     && <span className={styles.expiredBadge}>{t("survey.expired")}</span>}
          {(alreadyResponded || submitted) && <span className={styles.respondedBadge}>{t("survey.responded")}</span>}
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
            <button
              className={styles.toggleBtn}
              onClick={handleToggleActive}
            >
              {survey.is_active ? t("survey.deactivate") : t("survey.activate")}
            </button>
            <button className={styles.deleteBtn} onClick={handleDelete}>
              {t("survey.delete")}
            </button>
            {/* 공개 URL 복사 */}
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

        {/* 통계 조회 권한 있는 경우 */}
        {!isCreator && canStats && (
          <button className={styles.statsBtn} onClick={() => navigate(`/surveys/${surveyId}/stats`)}>
            📊 {t("survey.viewStats")}
          </button>
        )}
      </div>

      {/* 이미 응답했거나 비활성화된 경우 */}
      {(alreadyResponded || submitted) && (
        <div className={styles.respondedBox}>
          <span>✓</span>
          <p>{t("survey.alreadyRespondedMsg")}</p>
        </div>
      )}

      {!canRespond && !alreadyResponded && !submitted && (
        <div className={styles.respondedBox}>
          <p>{isExpired ? t("survey.expiredErr") : t("survey.notActiveErr")}</p>
        </div>
      )}

      {/* 응답 폼 */}
      {canRespond && (
        <form onSubmit={handleSubmit} className={styles.respondForm}>
          {questions.map((q, qi) => (
            <div key={q.id} className={styles.questionBlock}>
              <div className={styles.questionLabel}>
                <span className={styles.questionNum}>{qi + 1}.</span>
                {q.title}
                {q.required === 1 && <span className={styles.requiredMark}>*</span>}
              </div>

              {/* 단일 선택 */}
              {q.type === "single" && q.options?.map((opt) => (
                <label key={opt.id} className={styles.optLabel}>
                  <input
                    type="radio"
                    name={`q${q.id}`}
                    checked={(answers[q.id]?.option_ids ?? []).includes(opt.id)}
                    onChange={() => toggleOption(q.id, opt.id, false)}
                  />
                  {opt.label}
                </label>
              ))}

              {/* 복수 선택 */}
              {q.type === "multiple" && q.options?.map((opt) => (
                <label key={opt.id} className={styles.optLabel}>
                  <input
                    type="checkbox"
                    checked={(answers[q.id]?.option_ids ?? []).includes(opt.id)}
                    onChange={() => toggleOption(q.id, opt.id, true)}
                  />
                  {opt.label}
                </label>
              ))}

              {/* 단답형 텍스트 */}
              {q.type === "text" && (
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={answers[q.id]?.text_answer ?? ""}
                  onChange={(e) => setAnswer(q.id, { text_answer: e.target.value })}
                  placeholder={t("survey.textAnswerPlaceholder")}
                />
              )}

              {/* 평점 */}
              {q.type === "rating" && (
                <div className={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`${styles.ratingBtn} ${answers[q.id]?.text_answer === String(n) ? styles.ratingBtnActive : ""}`}
                      onClick={() => setAnswer(q.id, { text_answer: String(n) })}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? t("common.loading") : t("survey.submit")}
          </button>
        </form>
      )}
    </div>
  );
}
