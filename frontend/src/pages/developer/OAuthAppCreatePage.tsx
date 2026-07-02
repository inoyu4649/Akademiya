import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { openoauthApi, type LoginMeans, type ScopeRange, type OAuthAppQuota } from "../../api/openoauth.api";
import { orgApi, type Org } from "../../api/org.api";
import { classApi, type ClassItem } from "../../api/class.api";
import SecretRevealModal from "../../components/developer/SecretRevealModal";
import styles from "./Developer.module.css";

const CODE_NAME_RE = /^[a-zA-Z0-9-]{3,64}$/;
const PUBLIC_SCOPE_RANGES: ScopeRange[] = ["all", "google_workspace"];

// ── 공개(Public) 앱 한도 확장 요청 섹션 ────────────────────────────────────────
function QuotaRequestSection({
  quota,
  onToast,
}: {
  quota: OAuthAppQuota;
  onToast: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen]     = useState(false);
  const [reqMax, setReqMax] = useState(quota.max + 5);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequest() {
    setLoading(true);
    try {
      await openoauthApi.requestQuota(reqMax, reason.trim() || undefined);
      onToast(t("developer.create.quotaRequested"));
      setOpen(false);
      setReason("");
    } catch {
      onToast(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.limitSection}>
      <p className={styles.limitSectionTitle}>{t("developer.create.quotaSectionTitle")}</p>
      <div className={styles.limitInfo}>
        <span className={styles.hint}>{t("developer.create.quotaExceeded", { max: quota.max })}</span>
        <button className={styles.btnSecondary} type="button" onClick={() => setOpen((o) => !o)}>
          {t("developer.create.requestQuotaExpand")}
        </button>
      </div>
      {open && (
        <div className={styles.limitForm}>
          <div className={styles.limitRow}>
            <label className={styles.limitLabel}>{t("developer.create.reqMaxApps")}</label>
            <input
              className={styles.limitInput}
              type="number"
              min={quota.max + 1}
              value={reqMax}
              onChange={(e) => setReqMax(Number(e.target.value))}
            />
          </div>
          <div className={styles.limitRow}>
            <label className={styles.limitLabel}>{t("developer.create.reqReason")}</label>
            <input
              className={styles.limitInput}
              placeholder={t("developer.create.reqReasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button className={styles.btn} type="button" onClick={handleRequest} disabled={loading}>
            {loading ? t("common.loading") : t("developer.create.submitQuotaRequest")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function OAuthAppCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);

  const [codeName, setCodeName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mainSiteUrl, setMainSiteUrl] = useState("");
  const [loginMeans, setLoginMeans] = useState<LoginMeans>("both");
  const [scopeRange, setScopeRange] = useState<ScopeRange>("all");
  const [scopeOrgId, setScopeOrgId] = useState<number | "">("");
  const [scopeClassId, setScopeClassId] = useState<number | "">("");
  const [scopeGoogleDomain, setScopeGoogleDomain] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ id: number; clientId: string; clientSecret: string } | null>(null);

  const [quota, setQuota] = useState<OAuthAppQuota | null>(null);
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  useEffect(() => {
    if (!user?.developerMode) { navigate("/"); return; }
    orgApi.my().then((r) => setOrgs(r.data.orgs)).catch(() => {});
    classApi.my().then((r) => setClasses(r.data.classes)).catch(() => {});
    openoauthApi.getQuota().then((r) => setQuota(r.data)).catch(() => {});
  }, [user]);

  const isPublicScope = PUBLIC_SCOPE_RANGES.includes(scopeRange);
  const quotaExceeded = !!quota && isPublicScope && quota.used >= quota.max;

  // Google Workspace 범위는 Google 전용 로그인 수단일 때만 선택 가능
  useEffect(() => {
    if (loginMeans !== "google" && scopeRange === "google_workspace") setScopeRange("all");
  }, [loginMeans]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!CODE_NAME_RE.test(codeName)) { setError(t("developer.create.codeNameInvalid")); return; }
    if (!displayName.trim()) { setError(t("developer.create.displayNameRequired")); return; }
    if (!/^https?:\/\//.test(mainSiteUrl)) { setError(t("developer.create.mainSiteUrlInvalid")); return; }
    if (scopeRange === "org" && !scopeOrgId) { setError(t("developer.create.scopeOrgRequired")); return; }
    if (scopeRange === "class" && !scopeClassId) { setError(t("developer.create.scopeClassRequired")); return; }
    if (scopeRange === "google_workspace" && !scopeGoogleDomain.trim()) { setError(t("developer.create.scopeDomainRequired")); return; }
    if (quotaExceeded) { setError(t("developer.create.quotaExceeded", { max: quota!.max })); return; }

    setLoading(true);
    try {
      const res = await openoauthApi.createApp({
        codeName,
        displayName: displayName.trim(),
        mainSiteUrl,
        loginMeans,
        scopeRange,
        scopeOrgId: scopeRange === "org" ? Number(scopeOrgId) : undefined,
        scopeClassId: scopeRange === "class" ? Number(scopeClassId) : undefined,
        scopeGoogleDomain: scopeRange === "google_workspace" ? scopeGoogleDomain.trim() : undefined,
      });
      setCreated({ id: res.data.id, clientId: res.data.clientId, clientSecret: res.data.clientSecret });
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "CODE_NAME_EXISTS") setError(t("developer.create.codeNameExists"));
      else if (code === "PUBLIC_APP_QUOTA_EXCEEDED") {
        setError(t("developer.create.quotaExceeded", { max: quota?.max ?? 5 }));
        openoauthApi.getQuota().then((r) => setQuota(r.data)).catch(() => {});
      }
      else setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <SecretRevealModal
        clientId={created.clientId}
        clientSecret={created.clientSecret}
        onClose={() => navigate(`/developer/oauth/${created.id}`)}
      />
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate("/developer/oauth")}>← {t("common.back")}</button>
      <h1 className={styles.pageTitle} style={{ marginBottom: 20 }}>{t("developer.create.title")}</h1>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && <div className={styles.alertError}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>{t("developer.create.codeNameLabel")}</label>
          <input
            className={`${styles.input} ${styles.mono}`}
            value={codeName}
            onChange={(e) => setCodeName(e.target.value)}
            placeholder="akademiya-oauth-example"
          />
          <p className={styles.hint}>{t("developer.create.codeNameHint")}</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t("developer.create.displayNameLabel")}</label>
          <input
            className={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Akademiya OAuth Example"
          />
          <p className={styles.hint}>{t("developer.create.displayNameHint")}</p>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t("developer.create.mainSiteUrlLabel")}</label>
          <input
            className={styles.input}
            value={mainSiteUrl}
            onChange={(e) => setMainSiteUrl(e.target.value)}
            placeholder="https://example.akademiya.kr"
          />
          <p className={styles.hint}>{t("developer.create.mainSiteUrlHint")}</p>
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
                  <input
                    type="radio"
                    checked={scopeRange === v}
                    disabled={disabled}
                    onChange={() => setScopeRange(v)}
                  />
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
            <input
              className={styles.input}
              style={{ marginTop: 10 }}
              value={scopeGoogleDomain}
              onChange={(e) => setScopeGoogleDomain(e.target.value)}
              placeholder="school.edu"
            />
          )}

          {quota && isPublicScope && (
            <p className={styles.hint} style={{ marginTop: 10 }}>
              {t("developer.create.quotaUsage", { used: quota.used, max: quota.max })}
            </p>
          )}
        </div>

        <div className={styles.btnRow}>
          <button className={styles.btn} type="submit" disabled={loading || quotaExceeded}>
            {loading ? t("common.loading") : t("developer.create.submitBtn")}
          </button>
          <button className={styles.btnSecondary} type="button" onClick={() => navigate("/developer/oauth")}>
            {t("common.cancel")}
          </button>
        </div>
      </form>

      {toast && <div className={styles.alertSuccess} style={{ maxWidth: 560, marginTop: 16 }}>{toast}</div>}

      {quotaExceeded && quota && (
        <div className={styles.form} style={{ marginTop: 16 }}>
          <QuotaRequestSection quota={quota} onToast={showToast} />
        </div>
      )}
    </div>
  );
}
