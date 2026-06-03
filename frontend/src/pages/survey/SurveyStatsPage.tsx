import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from "recharts";
import { surveyApi, type Survey } from "../../api/survey.api";
import styles from "./SurveyPage.module.css";
import sStyles from "../stats/StatsPage.module.css";

type ViewMode = "chart" | "table";

const COLORS = [
  "#4f46e5","#7c3aed","#db2777","#ea580c",
  "#ca8a04","#16a34a","#0891b2","#6366f1",
];

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
  const [viewMode,  setViewMode]  = useState<ViewMode>("chart");

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

    for (const q of questions) {
      lines.push(esc(`${q.title}  [${t(`survey.type_${q.type}`)}]`));
      if (q.type === "single" || q.type === "multiple") {
        lines.push([esc(t("survey.option")), esc(t("stats.submitted")), esc("%")].join(","));
        for (const opt of q.options ?? []) {
          const pct = total > 0 ? ((opt.count / total) * 100).toFixed(1) : "0.0";
          lines.push([esc(opt.label), opt.count, `${pct}%`].join(","));
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
    }

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
          <button
            className={styles.viewToggleBtn}
            onClick={() => setViewMode((m) => m === "chart" ? "table" : "chart")}
          >
            {viewMode === "chart" ? t("survey.viewTable") : t("survey.viewChart")}
          </button>
          <button className={sStyles.downloadBtn} onClick={downloadCSV}>
            ⬇ {t("survey.downloadCsv")}
          </button>
        </div>
      </div>

      {/* 문항별 통계 */}
      <div className={styles.statsList}>
        {questions.map((q: any, qi: number) => (
          <div key={q.id} className={sStyles.chartCard}>
            <div className={styles.statQLabel}>
              <span className={styles.questionNum}>{qi + 1}.</span>
              {q.title}
              <span className={styles.typeTag}>{t(`survey.type_${q.type}`)}</span>
            </div>
            {q.description && (
              <p className={styles.questionDesc} style={{ marginBottom: 12 }}>{q.description}</p>
            )}

            {/* 단일/복수 선택 */}
            {(q.type === "single" || q.type === "multiple") && (
              viewMode === "chart" ? (
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height={Math.max(160, (q.options ?? []).length * 46)}>
                    <BarChart
                      data={(q.options ?? []).map((opt: any) => ({
                        name: opt.label,
                        count: Number(opt.count),
                        pct: total > 0 ? Math.round((opt.count / total) * 100) : 0,
                      }))}
                      layout="vertical"
                      margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
                    >
                      <XAxis type="number" domain={[0, total || 1]} hide />
                      <YAxis type="category" dataKey="name" width={160}
                        tick={{ fontSize: 13, fill: "var(--text-primary)" }} />
                      <Tooltip
                        formatter={(v: any, _: any, props: any) =>
                          [`${v}명 (${props.payload.pct}%)`, t("stats.submitted")]
                        }
                        contentStyle={{
                          background: "var(--bg-panel)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {(q.options ?? []).map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                        <LabelList
                          dataKey="pct"
                          position="right"
                          formatter={(v: any) => `${v}%`}
                          style={{ fontSize: 12, fill: "var(--text-secondary)" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
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
              )
            )}

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
              <div>
                <div className={styles.ratingStats}>
                  <span className={styles.avgRating}>
                    ⭐ {t("survey.avgRating")}: {Number(q.rating_stats.avg_rating ?? 0).toFixed(1)} / 5
                  </span>
                  <span className={styles.ratingCount}>({q.rating_stats.count}명)</span>
                </div>
                {viewMode === "chart" && q.rating_distribution?.length > 0 && (
                  <div className={styles.chartWrap}>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart
                        data={[1,2,3,4,5].map((r) => {
                          const found = (q.rating_distribution as any[]).find((d: any) => d.rating === r);
                          return { name: `${r}점`, count: found ? Number(found.count) : 0 };
                        })}
                        margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
                      >
                        <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(v: any) => [`${v}명`, t("stats.submitted")]}
                          contentStyle={{
                            background: "var(--bg-panel)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
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
