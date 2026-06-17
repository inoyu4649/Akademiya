import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionData } from '../types'

interface LoginPageProps {
  onLogin: (sessionData: SessionData) => void
  sessionExpired: boolean
  theme: string
  toggleTheme: () => void
}

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1"  x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}
function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

type AkStep = 'idle' | 'verifying' | 'link_needed' | 'linking'

interface AkUserInfo {
  displayName?: string
  email?: string
  hafsOrgPerm?: number
  gmcRole?: number
  akademiyaUserId?: number
}

function detectIsPwa(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export default function LoginPage({ onLogin, sessionExpired, theme, toggleTheme }: LoginPageProps) {
  const { t } = useTranslation()
  const [isPwa]                 = useState(detectIsPwa)
  const [tab, setTab]           = useState<'gmc' | 'akademiya'>('akademiya')
  const [studentNo, setStudentNo] = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const [showAkWarning, setShowAkWarning] = useState(false)
  const [akStep, setAkStep]         = useState<AkStep>('idle')
  const [akUserInfo, setAkUserInfo]  = useState<AkUserInfo | null>(null)
  const [akStudentNo, setAkStudentNo] = useState('')
  const [akPassword, setAkPassword]   = useState('')
  const [akError, setAkError]         = useState('')

  const verifyAkademiyaCode = useCallback(async (code: string) => {
    setAkStep('verifying')
    setAkError('')
    try {
      const res  = await fetch('/api/akademiya/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code }),
      })
      const data = await res.json() as {
        success: boolean; message?: string;
        linked?: boolean; loginFailed?: boolean;
        sessionId?: string; studentNo?: string; studentName?: string;
        role?: number; needsPrivacyConsent?: boolean; needsTermsConsent?: boolean;
        userInfo?: AkUserInfo;
      }
      if (!data.success) {
        setAkError(data.message || t('auth.ak.verifyFailed'))
        setAkStep('idle')
        return
      }
      if (data.linked && !data.loginFailed) {
        localStorage.setItem('gmcauto_auth_method', 'akademiya')
        onLogin({
          sessionId: data.sessionId!,
          studentNo: data.studentNo!,
          studentName: data.studentName || '',
          role: data.role ?? 0,
          needsPrivacyConsent: data.needsPrivacyConsent ?? false,
          needsTermsConsent: data.needsTermsConsent ?? false,
        })
        return
      }
      if (data.linked && data.loginFailed) {
        setAkUserInfo({ ...data.userInfo, akademiyaUserId: data.userInfo?.akademiyaUserId })
        setAkStudentNo(data.studentNo || '')
        setAkStep('link_needed')
        setAkError(t('auth.ak.relink'))
        return
      }
      setAkUserInfo(data.userInfo ?? null)
      setAkStep('link_needed')
    } catch {
      setAkError(t('auth.serverError'))
      setAkStep('idle')
    }
  }, [t, onLogin])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    if (code) {
      queueMicrotask(() => {
        setTab('akademiya')
        verifyAkademiyaCode(code)
      })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [verifyAkademiyaCode])

  const handleGmcSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ studentNo, password }),
      })
      const data = await res.json() as {
        success: boolean; message?: string;
        sessionId: string; studentNo: string; studentName?: string;
        role?: number; needsPrivacyConsent?: boolean; needsTermsConsent?: boolean;
      }
      if (data.success) {
        onLogin({
          sessionId: data.sessionId,
          studentNo: data.studentNo,
          studentName: data.studentName || '',
          role: data.role ?? 0,
          needsPrivacyConsent: data.needsPrivacyConsent ?? false,
          needsTermsConsent: data.needsTermsConsent ?? false,
        })
      } else {
        setError(data.message || t('auth.loginFailed', '로그인에 실패했습니다.'))
      }
    } catch {
      setError(t('auth.serverError', '서버에 연결할 수 없습니다.'))
    } finally {
      setLoading(false)
    }
  }

  const handleAkademiyaLogin = () => {
    const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback')
    window.location.href = `https://akademiya.kr/auth/gmcauto-oauth?redirect_uri=${redirectUri}`
  }

  const handleAkademiyaLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setAkError('')
    setAkStep('linking')
    try {
      const res  = await fetch('/api/akademiya/link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          akademiyaUserId: akUserInfo?.akademiyaUserId,
          akademiyaEmail:  akUserInfo?.email,
          studentNo:       akStudentNo,
          password:        akPassword,
          gmcRole:         akUserInfo?.gmcRole ?? 0,
        }),
      })
      const data = await res.json() as {
        success: boolean; message?: string;
        sessionId: string; studentNo: string; studentName?: string;
        role?: number; needsPrivacyConsent?: boolean; needsTermsConsent?: boolean;
      }
      if (data.success) {
        localStorage.setItem('gmcauto_auth_method', 'akademiya')
        onLogin({
          sessionId: data.sessionId,
          studentNo: data.studentNo,
          studentName: data.studentName || '',
          role: data.role ?? 0,
          needsPrivacyConsent: data.needsPrivacyConsent ?? true,
          needsTermsConsent: data.needsTermsConsent ?? true,
        })
      } else {
        setAkError(data.message || t('auth.ak.linkFailed'))
        setAkStep('link_needed')
      }
    } catch {
      setAkError(t('auth.serverError'))
      setAkStep('link_needed')
    }
  }

  return (
    <div className="login-container">
      <button
        onClick={toggleTheme}
        className="btn btn-outline"
        style={{ position: 'fixed', top: '36px', right: '16px', padding: '7px 10px', zIndex: 10 }}
        title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>

      <div className="card login-card">
        <div className="login-logo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '6px' }}>
            <img
              src="/logo_gmc.png"
              alt="GMCAuto"
              style={{ height: '48px', objectFit: 'contain' }}
            />
            <h1>GMCAuto 2</h1>
          </div>
          <p>{t('app.subtitle')}</p>
        </div>

        {!isPwa && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'akademiya' as const, label: t('auth.tabAkademiya', 'Akademiya 로그인') },
              { id: 'gmc' as const,       label: t('auth.tabGmc',       'GMCAuto 계정') },
            ].map(tb => (
              <button
                key={tb.id}
                onClick={() => { setTab(tb.id); setError(''); setAkError(''); setAkStep('idle') }}
                style={{
                  flex: 1, padding: '12px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: '13.5px', fontWeight: tab === tb.id ? '600' : '400',
                  color: tab === tb.id ? 'var(--primary)' : 'var(--text-secondary)',
                  borderBottom: tab === tb.id ? '2px solid var(--primary)' : '2px solid transparent',
                  transition: 'all 0.2s',
                }}
              >
                {tb.label}
              </button>
            ))}
          </div>
        )}

        <div className="card-body">
          {isPwa && (
            <p style={{ textAlign: 'center', marginBottom: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('auth.pwaAkademiyaOnly', '설치된 앱에서는 Akademiya 로그인만 사용할 수 있습니다.')}
            </p>
          )}
          {sessionExpired && tab === 'akademiya' && !akError && (
            <div className="alert alert-warning">{t('auth.sessionExpired')}</div>
          )}

          {tab === 'gmc' && !isPwa && (
            <>
              {error && <div className="alert alert-error">{error}</div>}
              <form onSubmit={handleGmcSubmit}>
                <div className="form-group">
                  <label htmlFor="studentNo">{t('auth.studentNoLabel')}</label>
                  <input id="studentNo" type="text" placeholder={t('auth.studentNoPlaceholder')}
                    value={studentNo} onChange={e => setStudentNo(e.target.value)}
                    autoComplete="username" required />
                </div>
                <div className="form-group">
                  <label htmlFor="password">{t('auth.passwordLabel')}</label>
                  <input id="password" type="password" placeholder={t('auth.passwordPlaceholder')}
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" required />
                </div>
                <button type="submit" className="btn btn-primary btn-block btn-lg"
                  disabled={loading || !studentNo || !password}>
                  {loading ? <><span className="spinner" />{t('auth.logging')}</> : t('auth.loginBtn')}
                </button>
              </form>
              <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {t('auth.loginHelp')}<br />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('auth.recaptchaNote')}</span>
              </p>
            </>
          )}

          {tab === 'akademiya' && (
            <>
              {akError && <div className="alert alert-error">{akError}</div>}

              {akStep === 'idle' && (
                <>
                  <div style={{
                    padding: '14px 16px', background: 'var(--primary-light)',
                    borderRadius: 'var(--radius-sm)', marginBottom: '20px',
                    fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6',
                  }}>
                    <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>
                      {t('auth.ak.desc')}
                    </strong>
                    {t('auth.ak.descSub')}
                    <br />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'inline-block' }}>
                      {t('auth.ak.descSub2')}
                    </span>
                  </div>
                  <button className="btn btn-primary btn-block btn-lg" onClick={() => setShowAkWarning(true)}>
                    {t('auth.ak.loginBtn')}
                  </button>
                  <p style={{ textAlign: 'center', marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {t('auth.ak.hafsOnly')}
                  </p>
                </>
              )}

              {akStep === 'verifying' && (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)', width: '28px', height: '28px' }} />
                  {t('auth.ak.verifying')}
                </div>
              )}

              {(akStep === 'link_needed' || akStep === 'linking') && akUserInfo && (
                <>
                  <div style={{
                    padding: '10px 14px', background: 'var(--primary-light)',
                    borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '13px',
                  }}>
                    <strong style={{ color: 'var(--primary)' }}>{akUserInfo.displayName}</strong>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{akUserInfo.email}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    {t('auth.ak.linkDesc')}
                  </p>
                  <form onSubmit={handleAkademiyaLink}>
                    <div className="form-group">
                      <label htmlFor="akStudentNo">{t('auth.studentNoLabel')}</label>
                      <input id="akStudentNo" type="text" placeholder={t('auth.studentNoPlaceholder')}
                        value={akStudentNo} onChange={e => setAkStudentNo(e.target.value)}
                        autoComplete="username" required />
                    </div>
                    <div className="form-group">
                      <label htmlFor="akPassword">{t('auth.ak.goingPasswordLabel')}</label>
                      <input id="akPassword" type="password" placeholder={t('auth.ak.goingPasswordPlaceholder')}
                        value={akPassword} onChange={e => setAkPassword(e.target.value)}
                        autoComplete="current-password" required />
                    </div>
                    <button type="submit" className="btn btn-primary btn-block btn-lg"
                      disabled={akStep === 'linking' || !akStudentNo || !akPassword}>
                      {akStep === 'linking' ? <><span className="spinner" />{t('auth.logging')}</> : t('auth.ak.linkBtn')}
                    </button>
                  </form>
                  <button className="btn btn-outline" style={{ width: '100%', marginTop: '10px', fontSize: '13px' }}
                    onClick={() => { setAkStep('idle'); setAkError(''); setAkUserInfo(null) }}>
                    {t('common.cancel', '취소')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showAkWarning && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
          onClick={() => setShowAkWarning(false)}
        >
          <div
            className="card"
            style={{ maxWidth: '360px', margin: '16px', padding: '24px 20px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>
              {t('auth.ak.warningTitle')}
            </h3>
            <p style={{ fontSize: '13.5px', lineHeight: '1.7', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              {t('auth.ak.hafsGoogleWarning')}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowAkWarning(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }}
                onClick={() => { setShowAkWarning(false); handleAkademiyaLogin() }}>
                {t('auth.ak.confirmProceed')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
