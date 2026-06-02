import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import LoginPage from './components/LoginPage'
import Dashboard from './components/Dashboard'

const SESSION_KEY = 'gmcauto_session'
const THEME_KEY   = 'gmcauto_theme'

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function App() {
  const { t } = useTranslation()
  const [session, setSession]               = useState(null)
  const [bootChecked, setBootChecked]       = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  // 다크모드 (localStorage 저장, data-theme 속성으로 적용)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY)
    return saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  })

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }, [])

  // /auth/callback?code=XXX → /?code=XXX 처리 (Akademiya OAuth 콜백)
  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      const params = new URLSearchParams(window.location.search)
      const code   = params.get('code')
      window.history.replaceState({}, '', code ? `/?code=${encodeURIComponent(code)}` : '/')
    }
  }, [])

  // 페이지 로드 시 세션 복원
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { setBootChecked(true); return }
    try {
      const data = JSON.parse(saved)
      fetch(`/api/session/check?sessionId=${encodeURIComponent(data.sessionId)}`)
        .then(r => r.json())
        .then(check => {
          if (check.valid) {
            setSession({ ...data, role: check.role ?? data.role ?? 0 })
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

  const handleLogin = useCallback((sessionData) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
    setSessionExpired(false)
    setSession(sessionData)
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
      {/* 상단 정보 바 */}
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

      {/* 푸터 */}
      <footer className="footer">
        <a href="https://akademiya.kr" target="_blank" rel="noopener noreferrer" className="powered-by-link">
          <img src="/poweredBy_dark.png" alt="Powered by Akademiya" className="powered-by-img" />
        </a>
        {t('app.unofficial')}<br />
        <strong style={{ color: 'var(--warning)' }}>{t('app.securityWarning')}</strong>
      </footer>
    </>
  )
}

export default App
