import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi, type Survey, type SurveyQuestion } from "../../api/survey.api";
import styles from "./SurveyPage.module.css";

export default function SurveyStatsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const surveyId = Number(id);

  const [survey,    setSurvey]    = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [total,     setTotal]     = useState(0);
  const [viewers,   setViewers]   = useState<Array<{ id: number; display_name: string; email: string }>>([]);
  const [loading,   setLoading]   = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [addEmail,  setAddEmail]  = useState("");
  const [toast,     setToast]     = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => {
    Promise.all([
      surveyApi.stats(surveyId),
      surveyApi.detail(surveyId),
    ])
      .then(([statsData, detailData]) => {
        setSurvey(statsData.survey);
        setQuestions(statsData.questions as SurveyQuestion[]);
        setTotal(Number(statsData.totalResponses));
        setViewers(statsData.statViewers);
        setIsCreator(detailData.isCreator);
      })
      .catch(() => navigate(`/surveys/${surveyId}`))
      .finally(() => setLoading(false));
  }, [surveyId]);

  async function handleAddViewer() {
    if (!addEmail.trim()) return;
    try {
      await surveyApi.addViewer(surveyId, addEmail.trim());
      showToast(t("survey.viewerAdded"));
      setAddEmail("");
      // 새로고침
      const res = await surveyApi.stats(surveyId);
      setViewers(res.statViewers);
    } catch (err: any) {
      const code = err?.response?.data?.error ?? "";
      if (code === "survey.userNotFound") showToast(t("survey.userNotFound"));
      else showToast(t("common.error"));
    }
  }

  async function handleRemoveViewer(uid: number) {
    try {
      await surveyApi.removeViewer(surveyId, uid);
      setViewers((prev) => prev.filter((v) => v.id !== uid));
      showToast(t("survey.viewerRemoved"));
    } catch {
      showToast(t("common.error"));
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.empty}>{t("common.loading")}</p></div>;
  if (!survey) return null;

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <button className={styles.backBtn} onClick={() => navigate(`/surveys/${surveyId}`)}>
        ← {t("common.back")}
      </button>
      <h1 className={styles.pageTitle}>{t("survey.statsTitle")}</h1>
      <p className={styles.surveyDesc}>{survey.title}</p>
      <p className={styles.totalCount}>{t("survey.totalResponses", { count: total })}</p>

      {/* 문항별 통계 */}
      <div className={styles.statsList}>
        {(questions as any[]).map((q: any, qi: number) => (
          <div key={q.id} className={styles.statCard}>
            <div className={styles.statQLabel}>
              {qi + 1}. {q.title}
              <span className={styles.typeTag}>{t(`survey.type_${q.type}`)}</span>
            </div>

            {/* 단일/복수 선택 */}
            {(q.type === "single" || q.type === "multiple") && (
              <div className={styles.optionStats}>
                {(q.options ?? []).map((opt: any) => {
                  const pct = total > 0 ? Math.round((opt.count / total) * 100) : 0;
                  return (
                    <div key={opt.id} className={styles.optionStat}>
                      <div className={styles.optionStatHeader}>
                        <span className={styles.optionLabel}>{opt.label}</span>
                        <span className={styles.optionCount}>{opt.count}명 ({pct}%)</span>
                      </div>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 텍스트 */}
            {q.type === "text" && (
              <div className={styles.textAnswers}>
                {(q.text_answers ?? []).length === 0 ? (
                  <p className={styles.empty}>{t("survey.noTextAnswers")}</p>
                ) : (
                  (q.text_answers as string[]).map((ans, i) => (
                    <div key={i} className={styles.textAnswer}>{ans}</div>
                  ))
                )}
              </div>
            )}

            {/* 평점 */}
            {q.type === "rating" && q.rating_stats && (
              <div className={styles.ratingStats}>
                <span className={styles.avgRating}>
                  {t("survey.avgRating")}: {Number(q.rating_stats.avg_rating ?? 0).toFixed(1)} / 5
                </span>
                <span className={styles.ratingCount}>({q.rating_stats.count}명 응답)</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 통계 조회 권한 관리 (creator only) */}
      {isCreator && (
        <div className={styles.viewerSection}>
          <h2 className={styles.sectionTitle}>{t("survey.statViewers")}</h2>
          <div className={styles.addViewerRow}>
            <input
              className={styles.input}
              placeholder={t("survey.addViewerPlaceholder")}
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddViewer())}
            />
            <button className={styles.addViewerBtn} onClick={handleAddViewer}>
              {t("survey.addViewer")}
            </button>
          </div>
          {viewers.length === 0 ? (
            <p className={styles.empty}>{t("survey.noViewers")}</p>
          ) : (
            <div className={styles.viewerList}>
              {viewers.map((v) => (
                <div key={v.id} className={styles.viewerRow}>
                  <span>{v.display_name} ({v.email})</span>
                  <button
                    className={styles.removeViewerBtn}
                    onClick={() => handleRemoveViewer(v.id)}
                  >
                    {t("survey.removeViewer")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
