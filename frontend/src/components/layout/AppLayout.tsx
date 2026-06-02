import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { authApi } from "../../api/auth.api";
import { orgApi } from "../../api/org.api";
import NotificationBell from "../common/NotificationBell";
import { useTheme } from "../../hooks/useTheme";
import styles from "./AppLayout.module.css";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconClass() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconFlag() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconBug() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2l1.88 1.88" />
      <path d="M14.12 3.88 16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6"  x2="6"  y2="18" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1"  x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1"  y1="12" x2="3"  y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36" />
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconGmc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

// ── Layout component ──────────────────────────────────────────────────────────

export default function AppLayout() {
  const { t } = useTranslation();
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isHafsOrgMember, setIsHafsOrgMember] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  // HAFS 조직 가입 여부 확인 (사이드바 GMCAuto 메뉴 노출 조건)
  useEffect(() => {
    if (!user) return;
    orgApi.my()
      .then((res) => {
        const hafs = res.data.orgs.some(
          (org) => org.code.toUpperCase() === "HAFS"
        );
        setIsHafsOrgMember(hafs);
      })
      .catch(() => { /* 무시 */ });
  }, [user]);

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    clearAuth();
    navigate("/auth/login", { replace: true });
  }

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <div className={styles.layout}>
      {/* ── Mobile top header ── */}
      <header className={styles.mobileHeader}>
        <button
          className={styles.hamburger}
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <IconMenu />
        </button>
        <NavLink to="/" className={styles.mobileLogoLink} onClick={closeMobile}>
          <img src="/logo.png" className={styles.logoImg} alt="Akademiya" />
        </NavLink>
        <div className={styles.mobileHeaderRight}>
          <button
            className={styles.themeBtn}
            onClick={toggleTheme}
            title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
            aria-label="테마 전환"
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </button>
          <NotificationBell />
        </div>
      </header>

      {/* ── Sidebar overlay (mobile) ── */}
      {mobileOpen && (
        <div
          className={styles.overlay}
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <NavLink to="/" className={styles.logoLink} onClick={closeMobile}>
            <img src="/logo.png" className={styles.logoImg} alt="Akademiya" />
          </NavLink>
          <div className={styles.sidebarHeaderRight}>
            <span className={styles.desktopOnly}>
              <button
                className={styles.themeBtn}
                onClick={toggleTheme}
                title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
                aria-label="테마 전환"
              >
                {theme === "dark" ? <IconSun /> : <IconMoon />}
              </button>
            </span>
            <span className={styles.desktopOnly}><NotificationBell /></span>
            <button
              className={styles.closeSidebarBtn}
              onClick={closeMobile}
              aria-label="Close menu"
            >
              <IconX />
            </button>
          </div>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            onClick={closeMobile}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
          >
            <IconHome />
            <span>{t("nav.home")}</span>
          </NavLink>

          <NavLink
            to="/classes"
            onClick={closeMobile}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
          >
            <IconClass />
            <span>{t("nav.classes")}</span>
          </NavLink>

          <NavLink
            to="/reports"
            onClick={closeMobile}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
          >
            <IconFlag />
            <span>{t("nav.reports")}</span>
          </NavLink>

          <NavLink
            to="/calendar"
            onClick={closeMobile}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
          >
            <IconCalendar />
            <span>{t("nav.calendar")}</span>
          </NavLink>

          <NavLink
            to="/bug-report"
            onClick={closeMobile}
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
          >
            <IconBug />
            <span>{t("nav.bugReport")}</span>
          </NavLink>

          {/* GMCAuto — HAFS 조직 가입자에게만 표시 */}
          {isHafsOrgMember && (
            <a
              href="https://gmc.akademiya.kr"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.navItem}
              onClick={closeMobile}
            >
              <IconGmc />
              <span>{t("nav.gmcAuto")}</span>
              <span className={styles.externalBadge}>↗</span>
            </a>
          )}

          {user?.role === "admin" && (
            <NavLink
              to="/admin"
              onClick={closeMobile}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ""}`}
            >
              <IconShield />
              <span>{t("nav.admin")}</span>
            </NavLink>
          )}
        </nav>

        {/* ── Version badge ── */}
        <div className={styles.versionBadge}>
          Akademiya Web App version 1.0
        </div>

        <div className={styles.sidebarBottom}>
          <NavLink
            to="/profile"
            onClick={closeMobile}
            className={({ isActive }) => `${styles.bottomItem} ${isActive ? styles.navActive : ""}`}
          >
            <IconUser />
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.displayName}</span>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
          </NavLink>

          <button className={styles.logoutBtn} onClick={handleLogout} title={t("nav.logout")}>
            <IconLogout />
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
