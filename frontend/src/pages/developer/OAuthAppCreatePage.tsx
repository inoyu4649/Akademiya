import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { openoauthApi, type LoginMeans, type ScopeRange } from "../../api/openoauth.api";
import { orgApi, type Org } from "../../api/org.api";
import { classApi, type ClassItem } from "../../api/class.api";
import SecretRevealModal from "../../components/developer/SecretRevealModal";
import styles from "./Developer.module.css";

const CODE_NAME_RE = /^[a-zA-Z0-9-]{3,64}$/;

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

  useEffect(() => {
    if (!user?.developerMode) { navigate("/"); return; }
    orgApi.my().then((r) => setOrgs(r.data.orgs)).catch(() => {});
    classApi.my().then((r) => setClasses(r.data.classes)).catch(() => {});
  }, [user]);

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
        </div>

        <div className={styles.btnRow}>
          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? t("common.loading") : t("developer.create.submitBtn")}
          </button>
          <button className={styles.btnSecondary} type="button" onClick={() => navigate("/developer/oauth")}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
