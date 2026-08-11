import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { orgApi } from "../../api/org.api";
import { useAuthStore } from "../../store/auth.store";
// 서비스 로고는 public/이 아니라 Vite 임포트로 가져온다 —
// 빌드 시 파일명에 콘텐츠 해시가 붙어, 이미지를 교체하면 URL도 바뀌므로
// 브라우저·CDN 캐시에 옛 이미지가 남는 일이 없다.
import gmcLogo from "../../assets/logo_gmc.png";
import imsiQuizLogo from "../../assets/imsiquiz_logo.png";
import hyProjectLogo from "../../assets/hyproj_logo.png";
import styles from "./DashboardPage.module.css";

// ── 아이콘 ───────────────────────────────────────────────────────────────────

function IconSurvey() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="12" y2="17" />
    </svg>
  );
}

function IconAccount() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

// ── 카드 ─────────────────────────────────────────────────────────────────────

interface CardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: React.ReactNode;
  /** 내부 라우트 */
  to?: string;
  /** 외부 링크 (새 창) */
  href?: string;
  /** 준비 중 — 클릭 불가 */
  disabled?: boolean;
}

function ServiceCard({ icon, title, desc, badge, to, href, disabled }: CardProps) {
  const inner = (
    <>
      <div className={styles.iconBox}>{icon}</div>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          {badge}
          {href && !disabled && <span className={styles.external}>↗</span>}
        </div>
        <p className={styles.desc}>{desc}</p>
      </div>
    </>
  );

  if (disabled) {
    return (
      <div className={`${styles.card} ${styles.cardDisabled}`} aria-disabled="true">
        {inner}
      </div>
    );
  }
  if (href) {
    return (
      <a className={styles.card} href={href} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <Link className={styles.card} to={to!}>
      {inner}
    </Link>
  );
}

// ── 페이지 ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [isHafsOrgMember, setIsHafsOrgMember] = useState(false);

  // GMCAuto 3 카드는 HAFS 조직 가입자에게만 노출한다.
  useEffect(() => {
    if (!user) return;
    orgApi.my()
      .then((res) => {
        setIsHafsOrgMember(res.data.orgs.some((org) => org.code.toUpperCase() === "HAFS"));
      })
      .catch(() => { /* 조회 실패 시 노출하지 않음 */ });
  }, [user]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.greeting}>
          {t("dashboard.greeting", { name: user?.displayName ?? "" })}
        </h1>
        <p className={styles.subtitle}>{t("dashboard.subtitle")}</p>
      </header>

      <div className={styles.grid}>
        <ServiceCard
          to="/surveys"
          icon={<IconSurvey />}
          title={t("dashboard.surveys.title")}
          desc={t("dashboard.surveys.desc")}
        />

        <ServiceCard
          to="/account"
          icon={<IconAccount />}
          title={t("dashboard.account.title")}
          desc={t("dashboard.account.desc")}
        />

        {isHafsOrgMember && (
          <ServiceCard
            href="https://gmc.akademiya.kr"
            icon={<img src={gmcLogo} alt="" className={styles.iconImg} />}
            title={t("dashboard.gmcAuto.title")}
            desc={t("dashboard.gmcAuto.desc")}
            badge={<span className={styles.badgeBlue}>{t("dashboard.gmcAuto.badge")}</span>}
          />
        )}

        {/* 준비 중 — iq.akademiya.kr 오픈 시 href 연결 */}
        <ServiceCard
          disabled
          icon={<img src={imsiQuizLogo} alt="" className={styles.iconImg} />}
          title={t("dashboard.imsiQuiz.title")}
          desc={t("dashboard.imsiQuiz.desc")}
          badge={<span className={styles.badgeSoon}>{t("dashboard.comingSoon")}</span>}
        />

        {/* 준비 중 — hyproj.com 오픈 시 href 연결 */}
        <ServiceCard
          disabled
          icon={<img src={hyProjectLogo} alt="" className={styles.iconImg} />}
          title={t("dashboard.hyProject.title")}
          desc={t("dashboard.hyProject.desc")}
          badge={<span className={styles.badgeSoon}>{t("dashboard.comingSoon")}</span>}
        />
      </div>
    </div>
  );
}
