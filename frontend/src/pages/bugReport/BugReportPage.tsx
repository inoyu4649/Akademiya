import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { bugReportApi, type BugReport } from "../../api/bugReport.api";
import styles from "./BugReportPage.module.css";

function parseUA(ua: string) {
  // Browser
  let browser = "Unknown";
  if (ua.includes("Edg/"))         browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Firefox/"))browser = "Firefox";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";

  // OS
  let os = "Unknown";
  if (ua.includes("Windows NT"))         os = "Windows";
  else if (ua.includes("Mac OS X"))       os = "macOS";
  else if (ua.includes("Linux"))          os = "Linux";
  else if (/Android/.test(ua))            os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua))   os = "iOS";

  return { browser, os };
}

const STATUS_LABEL: Record<string, string> = {
  open:        "bugReport.status.open",
  in_progress: "bugReport.status.inProgress",
  closed:      "bugReport.status.closed",
};
const STATUS_CLASS: Record<string, string> = {
  open:        "badgeOpen",
  in_progress: "badgeInProgress",
  closed:      "badgeClosed",
};

export default function BugReportPage() {
  const { t } = useTranslation();

  const [tab,      setTab]     = useState<"submit" | "my">("submit");
  const [title,    setTitle]   = useState("");
  const [body,     setBody]    = useState("");
  const [loading,  setLoading] = useState(false);
  const [toast,    setToast]   = useState("");
  const [myReports, setMyReports] = useState<BugReport[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);

  const { browser, os } = parseUA(navigator.userAgent);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) {
      showToast(t("bugReport.missingFields"));
      return;
    }
    setLoading(true);
    try {
      await bugReportApi.submit({ title: title.trim(), body: body.trim(), browser, os });
      showToast(t("bugReport.success"));
      setTitle("");
      setBody("");
      // 제출 후 내 목록 새로고침
      loadMyReports();
    } catch {
      showToast(t("bugReport.serverError"));
    } finally {
      setLoading(false);
    }
  }

  function loadMyReports() {
    setLoadingMy(true);
    bugReportApi.myReports()
      .then((d) => setMyReports(d.reports))
      .catch(() => {})
      .finally(() => setLoadingMy(false));
  }

  useEffect(() => {
    if (tab === "my") loadMyReports();
  }, [tab]);

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <h1 className={styles.pageTitle}>{t("bugReport.title")}</h1>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "submit" ? styles.tabActive : ""}`}
          onClick={() => setTab("submit")}
        >
          {t("bugReport.tabSubmit")}
        </button>
        <button
          className={`${styles.tab} ${tab === "my" ? styles.tabActive : ""}`}
          onClick={() => setTab("my")}
        >
          {t("bugReport.tabMy")}
        </button>
      </div>

      {tab === "submit" && (
        <div className={styles.formCard}>
          <p className={styles.desc}>{t("bugReport.description")}</p>

          {/* Auto-detected info */}
          <div className={styles.envRow}>
            <span className={styles.envBadge}>{browser}</span>
            <span className={styles.envBadge}>{os}</span>
          </div>

          <label className={styles.label}>{t("bugReport.titleLabel")}</label>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("bugReport.titlePlaceholder")}
            maxLength={300}
          />

          <label className={styles.label}>{t("bugReport.bodyLabel")}</label>
          <textarea
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("bugReport.bodyPlaceholder")}
            rows={6}
          />

          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? t("common.loading") : t("bugReport.submitBtn")}
          </button>
        </div>
      )}

      {tab === "my" && (
        <div className={styles.listSection}>
          {loadingMy ? (
            <p className={styles.empty}>{t("common.loading")}</p>
          ) : myReports.length === 0 ? (
            <p className={styles.empty}>{t("bugReport.noReports")}</p>
          ) : (
            myReports.map((r) => (
              <div key={r.id} className={styles.reportCard}>
                <div className={styles.reportTop}>
                  <span className={styles.reportTitle}>{r.title}</span>
                  <span className={`${styles.badge} ${styles[STATUS_CLASS[r.status]]}`}>
                    {t(STATUS_LABEL[r.status])}
                  </span>
                </div>
                <div className={styles.reportDate}>
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
                {r.admin_note && (
                  <div className={styles.adminNote}>
                    <span className={styles.adminNoteLabel}>{t("bugReport.adminNote")}:</span>
                    {" "}{r.admin_note}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
