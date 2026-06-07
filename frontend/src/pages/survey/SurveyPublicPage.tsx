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
      if (!multi) {
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
        const { other_text, ...rest } = cur;
        return { ...prev, [qId]: rest };
      }
      if (isSingle) {
        const { option_ids, ...rest } = cur ?? { question_id: qId };
        return { ...prev, [qId]: { ...rest, question_id: qId, option_ids: [], other_text: "" } };
      }
      return { ...prev, [qId]: { ...cur, question_id: qId, other_text: "" } };
    });
  }

  /** 현재 answers 기준으로 표시해야 할 질문 목록 (부속 포함) */
  function getVisibleQuestions(): Array<{ q: SurveyQuestion; label: string; indent: boolean }> {
    const result: Array<{ q: SurveyQuestion; label: string; indent: boolean }> = [];
    questions.forEach((q, qi) => {
      result.push({ q, label: `${qi + 1}`, indent: false });
      (q.children ?? []).forEach((sq, sqi) => {
        let show: boolean;
        if (sq.trigger_option_id != null) {
          show = (answers[q.id]?.option_ids ?? []).includes(sq.trigger_option_id);
        } else if (sq.trigger_rating_min != null || sq.trigger_rating_max != null) {
          const rating = Number(answers[q.id]?.text_answer ?? 0);
          if (!rating) {
            show = false;
          } else {
            const meetsMin = sq.trigger_rating_min == null || rating >= sq.trigger_rating_min;
            const meetsMax = sq.trigger_rating_max == null || rating <= sq.trigger_rating_max;
            show = meetsMin && meetsMax;
          }
        } else {
          show = true;
        }
        if (show) result.push({ q: sq, label: `${qi + 1}-${sqi + 1}`, indent: true });
      });
    });
    return result;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const visible = getVisibleQuestions();
    // "기타" 텍스트 검증
    for (const { q } of visible) {
      if (q.type !== "single" && q.type !== "multiple") continue;
      if (!q.has_other) continue;
      const ans = answers[q.id];
      if (ans?.other_text !== undefined && !ans.other_text.trim()) {
        showToast(t("survey.otherTextRequired")); return;
      }
    }
    for (const { q } of visible) {
      if (!q.required) continue;
      const ans = answers[q.id];
      if (q.type === "text" || q.type === "rating") {
        if (!ans?.text_answer?.trim()) {
          showToast(t("survey.requiredFieldMissing", { title: q.title }));
          return;
        }
      } else {
        const hasOption = (ans?.option_ids?.length ?? 0) > 0;
        const otherFilled = !!q.has_other && !!ans?.other_text?.trim();
        if (!hasOption && !otherFilled) {
          showToast(t("survey.requiredFieldMissing", { title: q.title }));
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      await surveyApi.publicRespond(surveyId, Object.values(answers));
      if (!survey?.allow_multiple) localStorage.setItem(storageKey, "1");
      setSubmitted(true);
      setAnswers({});
      showToast(t("survey.submitSuccess"));
    } catch (err: any) {
      const code = err?.response?.data?.error ?? "";
      if (code === "survey.expired") showToast(t("survey.expiredErr"));
      else                           showToast(t("common.error"));
    } finally {
      setSubmitting(false);
    }
  }

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
  const canRespond = !alreadyResponded && !isExpired &&
    (!submitted || !!survey.allow_multiple);

  const visibleQuestions = getVisibleQuestions();

  return (
    <div className={styles.publicWrapper}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <div className={styles.publicCard}>
        <div className={styles.publicBrand}>
          <img src="/logo.png" alt="Akademiya" className={styles.publicBrandImg} />
          <span className={styles.publicBrandSub}>Survey</span>
        </div>

        <div className={styles.surveyHeader}>
          <div className={styles.surveyMeta}>
            <span className={`${styles.scopeBadge} ${styles.scope_public}`}>
              {t("survey.scopePublic")}
            </span>
            {isExpired && <span className={styles.expiredBadge}>{t("survey.expired")}</span>}
            {(alreadyResponded || submitted) && (
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
        </div>

        {(alreadyResponded || submitted) && (
          <div className={styles.respondedBox}>
            <span>✓</span>
            <p>{t("survey.alreadyRespondedMsg")}</p>
          </div>
        )}

        {!alreadyResponded && !submitted && isExpired && (
          <div className={styles.respondedBox}>
            <p>{t("survey.expiredErr")}</p>
          </div>
        )}

        {canRespond && (
          <form onSubmit={handleSubmit} className={styles.respondForm}>
            {visibleQuestions.map(({ q, label, indent }) => (
              <div key={q.id} className={`${styles.questionBlock} ${indent ? styles.questionBlockIndent : ""}`}>
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
                            checked={answers[q.id]?.other_text !== undefined}
                            onChange={() => toggleOther(q.id, true)}
                          />
                          {t("survey.otherOption")}
                        </label>
                        {answers[q.id]?.other_text !== undefined && (
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
                            checked={answers[q.id]?.other_text !== undefined}
                            onChange={() => toggleOther(q.id, false)}
                          />
                          {t("survey.otherOption")}
                        </label>
                        {answers[q.id]?.other_text !== undefined && (
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
            ))}

            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? t("common.loading") : t("survey.submit")}
            </button>
          </form>
        )}

        <div className={styles.publicFooter}>
          Powered by <strong>Akademiya</strong>
          <p className={styles.publicDisclaimer}>{t("survey.publicDisclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
