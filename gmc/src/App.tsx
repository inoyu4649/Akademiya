import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import LoginPage from './components/LoginPage'
import Dashboard from './components/Dashboard'
import PrivacyPolicyModal from './components/PrivacyPolicyModal'
import TermsOfUseModal from './components/TermsOfUseModal'
import type { SessionData } from './types'

const SESSION_KEY = 'gmcauto_session'

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme)
}

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function App() {
  const { t } = useTranslation()
  const [session, setSession]               = useState<SessionData | null>(null)
  const [bootChecked, setBootChecked]       = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)

  // 재접속/새로고침 시에는 항상 시스템(브라우저·PWA) 테마부터 시작 — 이전 토글 선택은 저장하지 않음
  const [theme, setTheme] = useState<string>(getSystemTheme)
  // 이번 세션에서 토글 버튼으로 수동 전환했는지 (메모리에만 유지, 새로고침하면 사라짐)
  const themeManualRef = useRef(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // 수동 전환 전까지는 브라우저/PWA의 시스템 테마 변경을 실시간으로 반영
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (!themeManualRef.current) setTheme(getSystemTheme())
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggleTheme = useCallback(() => {
    themeManualRef.current = true
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      const params = new URLSearchParams(window.location.search)
      const code   = params.get('code')
      window.history.replaceState({}, '', code ? `/?code=${encodeURIComponent(code)}` : '/')
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { setBootChecked(true); return }
    try {
      const data = JSON.parse(saved) as SessionData
      fetch(`/api/session/check?sessionId=${encodeURIComponent(data.sessionId)}`)
        .then(r => r.json())
        .then((check: { valid: boolean; role?: number; needsPrivacyConsent?: boolean; needsTermsConsent?: boolean }) => {
          if (check.valid) {
            setSession({ ...data, role: check.role ?? data.role ?? 0 })
            if (check.needsPrivacyConsent) {
              setShowPrivacyModal(true)
            } else if (check.needsTermsConsent) {
              setShowTermsModal(true)
            }
          } else {
            localStorage.removeItem(SESSION_KEY)
            setSessionExpired(true)
          }
        })
        .catch(() => {
          localStorage.removeItem(SESSION_KEY)
          setSessionExpired(true)
        })
        .finally(() => setBootChecked(true))
    } catch {
      localStorage.removeItem(SESSION_KEY)
      setBootChecked(true)
    }
  }, [])

  const handleLogin = useCallback((sessionData: SessionData) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
    setSessionExpired(false)
    setSession(sessionData)
    if (sessionData.needsPrivacyConsent) {
      setShowPrivacyModal(true)
    } else if (sessionData.needsTermsConsent) {
      setShowTermsModal(true)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    if (session?.sessionId) {
      try {
        await fetch('/api/logout', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sessionId: session.sessionId }),
        })
      } catch { /* ignore */ }
    }
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }, [session])

  const handleAccountDelete = useCallback(async () => {
    if (!confirm(t('admin.withdrawConfirm', '탈퇴하면 저장된 비밀번호가 삭제되어 자동 신청이 불가합니다.\n정말 탈퇴하시겠습니까?'))) return
    if (session?.sessionId) {
      try {
        await fetch('/api/account/delete', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sessionId: session.sessionId }),
        })
      } catch { /* ignore */ }
    }
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }, [session, t])

  return (
    <>
      {showPrivacyModal && session && (
        <PrivacyPolicyModal
          sessionId={session.sessionId}
          onConsented={() => {
            setShowPrivacyModal(false)
            fetch(`/api/terms/version`)
              .then(r => r.json())
              .then(() => {
                return fetch(`/api/session/check?sessionId=${encodeURIComponent(session.sessionId)}`)
                  .then(r => r.json())
                  .then((check: { needsTermsConsent?: boolean }) => { if (check.needsTermsConsent) setShowTermsModal(true) })
              })
              .catch(() => {})
          }}
        />
      )}
      {!showPrivacyModal && showTermsModal && session && (
        <TermsOfUseModal
          sessionId={session.sessionId}
          onConsented={() => setShowTermsModal(false)}
        />
      )}

      <div className="top-bar">
        {t('app.contact')} &nbsp;/&nbsp; {t('app.madeWith')}
      </div>

      {!bootChecked
        ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: '24px', height: '24px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
            {t('app.loading')}
          </div>
        )
        : !session
          ? <LoginPage onLogin={handleLogin} sessionExpired={sessionExpired} theme={theme} toggleTheme={toggleTheme} />
          : <Dashboard session={session} onLogout={handleLogout} onAccountDelete={handleAccountDelete} theme={theme} toggleTheme={toggleTheme} />
      }

      <footer className="footer">
        <a href="https://akademiya.kr" target="_blank" rel="noopener noreferrer" className="powered-by-link">
          <img
            src={theme === 'light' ? '/poweredBy_light.png' : '/poweredBy_dark.png'}
            alt="Powered by Akademiya"
            className="powered-by-img"
          />
        </a>
        {t('app.unofficial')}<br />
        <strong style={{ color: 'var(--warning)' }}>{t('app.securityWarning')}</strong>
      </footer>
    </>
  )
}

export default App
