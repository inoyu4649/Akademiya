import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi, type Survey, type SurveyQuestion, type SurveyAnswer } from "../../api/survey.api";
import styles from "./SurveyPage.module.css";

export default function SurveyPublicPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const surveyId = Number(id);

  const [survey,    setSurvey]    = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [toast,      setToast]      = useState("");
  const [answers,    setAnswers]    = useState<Record<number, SurveyAnswer>>({});

  // localStorage로 중복 제출 방지 (allow_multiple=1이면 무시)
  const storageKey = `akademiya_survey_${surveyId}_responded`;
  const alreadyResponded =
    !survey?.allow_multiple && localStorage.getItem(storageKey) === "1";

  useEffect(() => {
    surveyApi
      .publicDetail(surveyId)
      .then(({ survey: s, questions: qs }) => {
        setSurvey(s);
        setQuestions(qs);
      })
      .catch(() => setNotFound(true))
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
      return { ...prev, [qId]: { question_id: qId, option_ids: next } };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 필수 문항 검사
    for (const q of questions) {
      if (!q.required) continue;
      const ans = answers[q.id];
      if (q.type === "text" || q.type === "rating") {
        if (!ans?.text_answer?.trim()) {
          showToast(t("survey.requiredFieldMissing", { title: q.title }));
          return;
        }
      } else if (!ans?.option_ids?.length) {
        showToast(t("survey.requiredFieldMissing", { title: q.title }));
        return;
      }
    }

    setSubmitting(true);
    try {
      await surveyApi.publicRespond(surveyId, Object.values(answers));
      // allow_multiple이면 localStorage 저장 안 함 (계속 응답 가능)
      if (!survey?.allow_multiple) localStorage.setItem(storageKey, "1");
      setSubmitted(true);
      setAnswers({});   // 복수 응답 시 폼 초기화
      showToast(t("survey.submitSuccess"));
    } catch (err: any) {
      const code = err?.response?.data?.error ?? "";
      if (code === "survey.expired") showToast(t("survey.expiredErr"));
      else                           showToast(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

  /* ── 로딩 / 404 ── */
  if (loading) {
    return (
      <div className={styles.publicWrapper}>
        <p className={styles.empty}>{t("common.loading")}</p>
      </div>
    );
  }
  if (notFound || !survey) {
    return (
      <div className={styles.publicWrapper}>
        <div className={styles.publicCard}>
          <p className={styles.empty}>{t("survey.notFound")}</p>
        </div>
      </div>
    );
  }

  const isExpired  = !!survey.expires_at && new Date(survey.expires_at) < new Date();
  // allow_multiple이면 제출 후에도 폼 다시 표시
  const canRespond = !alreadyResponded && !isExpired &&
    (!submitted || !!survey.allow_multiple);

  return (
    <div className={styles.publicWrapper}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.publicCard}>
        {/* 브랜드 헤더 */}
        <div className={styles.publicBrand}>
          <img src="/logo.png" alt="Akademiya" className={styles.publicBrandImg} />
          <span className={styles.publicBrandSub}>Survey</span>
        </div>

        {/* 설문 헤더 */}
        <div className={styles.surveyHeader}>
          <div className={styles.surveyMeta}>
            <span className={`${styles.scopeBadge} ${styles.scope_public}`}>
              {t("survey.scopePublic")}
            </span>
            {isExpired && (
              <span className={styles.expiredBadge}>{t("survey.expired")}</span>
            )}
            {(alreadyResponded || submitted) && (
              <span className={styles.respondedBadge}>{t("survey.responded")}</span>
            )}
          </div>
          <h1 className={styles.pageTitle}>{survey.title}</h1>
          {survey.description && (
            <p className={styles.surveyDesc}>{survey.description}</p>
          )}
          <div className={styles.surveyInfo}>
            <span>{t("survey.by")}: {survey.creator_name}</span>
            {survey.expires_at && (
              <span>
                · {t("survey.expiresAt")}:{" "}
                {new Date(survey.expires_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* 이미 응답 */}
        {(alreadyResponded || submitted) && (
          <div className={styles.respondedBox}>
            <span>✓</span>
            <p>{t("survey.alreadyRespondedMsg")}</p>
          </div>
        )}

        {/* 만료됨 */}
        {!alreadyResponded && !submitted && isExpired && (
          <div className={styles.respondedBox}>
            <p>{t("survey.expiredErr")}</p>
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
                  {q.required === 1 && (
                    <span className={styles.requiredMark}>*</span>
                  )}
                </div>
                {q.description && (
                  <p className={styles.questionDesc}>{q.description}</p>
                )}

                {/* 단일 선택 */}
                {q.type === "single" &&
                  q.options?.map((opt) => (
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
                {q.type === "multiple" &&
                  q.options?.map((opt) => (
                    <label key={opt.id} className={styles.optLabel}>
                      <input
                        type="checkbox"
                        checked={(answers[q.id]?.option_ids ?? []).includes(opt.id)}
                        onChange={() => toggleOption(q.id, opt.id, true)}
                      />
                      {opt.label}
                    </label>
                  ))}

                {/* 단답형 */}
                {q.type === "text" && (
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={answers[q.id]?.text_answer ?? ""}
                    onChange={(e) =>
                      setAnswer(q.id, { text_answer: e.target.value })
                    }
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
                        className={`${styles.ratingBtn} ${
                          answers[q.id]?.text_answer === String(n)
                            ? styles.ratingBtnActive
                            : ""
                        }`}
                        onClick={() =>
                          setAnswer(q.id, { text_answer: String(n) })
                        }
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={submitting}
            >
              {submitting ? t("common.loading") : t("survey.submit")}
            </button>
          </form>
        )}

        <div className={styles.publicFooter}>
          Powered by <strong>Akademiya</strong>
        </div>
      </div>
    </div>
  );
}
