import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { adminApi, type PendingOrg } from "../../api/admin.api";
import { bugReportApi, type BugReport } from "../../api/bugReport.api";
import styles from "./AdminPage.module.css";

type Tab = "orgs" | "bugReports";

const STATUS_OPTS = ["open", "in_progress", "closed"] as const;
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

export default function AdminPage() {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const user     = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>("orgs");

  // ── Orgs tab ──
  const [orgs,    setOrgs]    = useState<PendingOrg[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // ── Bug reports tab ──
  const [reports,       setReports]       = useState<BugReport[]>([]);
  const [loadingBugs,   setLoadingBugs]   = useState(false);
  const [bugFilter,     setBugFilter]     = useState<string>("all");
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [editNote,      setEditNote]      = useState<Record<number, string>>({});
  const [editStatus,    setEditStatus]    = useState<Record<number, string>>({});
  const [savingId,      setSavingId]      = useState<number | null>(null);

  const [toast, setToast] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/"); return; }
    adminApi.getOrgs()
      .then((res) => setOrgs(res.data.orgs))
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, [user]);

  useEffect(() => {
    if (tab !== "bugReports") return;
    loadBugReports();
  }, [tab, bugFilter]);

  function loadBugReports() {
    setLoadingBugs(true);
    const status = bugFilter === "all" ? undefined : bugFilter;
    bugReportApi.adminList(status)
      .then((d) => setReports(d.reports))
      .catch(() => {})
      .finally(() => setLoadingBugs(false));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // ── Org handlers ──
  async function handleApprove(id: number) {
    await adminApi.approveOrg(id);
    setOrgs((prev) => prev.filter((o) => o.id !== id));
    showToast(t("admin.orgs.approveSuccess"));
  }

  async function handleReject(id: number) {
    await adminApi.rejectOrg(id);
    setOrgs((prev) => prev.filter((o) => o.id !== id));
    showToast(t("admin.orgs.rejectSuccess"));
  }

  // ── Bug report handlers ──
  async function handleSaveBug(id: number) {
    setSavingId(id);
    try {
      const updates: { status?: string; admin_note?: string } = {};
      if (editStatus[id] !== undefined) updates.status     = editStatus[id];
      if (editNote[id]   !== undefined) updates.admin_note = editNote[id];
      await bugReportApi.adminUpdate(id, updates);
      showToast(t("admin.bugReports.saveSuccess"));
      loadBugReports();
      setExpandedId(null);
      setEditNote((p)   => { const n = { ...p }; delete n[id]; return n; });
      setEditStatus((p) => { const n = { ...p }; delete n[id]; return n; });
    } catch {
      showToast(t("common.error"));
    } finally {
      setSavingId(null);
    }
  }

  if (loadingOrgs) return <div className={styles.loading}>{t("common.loading")}</div>;

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      <h1 className={styles.pageTitle}>{t("admin.title")}</h1>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "orgs" ? styles.tabActive : ""}`}
          onClick={() => setTab("orgs")}
        >
          {t("admin.orgs.title")}
        </button>
        <button
          className={`${styles.tab} ${tab === "bugReports" ? styles.tabActive : ""}`}
          onClick={() => setTab("bugReports")}
        >
          {t("admin.bugReports.title")}
        </button>
      </div>

      {/* ── Orgs tab ── */}
      {tab === "orgs" && (
        <section className={styles.section}>
          {orgs.length === 0 ? (
            <p className={styles.empty}>{t("admin.orgs.noRequests")}</p>
          ) : (
            <div className={styles.list}>
              {orgs.map((org) => (
                <div key={org.id} className={styles.card}>
                  <div className={styles.cardMain}>
                    <div className={styles.orgCode}>{org.code}</div>
                    <div className={styles.orgName}>{org.name}</div>
                    <div className={styles.orgMeta}>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.orgs.owner")}:</span>
                        {" "}{org.owner_name} ({org.owner_email})
                      </span>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.orgs.timezone")}:</span>
                        {" "}{org.timezone}
                      </span>
                      {org.google_domain && (
                        <span>
                          <span className={styles.metaLabel}>{t("admin.orgs.domain")}:</span>
                          {" "}{org.google_domain}
                        </span>
                      )}
                      <span>
                        <span className={styles.metaLabel}>{t("admin.orgs.appliedAt")}:</span>
                        {" "}{new Date(org.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <button className={styles.btnApprove} onClick={() => handleApprove(org.id)}>
                      {t("admin.orgs.approve")}
                    </button>
                    <button className={styles.btnReject} onClick={() => handleReject(org.id)}>
                      {t("admin.orgs.reject")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Bug reports tab ── */}
      {tab === "bugReports" && (
        <section className={styles.section}>
          {/* Filter */}
          <div className={styles.bugFilter}>
            <span className={styles.filterLabel}>{t("admin.bugReports.filterLabel")}:</span>
            {["all", ...STATUS_OPTS].map((s) => (
              <button
                key={s}
                className={`${styles.filterBtn} ${bugFilter === s ? styles.filterActive : ""}`}
                onClick={() => setBugFilter(s)}
              >
                {s === "all" ? t("admin.bugReports.filterAll") : t(STATUS_LABEL[s])}
              </button>
            ))}
          </div>

          {loadingBugs ? (
            <p className={styles.empty}>{t("common.loading")}</p>
          ) : reports.length === 0 ? (
            <p className={styles.empty}>{t("admin.bugReports.noReports")}</p>
          ) : (
            <div className={styles.list}>
              {reports.map((r) => {
                const expanded = expandedId === r.id;
                return (
                  <div key={r.id} className={styles.bugCard}>
                    <div
                      className={styles.bugHeader}
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                    >
                      <div className={styles.bugHeaderLeft}>
                        <span className={`${styles.badge} ${styles[STATUS_CLASS[r.status] ?? "badgeOpen"]}`}>
                          {t(STATUS_LABEL[r.status] ?? STATUS_LABEL.open)}
                        </span>
                        <span className={styles.bugTitle}>{r.title}</span>
                      </div>
                      <div className={styles.bugHeaderRight}>
                        <span className={styles.bugMeta}>{r.user_name}</span>
                        <span className={styles.bugMeta}>{new Date(r.created_at).toLocaleDateString()}</span>
                        <span className={styles.expandIcon}>{expanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {expanded && (
                      <div className={styles.bugDetail}>
                        {/* User info */}
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>{t("admin.bugReports.user")}:</span>
                          <span>{r.user_name} ({r.user_email})</span>
                        </div>
                        <div className={styles.detailRow}>
                          <span className={styles.detailLabel}>{t("admin.bugReports.env")}:</span>
                          <span className={styles.envBadge}>{r.browser}</span>
                          <span className={styles.envBadge}>{r.os}</span>
                        </div>

                        {/* Body */}
                        <div className={styles.bugBody}>{r.body}</div>

                        {/* Admin controls */}
                        <div className={styles.adminControls}>
                          <div className={styles.controlRow}>
                            <label className={styles.controlLabel}>{t("admin.bugReports.statusLabel")}:</label>
                            <select
                              className={styles.statusSelect}
                              value={editStatus[r.id] ?? r.status}
                              onChange={(e) => setEditStatus((p) => ({ ...p, [r.id]: e.target.value }))}
                            >
                              {STATUS_OPTS.map((s) => (
                                <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>
                              ))}
                            </select>
                          </div>
                          <div className={styles.controlRow}>
                            <label className={styles.controlLabel}>{t("admin.bugReports.noteLabel")}:</label>
                            <textarea
                              className={styles.noteArea}
                              rows={2}
                              value={editNote[r.id] ?? (r.admin_note ?? "")}
                              onChange={(e) => setEditNote((p) => ({ ...p, [r.id]: e.target.value }))}
                              placeholder={t("admin.bugReports.notePlaceholder")}
                            />
                          </div>
                          <button
                            className={styles.saveBtn}
                            onClick={() => handleSaveBug(r.id)}
                            disabled={savingId === r.id}
                          >
                            {savingId === r.id ? t("common.loading") : t("common.save")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
