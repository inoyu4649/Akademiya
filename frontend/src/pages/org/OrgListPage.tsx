import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { orgApi, type Org } from "../../api/org.api";
import styles from "./OrgListPage.module.css";

export default function OrgListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [applications, setApplications] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    orgApi.my()
      .then((res) => {
        setOrgs(res.data.orgs);
        setApplications(res.data.applications);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("org.list.title")}</h1>
        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={() => navigate("/org/join")}>
            {t("org.list.joinBtn")}
          </button>
          <button className={styles.btnPrimary} onClick={() => navigate("/org/apply")}>
            {t("org.list.applyBtn")}
          </button>
        </div>
      </div>

      {/* 가입된 조직 목록 */}
      {orgs.length === 0 && applications.length === 0 ? (
        <div className={styles.empty}>
          <p>{t("org.list.noOrgs")}</p>
        </div>
      ) : (
        <>
          {orgs.length > 0 && (
            <div className={styles.section}>
              <div className={styles.grid}>
                {orgs.map((org) => (
                  <Link key={org.id} to={`/org/${org.id}`} className={styles.card}>
                    <div className={styles.cardCode}>{org.code}</div>
                    <div className={styles.cardName}>{org.name}</div>
                    <div className={styles.cardMeta}>
                      <span className={styles.permBadge}>
                        {t(`org.detail.permission${org.permission ?? 0}`)}
                      </span>
                      <span className={styles.timezone}>{org.timezone}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {applications.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t("org.list.myApplications")}</h2>
              <div className={styles.appList}>
                {applications.map((app) => (
                  <div key={app.id} className={styles.appItem}>
                    <div className={styles.appCode}>{app.code}</div>
                    <div className={styles.appName}>{app.name}</div>
                    <span className={`${styles.statusBadge} ${styles[`status_${app.status}`]}`}>
                      {t(`org.list.${app.status}Badge`)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
