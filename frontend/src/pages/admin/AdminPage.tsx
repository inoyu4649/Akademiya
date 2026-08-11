import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { adminApi, type AdminOrg, type OAuthQuotaRequest } from "../../api/admin.api";
import { bugReportApi, type BugReport } from "../../api/bugReport.api";
import styles from "./AdminPage.module.css";

type Tab = "orgs" | "bugReports" | "quotaRequests";

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

const EMPTY_ORG_FORM = { name: "", code: "", google_domain: "", timezone: "Asia/Seoul" };

export default function AdminPage() {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const user     = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>("orgs");

  // ── 조직 탭 ──
  // 조직은 사용자에게 노출되지 않는 내부 기능이다. OAuth 앱(GMCAuto 3 등)이
  // "이 학교 재학생만 로그인 가능"을 판별하는 근거이므로 운영자만 관리한다.
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [orgForm, setOrgForm] = useState(EMPTY_ORG_FORM);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgFormOpen, setOrgFormOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editDomain, setEditDomain] = useState("");

  // ── 버그 리포트 탭 ──
  const [reports,       setReports]       = useState<BugReport[]>([]);
  const [loadingBugs,   setLoadingBugs]   = useState(false);
  const [bugFilter,     setBugFilter]     = useState<string>("all");
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [editNote,      setEditNote]      = useState<Record<number, string>>({});
  const [editStatus,    setEditStatus]    = useState<Record<number, string>>({});
  const [savingId,      setSavingId]      = useState<number | null>(null);

  // ── 한도 확장 요청 탭 ──
  const [oauthQuotaReqs,  setOauthQuotaReqs]  = useState<OAuthQuotaRequest[]>([]);
  const [oauthQuotaNotes, setOauthQuotaNotes] = useState<Record<number, string>>({});

  const [toast, setToast] = useState("");

  function loadOrgs() {
    adminApi.getOrgs()
      .then((res) => setOrgs(res.data.orgs))
      .catch(() => { /* 무시 */ })
      .finally(() => setLoadingOrgs(false));
  }

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/"); return; }
    loadOrgs();
  }, [user]);

  useEffect(() => {
    if (tab !== "bugReports") return;
    loadBugReports();
  }, [tab, bugFilter]);

  useEffect(() => {
    if (tab !== "quotaRequests") return;
    adminApi.getOAuthQuotaRequests("pending")
      .then((r) => setOauthQuotaReqs(r.data.requests))
      .catch(() => { /* 무시 */ });
  }, [tab]);

  function loadBugReports() {
    setLoadingBugs(true);
    const status = bugFilter === "all" ? undefined : bugFilter;
    bugReportApi.adminList(status)
      .then((d) => setReports(d.reports))
      .catch(() => { /* 무시 */ })
      .finally(() => setLoadingBugs(false));
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // ── 조직 핸들러 ──
  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (!orgForm.name.trim() || !/^[A-Za-z]{4}$/.test(orgForm.code.trim())) {
      showToast(t("admin.orgs.invalidInput"));
      return;
    }
    setCreatingOrg(true);
    try {
      await adminApi.createOrg({
        name: orgForm.name.trim(),
        code: orgForm.code.trim().toUpperCase(),
        google_domain: orgForm.google_domain.trim() || undefined,
        timezone: orgForm.timezone.trim() || "Asia/Seoul",
      });
      setOrgForm(EMPTY_ORG_FORM);
      setOrgFormOpen(false);
      loadOrgs();
      showToast(t("admin.orgs.createSuccess"));
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(code === "org.apply.codeDuplicate" ? t("admin.orgs.codeDuplicate") : t("common.error"));
    } finally {
      setCreatingOrg(false);
    }
  }

  async function handleSaveDomain(org: AdminOrg) {
    try {
      await adminApi.updateOrg(org.id, { google_domain: editDomain.trim() || null });
      setEditingOrgId(null);
      loadOrgs();
      showToast(t("admin.orgs.updateSuccess"));
    } catch {
      showToast(t("common.error"));
    }
  }

  async function handleApproveOrg(id: number) {
    await adminApi.approveOrg(id);
    loadOrgs();
    showToast(t("admin.orgs.approveSuccess"));
  }

  async function handleDeleteOrg(org: AdminOrg) {
    if (!confirm(t("admin.orgs.deleteConfirm", { name: org.name }))) return;
    try {
      await adminApi.deleteOrg(org.id);
      loadOrgs();
      showToast(t("admin.orgs.deleteSuccess"));
    } catch {
      showToast(t("common.error"));
    }
  }

  // ── 버그 리포트 핸들러 ──
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
        <button
          className={`${styles.tab} ${tab === "quotaRequests" ? styles.tabActive : ""}`}
          onClick={() => setTab("quotaRequests")}
        >
          {t("admin.oauthQuotaRequests.title")}
        </button>
      </div>

      {/* ── 조직 탭 ── */}
      {tab === "orgs" && (
        <section className={styles.section}>
          <p className={styles.sectionHint}>{t("admin.orgs.hint")}</p>

          {orgFormOpen ? (
            <form className={styles.orgForm} onSubmit={handleCreateOrg}>
              <div className={styles.orgFormRow}>
                <input
                  className={styles.noteInput}
                  placeholder={t("admin.orgs.namePlaceholder")}
                  value={orgForm.name}
                  onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))}
                  maxLength={200}
                />
                <input
                  className={styles.noteInput}
                  placeholder={t("admin.orgs.codePlaceholder")}
                  value={orgForm.code}
                  onChange={(e) => setOrgForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  maxLength={4}
                  style={{ maxWidth: 110, fontFamily: "var(--font-mono)", letterSpacing: 2 }}
                />
              </div>
              <div className={styles.orgFormRow}>
                <input
                  className={styles.noteInput}
                  placeholder={t("admin.orgs.domainPlaceholder")}
                  value={orgForm.google_domain}
                  onChange={(e) => setOrgForm((p) => ({ ...p, google_domain: e.target.value }))}
                  maxLength={255}
                />
                <input
                  className={styles.noteInput}
                  placeholder="Asia/Seoul"
                  value={orgForm.timezone}
                  onChange={(e) => setOrgForm((p) => ({ ...p, timezone: e.target.value }))}
                  maxLength={50}
                  style={{ maxWidth: 180 }}
                />
              </div>
              <p className={styles.sectionHint}>{t("admin.orgs.domainHint")}</p>
              <div className={styles.cardActions}>
                <button className={styles.btnApprove} type="submit" disabled={creatingOrg}>
                  {creatingOrg ? t("common.loading") : t("admin.orgs.createBtn")}
                </button>
                <button
                  className={styles.btnReject}
                  type="button"
                  onClick={() => { setOrgFormOpen(false); setOrgForm(EMPTY_ORG_FORM); }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <button className={styles.btnApprove} onClick={() => setOrgFormOpen(true)} style={{ marginBottom: 16 }}>
              + {t("admin.orgs.createBtn")}
            </button>
          )}

          {orgs.length === 0 ? (
            <p className={styles.empty}>{t("admin.orgs.noOrgs")}</p>
          ) : (
            <div className={styles.list}>
              {orgs.map((org) => (
                <div key={org.id} className={styles.card}>
                  <div className={styles.cardMain}>
                    <div className={styles.orgCode}>{org.code}</div>
                    <div className={styles.orgName}>
                      {org.name}
                      {org.status === "pending" && (
                        <span className={styles.badge} style={{ marginLeft: 8 }}>
                          {t("admin.orgs.pendingBadge")}
                        </span>
                      )}
                    </div>
                    <div className={styles.orgMeta}>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.orgs.members")}:</span>
                        {" "}{org.member_count}
                        {org.pending_count > 0 && ` (${t("admin.orgs.pendingJoins", { count: org.pending_count })})`}
                      </span>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.orgs.timezone")}:</span>
                        {" "}{org.timezone}
                      </span>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.orgs.domain")}:</span>
                        {" "}{org.google_domain || t("admin.orgs.noDomain")}
                      </span>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.orgs.createdAt")}:</span>
                        {" "}{new Date(org.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {editingOrgId === org.id && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                        <input
                          className={styles.noteInput}
                          placeholder={t("admin.orgs.domainPlaceholder")}
                          value={editDomain}
                          onChange={(e) => setEditDomain(e.target.value)}
                          maxLength={255}
                        />
                        <button className={styles.btnApprove} onClick={() => handleSaveDomain(org)}>
                          {t("common.save")}
                        </button>
                        <button className={styles.btnReject} onClick={() => setEditingOrgId(null)}>
                          {t("common.cancel")}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={styles.cardActions}>
                    {org.status === "pending" && (
                      <button className={styles.btnApprove} onClick={() => handleApproveOrg(org.id)}>
                        {t("admin.orgs.approve")}
                      </button>
                    )}
                    <button
                      className={styles.btnApprove}
                      onClick={() => { setEditingOrgId(org.id); setEditDomain(org.google_domain ?? ""); }}
                    >
                      {t("admin.orgs.editDomain")}
                    </button>
                    <button className={styles.btnReject} onClick={() => handleDeleteOrg(org)}>
                      {t("admin.orgs.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 버그 리포트 탭 ── */}
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

      {/* ── OAuth 공개 앱 한도 확장 요청 탭 ── */}
      {tab === "quotaRequests" && (
        <section className={styles.section}>
          {oauthQuotaReqs.length === 0 ? (
            <p className={styles.empty}>{t("admin.limitRequests.noRequests")}</p>
          ) : (
            <div className={styles.list}>
              {oauthQuotaReqs.map((r) => (
                <div key={r.id} className={styles.card}>
                  <div className={styles.cardMain}>
                    <div className={styles.orgName}>{r.requester_name} ({r.requester_email})</div>
                    <div className={styles.orgMeta}>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.limitRequests.current")}:</span>
                        {" "}{r.current_max_apps}
                      </span>
                      <span>
                        <span className={styles.metaLabel}>{t("admin.limitRequests.requested")}:</span>
                        {" "}{r.requested_max_apps}
                      </span>
                      {r.reason && (
                        <span>
                          <span className={styles.metaLabel}>{t("admin.limitRequests.reason")}:</span>
                          {" "}{r.reason}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <input
                        className={styles.noteInput}
                        placeholder={t("admin.limitRequests.notePlaceholder")}
                        value={oauthQuotaNotes[r.id] ?? ""}
                        onChange={(e) => setOauthQuotaNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      className={styles.btnApprove}
                      onClick={async () => {
                        await adminApi.approveOAuthQuotaRequest(r.id, oauthQuotaNotes[r.id]);
                        setOauthQuotaReqs((prev) => prev.filter((x) => x.id !== r.id));
                        showToast(t("admin.limitRequests.approveSuccess"));
                      }}
                    >
                      {t("admin.limitRequests.approve")}
                    </button>
                    <button
                      className={styles.btnReject}
                      onClick={async () => {
                        await adminApi.rejectOAuthQuotaRequest(r.id, oauthQuotaNotes[r.id]);
                        setOauthQuotaReqs((prev) => prev.filter((x) => x.id !== r.id));
                        showToast(t("admin.limitRequests.rejectSuccess"));
                      }}
                    >
                      {t("admin.limitRequests.reject")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
