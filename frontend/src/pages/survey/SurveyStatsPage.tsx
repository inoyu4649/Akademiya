import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi, type Survey } from "../../api/survey.api";
import styles from "./SurveyPage.module.css";
import sStyles from "../stats/StatsPage.module.css";

/** 단일 문항 통계 렌더링 */
function QuestionStats({
  q, label, total, t, indent,
}: {
  q: any;
  label: string;
  total: number;
  t: (key: string, opts?: any) => string;
  indent?: boolean;
}) {
  return (
    <div className={`${sStyles.chartCard} ${indent ? styles.statCardIndent : ""}`}>
      <div className={styles.statQLabel}>
        <span className={styles.questionNum}>{label}.</span>
        {q.title}
        <span className={styles.typeTag}>{t(`survey.type_${q.type}`)}</span>
      </div>
      {q.description && (
        <p className={styles.questionDesc} style={{ marginBottom: 12 }}>{q.description}</p>
      )}

      {/* 단일/복수 선택 */}
      {(q.type === "single" || q.type === "multiple") && (() => {
        const rows = [
          ...(q.options ?? []).map((opt: any) => ({
            name: opt.label,
            count: Number(opt.count),
            pct: total > 0 ? Math.round((Number(opt.count) / total) * 100) : 0,
            isOther: false,
          })),
          ...(q.has_other ? [{
            name: t("survey.otherOption"),
            count: Number(q.other_count ?? 0),
            pct: total > 0 ? Math.round((Number(q.other_count ?? 0) / total) * 100) : 0,
            isOther: true,
          }] : []),
        ];
        return (
          <>
            <div className={styles.optionStats}>
              {rows.map((opt: any, i: number) => (
                <div key={opt.isOther ? "other" : i} className={styles.optionStat}>
                  <div className={styles.optionStatHeader}>
                    <span className={styles.optionLabel}>{opt.name}</span>
                    <span className={styles.optionCount}>{opt.count}명 ({opt.pct}%)</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{ width: `${opt.pct}%`, background: opt.isOther ? "#9ca3af" : undefined }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {q.has_other && (q.other_answers ?? []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                  {t("survey.otherOption")}:
                </p>
                <div className={styles.textAnswers}>
                  {(q.other_answers as string[]).map((ans: string, i: number) => (
                    <div key={i} className={styles.textAnswer}>{ans}</div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* 텍스트 */}
      {q.type === "text" && (
        <div className={styles.textAnswers}>
          {(q.text_answers ?? []).length === 0 ? (
            <p className={sStyles.empty}>{t("survey.noTextAnswers")}</p>
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
            ⭐ {t("survey.avgRating")}: {Number(q.rating_stats.avg_rating ?? 0).toFixed(1)} / 5
          </span>
          <span className={styles.ratingCount}>({q.rating_stats.count}명)</span>
        </div>
      )}
    </div>
  );
}

export default function SurveyStatsPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const surveyId = Number(id);

  const [survey,    setSurvey]    = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
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
    Promise.all([surveyApi.stats(surveyId), surveyApi.detail(surveyId)])
      .then(([statsData, detailData]) => {
        setSurvey(statsData.survey);
        setQuestions(statsData.questions as any[]);
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
      const res = await surveyApi.stats(surveyId);
      setViewers(res.statViewers);
    } catch (err: any) {
      const code = err?.response?.data?.error ?? "";
      showToast(code === "survey.userNotFound" ? t("survey.userNotFound") : t("common.error"));
    }
  }

  async function handleRemoveViewer(uid: number) {
    try {
      await surveyApi.removeViewer(surveyId, uid);
      setViewers((prev) => prev.filter((v) => v.id !== uid));
      showToast(t("survey.viewerRemoved"));
    } catch { showToast(t("common.error")); }
  }

  function downloadCSV() {
    if (!survey) return;
    const lines: string[] = [];
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;

    lines.push(esc(survey.title));
    lines.push(esc(t("survey.totalResponses", { count: total })));
    lines.push("");

    const renderQuestion = (q: any, label: string) => {
      lines.push(esc(`${label}. ${q.title}  [${t(`survey.type_${q.type}`)}]`));
      if (q.type === "single" || q.type === "multiple") {
        lines.push([esc(t("survey.option")), esc(t("stats.submitted")), esc("%")].join(","));
        for (const opt of q.options ?? []) {
          const pct = total > 0 ? ((opt.count / total) * 100).toFixed(1) : "0.0";
          lines.push([esc(opt.label), opt.count, `${pct}%`].join(","));
        }
        if (q.has_other) {
          const otherCount = Number(q.other_count ?? 0);
          const pct = total > 0 ? ((otherCount / total) * 100).toFixed(1) : "0.0";
          lines.push([esc(t("survey.otherOption")), otherCount, `${pct}%`].join(","));
          for (const ans of q.other_answers ?? []) lines.push(esc(`  ${ans}`));
        }
      } else if (q.type === "text") {
        lines.push(esc(t("survey.textAnswerPlaceholder")));
        for (const ans of q.text_answers ?? []) lines.push(esc(ans));
      } else if (q.type === "rating") {
        lines.push(`${esc(t("survey.avgRating"))},${Number(q.rating_stats?.avg_rating ?? 0).toFixed(2)}`);
        lines.push(`${esc(t("survey.responseCount", { count: "" })).replace(/ $/, "")},${q.rating_stats?.count ?? 0}`);
        if (q.rating_distribution?.length) {
          lines.push([esc(t("survey.ratingHint")), esc(t("stats.submitted"))].join(","));
          for (const d of q.rating_distribution) lines.push(`${d.rating},${d.count}`);
        }
      }
      lines.push("");
    };

    questions.forEach((q: any, qi: number) => {
      renderQuestion(q, `${qi + 1}`);
      (q.children ?? []).forEach((sq: any, sqi: number) => {
        renderQuestion(sq, `${qi + 1}-${sqi + 1}`);
      });
    });

    const bom  = "﻿";
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${survey.title}_${t("survey.statsTitle")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className={sStyles.loading}><p>{t("common.loading")}</p></div>;
  if (!survey) return null;

  return (
    <div className={sStyles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <button className={sStyles.backBtn} onClick={() => navigate(`/surveys/${surveyId}`)}>
        ← {t("common.back")}
      </button>

      {/* 헤더 */}
      <div className={sStyles.header}>
        <div>
          <h1 className={sStyles.pageTitle}>{t("survey.statsTitle")}</h1>
          <p className={styles.surveyDesc} style={{ marginBottom: 4 }}>{survey.title}</p>
          <p className={styles.totalCount} style={{ marginBottom: 0 }}>
            {t("survey.totalResponses", { count: total })}
          </p>
        </div>
        <div className={sStyles.headerRight}>
          <button className={sStyles.downloadBtn} onClick={downloadCSV}>
            ⬇ {t("survey.downloadCsv")}
          </button>
        </div>
      </div>

      {/* 문항별 통계 */}
      <div className={styles.statsList}>
        {questions.map((q: any, qi: number) => (
          <div key={q.id}>
            <QuestionStats
              q={q}
              label={`${qi + 1}`}
              total={total}
              t={t}
            />
            {/* 부속 질문 통계 */}
            {(q.children ?? []).map((sq: any, sqi: number) => (
              <QuestionStats
                key={sq.id}
                q={sq}
                label={`${qi + 1}-${sqi + 1}`}
                total={total}
                t={t}
                indent
              />
            ))}
          </div>
        ))}
      </div>

      {/* 통계 조회 권한 관리 */}
      {isCreator && (
        <div className={sStyles.tableCard}>
          <h2 className={sStyles.sectionTitle}>{t("survey.statViewers")}</h2>
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
            <p className={sStyles.empty}>{t("survey.noViewers")}</p>
          ) : (
            <div className={styles.viewerList}>
              {viewers.map((v) => (
                <div key={v.id} className={styles.viewerRow}>
                  <span>{v.display_name} ({v.email})</span>
                  <button className={styles.removeViewerBtn} onClick={() => handleRemoveViewer(v.id)}>
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
