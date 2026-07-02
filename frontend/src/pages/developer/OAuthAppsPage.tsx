import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { openoauthApi, type OAuthApp, type OAuthAppQuota } from "../../api/openoauth.api";
import styles from "./Developer.module.css";

const LOGIN_MEANS_KEY: Record<string, string> = {
  akademiya: "developer.loginMeans.akademiya",
  google: "developer.loginMeans.google",
  both: "developer.loginMeans.both",
};

export default function OAuthAppsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [apps, setApps] = useState<OAuthApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<OAuthAppQuota | null>(null);

  useEffect(() => {
    if (!user?.developerMode) { navigate("/"); return; }
    openoauthApi.listApps()
      .then((res) => setApps(res.data.apps))
      .catch(() => {})
      .finally(() => setLoading(false));
    openoauthApi.getQuota().then((r) => setQuota(r.data)).catch(() => {});
  }, [user]);

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>{t("developer.apps.title")}</h1>
          <p className={styles.pageSubtitle}>{t("developer.apps.subtitle")}</p>
          <Link to="/developer/oauth/guide" className={styles.guideLink}>
            {t("developer.apps.guideLink")}
          </Link>
          {quota && (
            <p className={styles.pageSubtitle}>
              {t("developer.create.quotaUsage", { used: quota.used, max: quota.max })}
            </p>
          )}
        </div>
        <button className={styles.createBtn} onClick={() => navigate("/developer/oauth/create")}>
          {t("developer.apps.createBtn")}
        </button>
      </div>

      {apps.length === 0 ? (
        <p className={styles.empty}>{t("developer.apps.empty")}</p>
      ) : (
        <div className={styles.list}>
          {apps.map((app) => (
            <Link key={app.id} to={`/developer/oauth/${app.id}`} className={styles.card}>
              <div className={styles.cardTitle}>{app.displayName}</div>
              <div className={styles.cardCode}>{app.codeName}</div>
              <div className={styles.cardMeta}>
                <span className={styles.badge}>{t(LOGIN_MEANS_KEY[app.loginMeans])}</span>
                <span>{app.mainSiteUrl}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
