import { useState, useEffect, useRef } from 'react'
import { NavLink, Link, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SessionData } from '../../types'
import NotificationBell from '../NotificationBell'
import styles from './GmcLayout.module.css'

const LANG_OPTIONS = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
] as const

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}
function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
function IconGlobe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}
function IconTicket() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9a3 3 0 0 1 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <line x1="13" y1="5" x2="13" y2="19" strokeDasharray="2 2" />
    </svg>
  )
}
function IconHistory() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}
function IconCode() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  )
}
function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
function IconX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function LanguageSelector() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className={styles.langSelector} ref={ref}>
      <button className={styles.iconBtn} onClick={() => setOpen(v => !v)} aria-label="언어 선택" title="언어 선택">
        <IconGlobe />
      </button>
      {open && (
        <div className={styles.langDropdown}>
          {LANG_OPTIONS.map(l => (
            <button
              key={l.code}
              className={`${styles.langOption} ${i18n.language.startsWith(l.code) ? styles.langOptionActive : ''}`}
              onClick={() => { i18n.changeLanguage(l.code); setOpen(false) }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface GmcLayoutProps {
  session: SessionData
  onLogout: () => void
  theme: string
  toggleTheme: () => void
}

export default function GmcLayout({ session, onLogout, theme, toggleTheme }: GmcLayoutProps) {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className={styles.layout}>
      <header className={styles.mobileHeader}>
        <button className={styles.hamburger} onClick={() => setMobileOpen(true)} aria-label="메뉴 열기"><IconMenu /></button>
        <img src="/logo_gmc.png" className={styles.logoImg} alt="GMCAuto" />
        <div className={styles.mobileHeaderRight}>
          <LanguageSelector />
          <button className={styles.iconBtn} onClick={toggleTheme} title={theme === 'dark' ? t('theme.light') : t('theme.dark')}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <NotificationBell sessionId={session.sessionId} />
        </div>
      </header>

      {mobileOpen && <div className={styles.overlay} onClick={closeMobile} aria-hidden="true" />}

      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logoBlock}>
            <img src="/logo_gmc.png" className={styles.logoImg} alt="GMCAuto" />
            <span className={styles.versionBadge}>{t('app.version')}</span>
          </div>
          <div className={styles.sidebarHeaderRight}>
            <span className={styles.desktopOnly}><LanguageSelector /></span>
            <span className={styles.desktopOnly}>
              <button className={styles.iconBtn} onClick={toggleTheme} title={theme === 'dark' ? t('theme.light') : t('theme.dark')}>
                {theme === 'dark' ? <IconSun /> : <IconMoon />}
              </button>
            </span>
            <span className={styles.desktopOnly}><NotificationBell sessionId={session.sessionId} /></span>
            <button className={styles.closeSidebarBtn} onClick={closeMobile} aria-label="메뉴 닫기"><IconX /></button>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.navSectionLabel}>GMC PASS</div>
          <NavLink to="/" end onClick={closeMobile} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
            <IconHome /><span>{t('nav.home')}</span>
          </NavLink>
          <NavLink to="/apply" onClick={closeMobile} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
            <IconTicket /><span>{t('nav.apply')}</span>
          </NavLink>
          <NavLink to="/history" onClick={closeMobile} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
            <IconHistory /><span>{t('nav.history')}</span>
          </NavLink>

          {(session.role ?? 0) >= 1 && (
            <>
              <div className={styles.navSectionLabel}>{t('nav.adminGroup', '관리자 도구')}</div>
              <NavLink to="/admin" onClick={closeMobile} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
                <IconShield /><span>{t('nav.dashboard')}</span>
              </NavLink>
            </>
          )}

          {session.developerMode && (
            <>
              <div className={styles.navSectionLabel}>{t('nav.developerTools', '개발자 도구')}</div>
              <NavLink to="/developer/keys" onClick={closeMobile} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navActive : ''}`}>
                <IconCode /><span>{t('nav.gmcApi', 'GMCAuto API')}</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className={styles.versionText}>GMCAuto Web App version 3.0.5</div>
        <div className={styles.versionLinks}>
          <Link to="/privacy" onClick={closeMobile} className={styles.versionLink}>{t('nav.privacyPolicy', '개인정보 처리방침')}</Link>
          <span className={styles.versionLinkSep}>·</span>
          <Link to="/terms" onClick={closeMobile} className={styles.versionLink}>{t('nav.termsOfUse', '이용약관')}</Link>
        </div>

        <div className={styles.sidebarBottom}>
          <NavLink to="/account" onClick={closeMobile} className={({ isActive }) => `${styles.bottomItem} ${isActive ? styles.navActive : ''}`}>
            <IconUser />
            <div className={styles.userInfo}>
              <span className={styles.userName}>{session.studentName || session.studentNo}</span>
              <span className={styles.userSub}>{session.studentNo}</span>
            </div>
          </NavLink>
          <button className={styles.logoutBtn} onClick={onLogout} title={t('nav.logout')}><IconLogout /></button>
        </div>
      </aside>

      <div className={styles.contentColumn}>
        <div className="top-bar">
          {t('app.contact')} &nbsp;/&nbsp; {t('app.madeWith')}
        </div>
        <main className={styles.content}>
          <Outlet />
        </main>
        <footer className="footer">
          <a href="https://akademiya.kr" target="_blank" rel="noopener noreferrer" className="powered-by-link">
            <img src={theme === 'light' ? '/poweredBy_light.png' : '/poweredBy_dark.png'} alt="Powered by Akademiya" className="powered-by-img" />
          </a>
          {t('app.unofficial')}<br />
          <strong style={{ color: 'var(--warning)' }}>{t('app.securityWarning')}</strong>
        </footer>
      </div>
    </div>
  )
}
