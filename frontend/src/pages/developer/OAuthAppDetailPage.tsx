import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useAuthStore } from "../../store/auth.store";
import {
  openoauthApi, type OAuthApp, type OAuthAppOrigin, type LoginMeans, type ScopeRange,
  type OAuthStats, type OAuthBan, type OAuthUserSearchResult,
} from "../../api/openoauth.api";
import { orgApi, type Org } from "../../api/org.api";
import { classApi, type ClassItem } from "../../api/class.api";
import SecretRevealModal from "../../components/developer/SecretRevealModal";
import styles from "./Developer.module.css";

type Tab = "settings" | "stats" | "bans";
type Period = "today" | "7d" | "30d" | "custom";

export default function OAuthAppDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const appId = Number(id);
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>("settings");
  const [app, setApp] = useState<OAuthApp | null>(null);
  const [origins, setOrigins] = useState<OAuthAppOrigin[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  // ── settings form ──
  const [displayName, setDisplayName] = useState("");
  const [mainSiteUrl, setMainSiteUrl] = useState("");
  const [loginMeans, setLoginMeans] = useState<LoginMeans>("both");
  const [scopeRange, setScopeRange] = useState<ScopeRange>("all");
  const [scopeOrgId, setScopeOrgId] = useState<number | "">("");
  const [scopeClassId, setScopeClassId] = useState<number | "">("");
  const [scopeGoogleDomain, setScopeGoogleDomain] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newOrigin, setNewOrigin] = useState("");
  const [originError, setOriginError] = useState("");

  const [regeneratedSecret, setRegeneratedSecret] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ── stats ──
  const [period, setPeriod] = useState<Period>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [stats, setStats] = useState<OAuthStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ── bans ──
  const [banQuery, setBanQuery] = useState("");
  const [banResults, setBanResults] = useState<OAuthUserSearchResult[]>([]);
  const [banningUser, setBanningUser] = useState<OAuthUserSearchResult | null>(null);
  const [banReason, setBanReason] = useState("");
  const [bans, setBans] = useState<OAuthBan[]>([]);

  function loadApp() {
    return openoauthApi.getApp(appId).then((res) => {
      setApp(res.data.app);
      setOrigins(res.data.origins);
      setDisplayName(res.data.app.displayName);
      setMainSiteUrl(res.data.app.mainSiteUrl);
      setLoginMeans(res.data.app.loginMeans);
      setScopeRange(res.data.app.scopeRange);
      setScopeOrgId(res.data.app.scopeOrgId ?? "");
      setScopeClassId(res.data.app.scopeClassId ?? "");
      setScopeGoogleDomain(res.data.app.scopeGoogleDomain ?? "");
    });
  }

  useEffect(() => {
    if (!user?.developerMode) { navigate("/"); return; }
    Promise.all([loadApp(), orgApi.my().then((r) => setOrgs(r.data.orgs)), classApi.my().then((r) => setClasses(r.data.classes))])
      .catch(() => navigate("/developer/oauth"))
      .finally(() => setLoading(false));
  }, [appId, user]);

  useEffect(() => {
    if (loginMeans !== "google" && scopeRange === "google_workspace") setScopeRange("all");
  }, [loginMeans]);

  useEffect(() => {
    if (tab !== "stats" || !app) return;
    if (period === "custom" && (!customFrom || !customTo)) return;
    setStatsLoading(true);
    openoauthApi.getStats(appId, period, customFrom || undefined, customTo || undefined)
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [tab, period, customFrom, customTo, app]);

  useEffect(() => {
    if (tab !== "bans" || !app) return;
    openoauthApi.listBans(appId).then((res) => setBans(res.data.bans)).catch(() => {});
  }, [tab, app]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(""); setSaveSuccess(false);
    if (!displayName.trim()) { setSaveError(t("developer.create.displayNameRequired")); return; }
    if (!/^https?:\/\//.test(mainSiteUrl)) { setSaveError(t("developer.create.mainSiteUrlInvalid")); return; }
    if (scopeRange === "org" && !scopeOrgId) { setSaveError(t("developer.create.scopeOrgRequired")); return; }
    if (scopeRange === "class" && !scopeClassId) { setSaveError(t("developer.create.scopeClassRequired")); return; }
    if (scopeRange === "google_workspace" && !scopeGoogleDomain.trim()) { setSaveError(t("developer.create.scopeDomainRequired")); return; }

    setSaving(true);
    try {
      await openoauthApi.updateApp(appId, {
        displayName: displayName.trim(),
        mainSiteUrl,
        loginMeans,
        scopeRange,
        scopeOrgId: scopeRange === "org" ? Number(scopeOrgId) : null,
        scopeClassId: scopeRange === "class" ? Number(scopeClassId) : null,
        scopeGoogleDomain: scopeRange === "google_workspace" ? scopeGoogleDomain.trim() : null,
      });
      await loadApp();
      setSaveSuccess(true);
    } catch {
      setSaveError(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddOrigin() {
    setOriginError("");
    let normalized = newOrigin.trim();
    try {
      normalized = new URL(normalized).origin;
    } catch {
      setOriginError(t("developer.settings.originInvalid"));
      return;
    }
    try {
      const res = await openoauthApi.addOrigin(appId, normalized);
      setOrigins((prev) => [...prev, res.data]);
      setNewOrigin("");
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setOriginError(code === "ORIGIN_EXISTS" ? t("developer.settings.originExists") : t("common.error"));
    }
  }

  async function handleRemoveOrigin(originId: number) {
    await openoauthApi.removeOrigin(appId, originId);
    setOrigins((prev) => prev.filter((o) => o.id !== originId));
  }

  async function handleRegenerateSecret() {
    const res = await openoauthApi.regenerateSecret(appId);
    setRegeneratedSecret(res.data.clientSecret);
  }

  async function handleDeleteApp() {
    await openoauthApi.deleteApp(appId);
    navigate("/developer/oauth");
  }

  async function handleSearchUsers() {
    if (!banQuery.trim()) { setBanResults([]); return; }
    const res = await openoauthApi.searchUsers(appId, banQuery.trim());
    setBanResults(res.data.users);
  }

  async function handleConfirmBan() {
    if (!banningUser) return;
    await openoauthApi.banUser(appId, banningUser.id, banReason.trim());
    setBanningUser(null);
    setBanReason("");
    setBanResults([]);
    setBanQuery("");
    openoauthApi.listBans(appId).then((res) => setBans(res.data.bans)).catch(() => {});
  }

  async function handleUnban(userId: number) {
    await openoauthApi.unbanUser(appId, userId);
    setBans((prev) => prev.filter((b) => b.user_id !== userId));
  }

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;
  if (!app) return null;

  if (regeneratedSecret) {
    return (
      <SecretRevealModal
        clientId={app.clientId}
        clientSecret={regeneratedSecret}
        onClose={() => setRegeneratedSecret(null)}
      />
    );
  }

  const chartData = (stats?.series ?? []).map((p) => ({
    date: p.date,
    [t("developer.stats.requests")]: p.requests,
    [t("developer.stats.users")]: p.users,
  }));

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate("/developer/oauth")}>← {t("common.back")}</button>

      <div className={styles.detailHeader}>
        <h1 className={styles.pageTitle}>{app.displayName}</h1>
      </div>
      <div className={styles.clientIdRow}>
        <span>client_id: {app.clientId}</span>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === "settings" ? styles.tabActive : ""}`} onClick={() => setTab("settings")}>
          {t("developer.tabs.settings")}
        </button>
        <button className={`${styles.tab} ${tab === "stats" ? styles.tabActive : ""}`} onClick={() => setTab("stats")}>
          {t("developer.tabs.stats")}
        </button>
        <button className={`${styles.tab} ${tab === "bans" ? styles.tabActive : ""}`} onClick={() => setTab("bans")}>
          {t("developer.tabs.bans")}
        </button>
      </div>

      {/* ── 설정 탭 ── */}
      {tab === "settings" && (
        <>
          <form className={styles.form} onSubmit={handleSaveSettings} noValidate>
            {saveError && <div className={styles.alertError}>{saveError}</div>}
            {saveSuccess && <div className={styles.alertSuccess}>{t("developer.settings.saveSuccess")}</div>}

            <div className={styles.field}>
              <label className={styles.label}>{t("developer.create.codeNameLabel")}</label>
              <input className={`${styles.input} ${styles.mono}`} value={app.codeName} disabled />
              <p className={styles.hint}>{t("developer.settings.codeNameImmutable")}</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t("developer.create.displayNameLabel")}</label>
              <input className={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t("developer.create.mainSiteUrlLabel")}</label>
              <input className={styles.input} value={mainSiteUrl} onChange={(e) => setMainSiteUrl(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t("developer.create.loginMeansLabel")}</label>
              <div className={styles.radioGroup}>
                {(["both", "akademiya", "google"] as LoginMeans[]).map((v) => (
                  <label key={v} className={`${styles.radioOption} ${loginMeans === v ? styles.radioOptionActive : ""}`}>
                    <input type="radio" checked={loginMeans === v} onChange={() => setLoginMeans(v)} />
                    <span>
                      <span className={styles.radioLabel}>{t(`developer.loginMeans.${v}`)}</span>
                      <span className={styles.radioDesc}>{t(`developer.loginMeans.${v}Desc`)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t("developer.create.scopeRangeLabel")}</label>
              <div className={styles.radioGroup}>
                {(["all", "org", "class", "google_workspace"] as ScopeRange[]).map((v) => {
                  const disabled = v === "google_workspace" && loginMeans !== "google";
                  return (
                    <label
                      key={v}
                      className={`${styles.radioOption} ${scopeRange === v ? styles.radioOptionActive : ""}`}
                      style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                    >
                      <input type="radio" checked={scopeRange === v} disabled={disabled} onChange={() => setScopeRange(v)} />
                      <span>
                        <span className={styles.radioLabel}>{t(`developer.scopeRange.${v}`)}</span>
                        <span className={styles.radioDesc}>{t(`developer.scopeRange.${v}Desc`)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {scopeRange === "org" && (
                <select className={styles.select} style={{ marginTop: 10 }} value={scopeOrgId} onChange={(e) => setScopeOrgId(Number(e.target.value))}>
                  <option value="">{t("developer.create.scopeOrgPlaceholder")}</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
                </select>
              )}
              {scopeRange === "class" && (
                <select className={styles.select} style={{ marginTop: 10 }} value={scopeClassId} onChange={(e) => setScopeClassId(Number(e.target.value))}>
                  <option value="">{t("developer.create.scopeClassPlaceholder")}</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.org_name} — {c.name}</option>)}
                </select>
              )}
              {scopeRange === "google_workspace" && (
                <input className={styles.input} style={{ marginTop: 10 }} value={scopeGoogleDomain} onChange={(e) => setScopeGoogleDomain(e.target.value)} placeholder="school.edu" />
              )}
            </div>

            <button className={styles.btn} type="submit" disabled={saving}>
              {saving ? t("common.loading") : t("common.save")}
            </button>
          </form>

          {/* ── 신뢰 오리진 ── */}
          <div className={styles.section} style={{ marginTop: 28 }}>
            <h2 className={styles.sectionTitle}>{t("developer.settings.originsTitle")}</h2>
            <p className={styles.pageSubtitle} style={{ marginBottom: 14 }}>{t("developer.settings.originsHint")}</p>
            <div className={styles.originList}>
              {origins.length === 0 && <p className={styles.empty} style={{ padding: 0 }}>{t("developer.settings.noOrigins")}</p>}
              {origins.map((o) => (
                <div key={o.id} className={styles.originItem}>
                  <span>{o.origin}</span>
                  <button className={styles.removeBtn} onClick={() => handleRemoveOrigin(o.id)}>{t("common.cancel")}</button>
                </div>
              ))}
            </div>
            {originError && <div className={styles.alertError}>{originError}</div>}
            <div className={styles.addRow}>
              <input
                className={`${styles.input} ${styles.mono}`}
                placeholder="https://example.akademiya.kr"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
              />
              <button className={styles.btnSecondary} type="button" onClick={handleAddOrigin}>{t("developer.settings.addOrigin")}</button>
            </div>
          </div>

          {/* ── Client Secret ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("developer.settings.secretTitle")}</h2>
            <p className={styles.pageSubtitle} style={{ marginBottom: 14 }}>{t("developer.settings.secretHint")}</p>
            <button className={styles.btnSecondary} onClick={handleRegenerateSecret}>{t("developer.settings.regenerateBtn")}</button>
          </div>

          {/* ── 위험 구역 ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("developer.settings.dangerTitle")}</h2>
            {!deleteConfirm ? (
              <button className={styles.dangerBtn} onClick={() => setDeleteConfirm(true)}>{t("developer.settings.deleteBtn")}</button>
            ) : (
              <div className={styles.dangerZone}>
                <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{t("developer.settings.deleteConfirm")}</p>
                <div className={styles.btnRow}>
                  <button className={styles.dangerBtn} onClick={handleDeleteApp}>{t("developer.settings.deleteConfirmBtn")}</button>
                  <button className={styles.btnSecondary} onClick={() => setDeleteConfirm(false)}>{t("common.cancel")}</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 통계 탭 ── */}
      {tab === "stats" && (
        <div className={styles.section}>
          <div className={styles.periodRow}>
            {(["today", "7d", "30d", "custom"] as Period[]).map((p) => (
              <button
                key={p}
                className={`${styles.periodBtn} ${period === p ? styles.periodActive : ""}`}
                onClick={() => setPeriod(p)}
              >
                {t(`developer.stats.period.${p}`)}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className={styles.customRange}>
              <input className={styles.input} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ maxWidth: 160 }} />
              <span>~</span>
              <input className={styles.input} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ maxWidth: 160 }} />
            </div>
          )}

          {statsLoading ? (
            <p className={styles.empty}>{t("common.loading")}</p>
          ) : stats ? (
            <>
              <div className={styles.statCards}>
                <div className={styles.statCard}>
                  <div className={styles.statNumber}>{stats.uniqueUsers}</div>
                  <div className={styles.statLabel}>{t("developer.stats.uniqueUsers")}</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statNumber}>{stats.requestCount}</div>
                  <div className={styles.statLabel}>{t("developer.stats.requestCount")}</div>
                </div>
              </div>

              <div className={styles.chartCard}>
                <h2 className={styles.sectionTitle}>{t("developer.stats.chartTitle")}</h2>
                {chartData.length === 0 ? (
                  <p className={styles.empty}>{t("developer.stats.noData")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                      <Tooltip contentStyle={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey={t("developer.stats.requests")} fill="var(--accent)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={t("developer.stats.users")} fill="var(--success)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── BAN 탭 ── */}
      {tab === "bans" && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("developer.bans.searchTitle")}</h2>
          <div className={styles.searchRow}>
            <input
              className={styles.input}
              placeholder={t("developer.bans.searchPlaceholder")}
              value={banQuery}
              onChange={(e) => setBanQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearchUsers(); } }}
            />
            <button className={styles.btnSecondary} type="button" onClick={handleSearchUsers}>{t("developer.bans.searchBtn")}</button>
          </div>

          {banResults.length > 0 && (
            <div className={styles.searchResults}>
              {banResults.map((u) => (
                <div key={u.id}>
                  <div className={styles.searchResultItem}>
                    <div className={styles.userMeta}>
                      <span className={styles.userName}>{u.display_name}</span>
                      <span className={styles.userEmail}>{u.email}</span>
                    </div>
                    <button className={styles.banBtn} onClick={() => { setBanningUser(u); setBanReason(""); }}>
                      {t("developer.bans.banBtn")}
                    </button>
                  </div>
                  {banningUser?.id === u.id && (
                    <div style={{ padding: "10px 12px", background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 4, marginBottom: 8 }}>
                      <textarea
                        className={styles.textarea}
                        rows={2}
                        placeholder={t("developer.bans.reasonPlaceholder")}
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                        style={{ marginBottom: 8 }}
                      />
                      <div className={styles.btnRow}>
                        <button className={styles.banBtn} onClick={handleConfirmBan}>{t("developer.bans.confirmBtn")}</button>
                        <button className={styles.btnSecondary} onClick={() => setBanningUser(null)}>{t("common.cancel")}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <h2 className={styles.sectionTitle} style={{ marginTop: 24 }}>{t("developer.bans.listTitle")}</h2>
          {bans.length === 0 ? (
            <p className={styles.empty}>{t("developer.bans.empty")}</p>
          ) : (
            bans.map((b) => (
              <div key={b.user_id} className={styles.banItem}>
                <div className={styles.banItemHeader}>
                  <div className={styles.userMeta}>
                    <span className={styles.userName}>{b.display_name}</span>
                    <span className={styles.userEmail}>{b.email}</span>
                  </div>
                  <button className={styles.unbanBtn} onClick={() => handleUnban(b.user_id)}>{t("developer.bans.unbanBtn")}</button>
                </div>
                {b.reason && <p className={styles.banReason}>{b.reason}</p>}
                <p className={styles.banDate}>{new Date(b.banned_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
