import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SessionData } from '../../types'
import styles from './GmcLayout.module.css'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

type OsType = 'ios' | 'ipados' | 'android' | 'windows' | 'mac' | 'linux' | 'unknown'

function detectOs(): OsType {
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipados'
  if (/iPhone/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Windows/.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  if (/Linux/.test(ua)) return 'linux'
  return 'unknown'
}

function InstallGuide({ os }: { os: OsType }) {
  const { t } = useTranslation()
  const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(navigator.userAgent)

  if (os === 'ios' || os === 'ipados') {
    const device = os === 'ipados' ? 'iPad' : 'iPhone'
    return (
      <div>
        <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text)' }}>{t('install.iosTitle', { device })}</p>
        {!isSafari && (
          <div style={{ background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '13px', color: 'var(--text)' }}
            dangerouslySetInnerHTML={{ __html: t('install.iosNotSafari') }} />
        )}
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: 2 }}>
          <li dangerouslySetInnerHTML={{ __html: t('install.step1') }} />
          {os === 'ipados' ? (
            <>
              <li dangerouslySetInnerHTML={{ __html: t('install.iosIpadStep2') }} />
              <li dangerouslySetInnerHTML={{ __html: t('install.iosIpadStep3') }} />
            </>
          ) : (
            <>
              <li dangerouslySetInnerHTML={{ __html: t('install.iosStep2') }} />
              <li dangerouslySetInnerHTML={{ __html: t('install.iosStep3') }} />
              <li dangerouslySetInnerHTML={{ __html: t('install.iosStep4') }} />
            </>
          )}
          <li dangerouslySetInnerHTML={{ __html: t('install.iosStep5') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.iosStep6') }} />
        </ol>
      </div>
    )
  }

  if (os === 'android') {
    return (
      <div>
        <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text)' }}>{t('install.androidTitle')}</p>
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: 2 }}>
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep1') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep2') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep3') }} />
          <li dangerouslySetInnerHTML={{ __html: t('install.androidStep4') }} />
        </ol>
      </div>
    )
  }

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--text)' }}>{t('install.pcTitle')}</p>
      <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text)', lineHeight: 2 }}>
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep1') }} />
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep2') }} />
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep3') }} />
        <li dangerouslySetInnerHTML={{ __html: t('install.pcStep4') }} />
      </ol>
    </div>
  )
}

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
function IconBell() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
  onAccountDelete: () => void
  theme: string
  toggleTheme: () => void
}

export default function GmcLayout({ session, onLogout, onAccountDelete, theme, toggleTheme }: GmcLayoutProps) {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [isPwa, setIsPwa] = useState(false)
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [installOs, setInstallOs] = useState<OsType>('unknown')

  useEffect(() => {
    const pwa =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    queueMicrotask(() => setIsPwa(pwa))
    if (pwa && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setNotifEnabled(!!sub))
        .catch(() => {})
    }
  }, [])

  const handleNotifToggle = useCallback(async () => {
    if (!isPwa) {
      setInstallOs(detectOs())
      setShowInstallModal(true)
      return
    }
    if (notifLoading) return
    setNotifLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (notifEnabled) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
        await fetch('/api/push/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId }),
        })
        setNotifEnabled(false)
      } else {
        if (!('Notification' in window) || Notification.permission === 'denied') return
        const vapidRes = await fetch('/api/push/vapid-public-key')
        const { publicKey } = await vapidRes.json() as { publicKey: string }
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        })
        const subJSON = JSON.parse(JSON.stringify(sub)) as { endpoint: string; keys?: { p256dh?: string; auth?: string } }
        await fetch('/api/push/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId, endpoint: subJSON.endpoint, p256dh: subJSON.keys?.p256dh ?? '', auth: subJSON.keys?.auth ?? '' }),
        })
        setNotifEnabled(true)
      }
    } catch { /* 무시 */ }
    finally { setNotifLoading(false) }
  }, [isPwa, notifEnabled, notifLoading, session.sessionId])

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className={styles.layout}>
      {showInstallModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg, 14px)', padding: '24px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--text)', fontSize: '16px' }}>{t('install.modalTitle')}</h3>
            <InstallGuide os={installOs} />
            <button className="btn btn-primary" onClick={() => setShowInstallModal(false)} style={{ marginTop: '20px', width: '100%' }}>
              {t('install.modalClose')}
            </button>
          </div>
        </div>
      )}

      <header className={styles.mobileHeader}>
        <button className={styles.hamburger} onClick={() => setMobileOpen(true)} aria-label="메뉴 열기"><IconMenu /></button>
        <img src="/logo_gmc.png" className={styles.logoImg} alt="GMCAuto" />
        <div className={styles.mobileHeaderRight}>
          <LanguageSelector />
          <button className={styles.iconBtn} onClick={toggleTheme} title={theme === 'dark' ? t('theme.light') : t('theme.dark')}>
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button className={styles.iconBtn} onClick={handleNotifToggle} title={notifEnabled ? t('home.notifOn') : t('home.notifOff')}
            style={notifEnabled ? { color: 'var(--primary)' } : undefined}>
            <IconBell />
          </button>
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
            <span className={styles.desktopOnly}>
              <button className={styles.iconBtn} onClick={handleNotifToggle} title={notifEnabled ? t('home.notifOn') : t('home.notifOff')}
                style={notifEnabled ? { color: 'var(--primary)' } : undefined}>
                <IconBell />
              </button>
            </span>
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
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{session.studentName || session.studentNo}</span>
            <span className={styles.userSub}>{session.studentNo}</span>
          </div>
          <button className={styles.iconBtn} onClick={onAccountDelete} title={t('nav.withdraw')} style={{ color: 'var(--danger)' }}>
            {t('nav.withdraw')}
          </button>
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
