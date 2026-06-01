import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { statsApi, type ClassStats } from "../../api/stats.api";
import styles from "./StatsPage.module.css";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClassStatsPage() {
  const { t }       = useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const navigate    = useNavigate();
  const id          = Number(classId);

  const [data,    setData]    = useState<ClassStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) { navigate("/"); return; }
    statsApi.classStats(id)
      .then(setData)
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDownload() {
    if (!data) return;
    setDownloading(true);
    try {
      const blob = await statsApi.downloadClassCsv(id);
      const cls  = data.class.name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
      downloadBlob(blob, `stats_${cls}_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;
  if (error)   return <div className={styles.loading}>{error}</div>;
  if (!data)   return null;

  // recharts data
  const chartData = data.assignments.map((a) => ({
    name:          a.title.length > 14 ? a.title.slice(0, 12) + "…" : a.title,
    [t("stats.approved")]:     a.approved,
    [t("stats.returned")]:     a.returned,
    [t("stats.submitted")]:    a.submitted,
    [t("stats.notSubmitted")]: a.not_submitted,
  }));

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>← {t("common.back")}</button>

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{data.class.name} — {t("stats.classTitle")}</h1>
        <div className={styles.headerRight}>
          <span className={styles.membersBadge}>{t("stats.members", { count: data.totalMembers })}</span>
          {data.canDownload && (
            <button className={styles.downloadBtn} onClick={handleDownload} disabled={downloading}>
              {downloading ? t("common.loading") : `⬇ ${t("stats.downloadCsv")}`}
            </button>
          )}
        </div>
      </div>

      {data.assignments.length === 0 ? (
        <p className={styles.empty}>{t("stats.noAssignments")}</p>
      ) : (
        <>
          {/* Chart */}
          <div className={styles.chartCard}>
            <h2 className={styles.sectionTitle}>{t("stats.submissionChart")}</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-secondary)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey={t("stats.approved")}     stackId="a" fill="#4CAF50" />
                <Bar dataKey={t("stats.returned")}     stackId="a" fill="#FF9800" />
                <Bar dataKey={t("stats.submitted")}    stackId="a" fill="#2196F3" />
                <Bar dataKey={t("stats.notSubmitted")} stackId="a" fill="#616161" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className={styles.tableCard}>
            <h2 className={styles.sectionTitle}>{t("stats.detailTable")}</h2>
            <div className={styles.table}>
              <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                <span>{t("stats.assignment")}</span>
                <span>{t("stats.approved")}</span>
                <span>{t("stats.returned")}</span>
                <span>{t("stats.submitted")}</span>
                <span>{t("stats.notSubmitted")}</span>
                <span>{t("stats.rate")}</span>
              </div>
              {data.assignments.map((a) => (
                <div key={a.id} className={styles.tableRow}>
                  <span className={styles.assignName}>{a.title}</span>
                  <span className={styles.numGreen}>{a.approved}</span>
                  <span className={styles.numOrange}>{a.returned}</span>
                  <span className={styles.numBlue}>{a.submitted}</span>
                  <span className={styles.numGrey}>{a.not_submitted}</span>
                  <span className={styles.rate}>{a.submission_rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
