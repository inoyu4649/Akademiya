import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { classApi, type ClassItem } from "../../api/class.api";
import styles from "./ClassListPage.module.css";

export default function ClassListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [applications, setApplications] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    classApi
      .my()
      .then((res) => {
        setClasses(res.data.classes);
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
        <h1 className={styles.title}>{t("class.list.title")}</h1>
        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={() => navigate("/classes/join")}>
            {t("class.list.joinBtn")}
          </button>
          <button className={styles.btnPrimary} onClick={() => navigate("/classes/apply")}>
            {t("class.list.applyBtn")}
          </button>
        </div>
      </div>

      {classes.length === 0 && applications.length === 0 ? (
        <div className={styles.empty}>
          <p>{t("class.list.noClasses")}</p>
        </div>
      ) : (
        <>
          {classes.length > 0 && (
            <div className={styles.section}>
              <div className={styles.grid}>
                {classes.map((cls) => (
                  <Link key={cls.id} to={`/classes/${cls.id}`} className={styles.card}>
                    <div className={styles.cardComposite}>
                      {cls.org_code}
                      <span className={styles.classCodePart}>{cls.code}</span>
                    </div>
                    <div className={styles.cardName}>{cls.name}</div>
                    <div className={styles.cardMeta}>
                      <span className={styles.orgName}>{cls.org_name}</span>
                      <span className={`${styles.roleBadge} ${cls.permission === 1 ? styles.leader : styles.student}`}>
                        {t(cls.permission === 1 ? "class.detail.permLeader" : "class.detail.permStudent")}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {applications.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>{t("class.list.myApplications")}</h2>
              <div className={styles.appList}>
                {applications.map((app) => (
                  <div key={app.id} className={styles.appItem}>
                    <div className={styles.appCode}>
                      {app.org_code}
                      <span className={styles.classCodePart}>{app.code}</span>
                    </div>
                    <div className={styles.appName}>{app.name}</div>
                    <div className={styles.appOrg}>{app.org_name}</div>
                    <span className={`${styles.statusBadge} ${styles[`status_${app.status}`]}`}>
                      {t(`class.list.${app.status}Badge`)}
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
