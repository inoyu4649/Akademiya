import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi, type Survey } from "../../api/survey.api";
import styles from "./SurveyPage.module.css";

function SurveyCard({ survey, onClick }: { survey: Survey; onClick: () => void }) {
  const { t } = useTranslation();
  const isExpired = survey.expires_at && new Date(survey.expires_at) < new Date();

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <span className={`${styles.scopeBadge} ${styles[`scope_${survey.scope_type}`]}`}>
          {survey.scope_type === "class"
            ? t("survey.scopeClass")
            : survey.scope_type === "org"
            ? t("survey.scopeOrg")
            : t("survey.scopePublic")}
        </span>
        {survey.scope_name && (
          <span className={styles.scopeName}>{survey.scope_name}</span>
        )}
        {isExpired ? (
          <span className={styles.expiredBadge}>{t("survey.expired")}</span>
        ) : !survey.is_active ? (
          <span className={styles.inactiveBadge}>{t("survey.inactive")}</span>
        ) : survey.already_responded ? (
          <span className={styles.respondedBadge}>{t("survey.responded")}</span>
        ) : null}
      </div>
      <h3 className={styles.cardTitle}>{survey.title}</h3>
      {survey.description && (
        <p className={styles.cardDesc}>{survey.description}</p>
      )}
      <div className={styles.cardFooter}>
        <span className={styles.respCount}>
          {t("survey.responseCount", { count: survey.response_count ?? 0 })}
        </span>
        {survey.expires_at && (
          <span className={styles.expiresAt}>
            {t("survey.expiresAt")}: {new Date(survey.expires_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

function ViewableSurveyCard({ survey, onClick }: { survey: Survey; onClick: () => void }) {
  const { t } = useTranslation();
  const isExpired = survey.expires_at && new Date(survey.expires_at) < new Date();

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <span className={`${styles.scopeBadge} ${styles[`scope_${survey.scope_type}`]}`}>
          {survey.scope_type === "class"
            ? t("survey.scopeClass")
            : survey.scope_type === "org"
            ? t("survey.scopeOrg")
            : t("survey.scopePublic")}
        </span>
        {survey.scope_name && (
          <span className={styles.scopeName}>{survey.scope_name}</span>
        )}
        {isExpired ? (
          <span className={styles.expiredBadge}>{t("survey.expired")}</span>
        ) : !survey.is_active ? (
          <span className={styles.inactiveBadge}>{t("survey.inactive")}</span>
        ) : null}
        <span className={styles.respondedBadge}>{t("survey.viewStats")}</span>
      </div>
      <h3 className={styles.cardTitle}>{survey.title}</h3>
      {survey.description && (
        <p className={styles.cardDesc}>{survey.description}</p>
      )}
      <div className={styles.cardFooter}>
        <span className={styles.respCount}>
          {t("survey.responseCount", { count: survey.response_count ?? 0 })}
        </span>
        {survey.creator_name && (
          <span className={styles.expiresAt}>
            {t("survey.by")}: {survey.creator_name}
          </span>
        )}
        {survey.expires_at && (
          <span className={styles.expiresAt}>
            {t("survey.expiresAt")}: {new Date(survey.expires_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SurveyListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [tab, setTab]           = useState<"feed" | "my" | "viewable">("feed");
  const [feed, setFeed]         = useState<Survey[]>([]);
  const [mine, setMine]         = useState<Survey[]>([]);
  const [viewable, setViewable] = useState<Survey[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([surveyApi.feed(), surveyApi.my(), surveyApi.viewable()])
      .then(([feedData, myData, viewableData]) => {
        setFeed(feedData.surveys);
        setMine(myData.surveys);
        setViewable(viewableData.surveys);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t("survey.title")}</h1>
        <button
          className={styles.createBtn}
          onClick={() => navigate("/surveys/create")}
        >
          + {t("survey.createBtn")}
        </button>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "feed" ? styles.tabActive : ""}`}
          onClick={() => setTab("feed")}
        >
          {t("survey.tabFeed")}
        </button>
        <button
          className={`${styles.tab} ${tab === "my" ? styles.tabActive : ""}`}
          onClick={() => setTab("my")}
        >
          {t("survey.tabMy")}
        </button>
        {viewable.length > 0 && (
          <button
            className={`${styles.tab} ${tab === "viewable" ? styles.tabActive : ""}`}
            onClick={() => setTab("viewable")}
          >
            {t("survey.tabViewable")}
          </button>
        )}
      </div>

      {loading ? (
        <p className={styles.empty}>{t("common.loading")}</p>
      ) : tab === "viewable" ? (
        viewable.length === 0 ? (
          <p className={styles.empty}>{t("survey.empty")}</p>
        ) : (
          <div className={styles.list}>
            {viewable.map((s) => (
              <ViewableSurveyCard
                key={s.id}
                survey={s}
                onClick={() => navigate(`/surveys/${s.id}/stats`)}
              />
            ))}
          </div>
        )
      ) : (
        (() => {
          const surveys = tab === "feed" ? feed : mine;
          return surveys.length === 0 ? (
            <p className={styles.empty}>{t("survey.empty")}</p>
          ) : (
            <div className={styles.list}>
              {surveys.map((s) => (
                <SurveyCard
                  key={s.id}
                  survey={s}
                  onClick={() => navigate(`/surveys/${s.id}`)}
                />
              ))}
            </div>
          );
        })()
      )}
    </div>
  );
}
