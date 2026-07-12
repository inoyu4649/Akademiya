import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import './App.css'
import LoginPage from './components/LoginPage'
import GmcLayout from './components/layout/GmcLayout'
import HomePage, { PassHistory } from './components/Dashboard'
import PassForm from './components/PassForm'
import PrivacyPolicyModal from './components/PrivacyPolicyModal'
import TermsOfUseModal from './components/TermsOfUseModal'
import PatchNotesModal, { GMC_PATCH_NOTES_VERSION } from './components/PatchNotesModal'
import { startAkademiyaLogin } from './utils/akademiyaOAuth'
import type { SessionData, LogEntry } from './types'

const AdminDashboard = lazy(() => import('./components/AdminDashboard'))
const AccountPage = lazy(() => import('./components/AccountPage'))
const PolicyPage = lazy(() => import('./components/PolicyPage'))
const ApiKeysPage = lazy(() => import('./components/developer/ApiKeysPage'))
const ApiKeyCreatePage = lazy(() => import('./components/developer/ApiKeyCreatePage'))
const ApiKeyDetailPage = lazy(() => import('./components/developer/ApiKeyDetailPage'))

const SESSION_KEY = 'gmcauto_session'
const PATCH_NOTES_SEEN_KEY = 'gmcauto_patch_notes_seen_version'

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme)
}

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function RouteLoadingSpinner() {
  return (
    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
      <div className="spinner" style={{ margin: '0 auto 12px', width: '26px', height: '26px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
    </div>
  )
}

function App() {
  const { t } = useTranslation()
  const [session, setSession]               = useState<SessionData | null>(null)
  const [bootChecked, setBootChecked]       = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  const [showTermsModal, setShowTermsModal] = useState(false)
  const [patchNotesDismissed, setPatchNotesDismissed] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])

  // 재접속/새로고침 시에는 항상 시스템(브라우저·PWA) 테마부터 시작 — 이전 토글 선택은 저장하지 않음
  const [theme, setTheme] = useState<string>(getSystemTheme)
  // 이번 세션에서 토글 버튼으로 수동 전환했는지 (메모리에만 유지, 새로고침하면 사라짐)
  const themeManualRef = useRef(false)

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    setLogs(prev => [...prev, { time, message, type }])
  }, [])

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
      const state  = params.get('state')
      const qs = new URLSearchParams()
      if (code) qs.set('code', code)
      if (state) qs.set('state', state)
      window.history.replaceState({}, '', qs.toString() ? `/?${qs.toString()}` : '/')
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    if (!saved) { queueMicrotask(() => setBootChecked(true)); return }
    try {
      const data = JSON.parse(saved) as SessionData
      fetch(`/api/session/check?sessionId=${encodeURIComponent(data.sessionId)}`)
        .then(r => r.json())
        .then((check: {
          valid: boolean; role?: number; developerMode?: boolean;
          needsPrivacyConsent?: boolean; needsTermsConsent?: boolean;
          privacyConsentedVersion?: number; termsConsentedVersion?: number;
        }) => {
          if (check.valid) {
            setSession({
              ...data,
              role: check.role ?? data.role ?? 0,
              developerMode: check.developerMode ?? data.developerMode ?? false,
              privacyConsentedVersion: check.privacyConsentedVersion ?? 0,
              termsConsentedVersion: check.termsConsentedVersion ?? 0,
            })
            if (check.needsPrivacyConsent) {
              setShowPrivacyModal(true)
            } else if (check.needsTermsConsent) {
              setShowTermsModal(true)
            }
          } else {
            localStorage.removeItem(SESSION_KEY)
            // PWA + Akademiya 로그인이었다면 자동으로 재인증 (무한루프는 sessionStorage flag로 방지)
            const authMethod = localStorage.getItem('gmcauto_auth_method')
            const isPwaMode =
              window.matchMedia('(display-mode: standalone)').matches ||
              (navigator as Navigator & { standalone?: boolean }).standalone === true
            const autoRedirAttempted = sessionStorage.getItem('gmcauto_auto_redir') === '1'
            if (isPwaMode && authMethod === 'akademiya' && !autoRedirAttempted) {
              sessionStorage.setItem('gmcauto_auto_redir', '1')
              startAkademiyaLogin().catch(() => setSessionExpired(true))
              return
            }
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
      queueMicrotask(() => setBootChecked(true))
    }
  }, [])

  const handleLogin = useCallback((sessionData: SessionData) => {
    sessionStorage.removeItem('gmcauto_auto_redir') // 자동 재인증 성공 → 루프 방지 플래그 초기화
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

  // 탈퇴 확인/삭제 API 호출은 AccountPage가 직접 수행하고, 성공 후 이 콜백으로 세션만 정리한다.
  const handleAccountDeleted = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }, [])

  // 학번/비밀번호 수정, 개발자 모드 토글 등 AccountPage에서 세션 일부를 갱신할 때 사용
  const handleSessionUpdate = useCallback((patch: Partial<SessionData>) => {
    setSession(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      localStorage.setItem(SESSION_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  // 개인정보/약관 동의가 끝난 로그인 사용자에게 업데이트 후 최초 접속 시 패치노트 안내
  // (개인정보 처리방침 모달의 버전 비교·표시 패턴을 재사용 — 서버 동의 기록 없이 localStorage로 판단)
  const patchNotesSeenVersion = Number(localStorage.getItem(PATCH_NOTES_SEEN_KEY) || '0')
  const showPatchNotes =
    !!session && !showPrivacyModal && !showTermsModal &&
    !patchNotesDismissed && patchNotesSeenVersion < GMC_PATCH_NOTES_VERSION

  return (
    <BrowserRouter>
      {showPrivacyModal && session && (
        <PrivacyPolicyModal
          sessionId={session.sessionId}
          consentedVersion={session.privacyConsentedVersion ?? 0}
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
          consentedVersion={session.termsConsentedVersion ?? 0}
          onConsented={() => setShowTermsModal(false)}
        />
      )}
      {showPatchNotes && (
        <PatchNotesModal
          onClose={() => {
            localStorage.setItem(PATCH_NOTES_SEEN_KEY, String(GMC_PATCH_NOTES_VERSION))
            setPatchNotesDismissed(true)
          }}
        />
      )}

      {!bootChecked
        ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: '24px', height: '24px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
            {t('app.loading')}
          </div>
        )
        : !session
          ? (
            <>
              <div className="top-bar">
                {t('app.contact')} &nbsp;/&nbsp; {t('app.madeWith')}
              </div>
              <LoginPage onLogin={handleLogin} sessionExpired={sessionExpired} theme={theme} toggleTheme={toggleTheme} />
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
          : (
            <Routes>
              <Route
                element={
                  <GmcLayout
                    session={session}
                    onLogout={handleLogout}
                    theme={theme}
                    toggleTheme={toggleTheme}
                  />
                }
              >
                <Route index element={<HomePage session={session} logs={logs} addLog={addLog} />} />
                <Route path="apply" element={<PassForm session={session} addLog={addLog} />} />
                <Route path="history" element={<PassHistory session={session} />} />
                <Route
                  path="admin"
                  element={
                    (session.role ?? 0) >= 1 ? (
                      <Suspense fallback={<RouteLoadingSpinner />}>
                        <AdminDashboard session={session} />
                      </Suspense>
                    ) : <Navigate to="/" replace />
                  }
                />
                <Route
                  path="account"
                  element={
                    <Suspense fallback={<RouteLoadingSpinner />}>
                      <AccountPage
                        session={session}
                        onSessionUpdate={handleSessionUpdate}
                        onAccountDeleted={handleAccountDeleted}
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="privacy"
                  element={<Suspense fallback={<RouteLoadingSpinner />}><PolicyPage kind="privacy" /></Suspense>}
                />
                <Route
                  path="terms"
                  element={<Suspense fallback={<RouteLoadingSpinner />}><PolicyPage kind="terms" /></Suspense>}
                />
                <Route
                  path="developer/keys"
                  element={
                    session.developerMode ? (
                      <Suspense fallback={<RouteLoadingSpinner />}><ApiKeysPage session={session} /></Suspense>
                    ) : <Navigate to="/" replace />
                  }
                />
                <Route
                  path="developer/keys/new"
                  element={
                    session.developerMode ? (
                      <Suspense fallback={<RouteLoadingSpinner />}><ApiKeyCreatePage session={session} /></Suspense>
                    ) : <Navigate to="/" replace />
                  }
                />
                <Route
                  path="developer/keys/:id"
                  element={
                    session.developerMode ? (
                      <Suspense fallback={<RouteLoadingSpinner />}><ApiKeyDetailPage session={session} /></Suspense>
                    ) : <Navigate to="/" replace />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          )
      }
    </BrowserRouter>
  )
}

export default App
