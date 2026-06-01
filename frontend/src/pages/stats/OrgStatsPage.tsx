import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { statsApi, type OrgStats } from "../../api/stats.api";
import styles from "./StatsPage.module.css";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OrgStatsPage() {
  const { t }    = useTranslation();
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orgId    = Number(id);

  const [data,    setData]    = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!orgId) { navigate("/"); return; }
    statsApi.orgStats(orgId)
      .then(setData)
      .catch(() => setError(t("common.error")))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleDownload() {
    if (!data) return;
    setDownloading(true);
    try {
      const blob    = await statsApi.downloadOrgCsv(orgId);
      const orgName = data.org.name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
      downloadBlob(blob, `org_stats_${orgName}_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;
  if (error)   return <div className={styles.loading}>{error}</div>;
  if (!data)   return null;

  const chartData = data.classes.map((c) => ({
    name: c.name.length > 12 ? c.name.slice(0, 10) + "…" : c.name,
    [t("stats.rate")]: c.submission_rate,
  }));

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(-1)}>← {t("common.back")}</button>

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{data.org.name} — {t("stats.orgTitle")}</h1>
        {data.canDownload && (
          <button className={styles.downloadBtn} onClick={handleDownload} disabled={downloading}>
            {downloading ? t("common.loading") : `⬇ ${t("stats.downloadCsv")}`}
          </button>
        )}
      </div>

      {data.classes.length === 0 ? (
        <p className={styles.empty}>{t("stats.noClasses")}</p>
      ) : (
        <>
          {/* Chart */}
          <div className={styles.chartCard}>
            <h2 className={styles.sectionTitle}>{t("stats.submissionRateChart")}</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <Tooltip
                  formatter={(v) => [`${v}%`, t("stats.rate")]}
                  contentStyle={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey={t("stats.rate")} fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <div className={styles.tableCard}>
            <h2 className={styles.sectionTitle}>{t("stats.detailTable")}</h2>
            <div className={styles.table}>
              <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                <span>{t("stats.className")}</span>
                <span>{t("stats.members", { count: "" }).replace(" ", "")}</span>
                <span>{t("stats.totalAssignments")}</span>
                <span>{t("stats.rate")}</span>
              </div>
              {data.classes.map((c) => (
                <div key={c.id} className={styles.tableRow}>
                  <span className={styles.assignName}>{c.name}</span>
                  <span className={styles.numBlue}>{c.member_count}</span>
                  <span className={styles.numBlue}>{c.total_assignments}</span>
                  <span className={styles.rate}>{c.submission_rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
