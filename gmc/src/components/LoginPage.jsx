import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

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

export default function LoginPage({ onLogin, sessionExpired, theme, toggleTheme }) {
  const { t } = useTranslation()
  const [tab, setTab]           = useState('gmc')   // 'gmc' | 'akademiya'
  const [studentNo, setStudentNo] = useState('')
  const [password, setPassword]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // Akademiya OAuth
  const [akStep, setAkStep]         = useState('idle')  // 'idle'|'verifying'|'link_needed'|'linking'
  const [akUserInfo, setAkUserInfo]  = useState(null)
  const [akStudentNo, setAkStudentNo] = useState('')
  const [akPassword, setAkPassword]   = useState('')
  const [akError, setAkError]         = useState('')

  // URL ?code= 파라미터 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    if (code) {
      setTab('akademiya')
      verifyAkademiyaCode(code)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // ── GMCAuto 계정 로그인 ───────────────────────────────────────────────────
  const handleGmcSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ studentNo, password }),
      })
      const data = await res.json()
      if (data.success) {
        onLogin({ sessionId: data.sessionId, studentNo: data.studentNo, studentName: data.studentName || '', role: data.role ?? 0 })
      } else {
        setError(data.message || t('auth.loginFailed', '로그인에 실패했습니다.'))
      }
    } catch {
      setError(t('auth.serverError', '서버에 연결할 수 없습니다.'))
    } finally {
      setLoading(false)
    }
  }

  // ── Akademiya OAuth ────────────────────────────────────────────────────────
  const handleAkademiyaLogin = () => {
    const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback')
    window.location.href = `https://akademiya.kr/auth/gmcauto-oauth?redirect_uri=${redirectUri}`
  }

  const verifyAkademiyaCode = async (code) => {
    setAkStep('verifying')
    setAkError('')
    try {
      const res  = await fetch('/api/akademiya/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!data.success) {
        setAkError(data.message || t('auth.ak.verifyFailed'))
        setAkStep('idle')
        return
      }
      if (data.linked && !data.loginFailed) {
        onLogin({ sessionId: data.sessionId, studentNo: data.studentNo, studentName: data.studentName || '', role: data.role ?? 0 })
        return
      }
      if (data.linked && data.loginFailed) {
        setAkUserInfo({ ...data.userInfo, akademiyaUserId: data.userInfo?.akademiyaUserId })
        setAkStudentNo(data.studentNo || '')
        setAkStep('link_needed')
        setAkError(t('auth.ak.relink'))
        return
      }
      setAkUserInfo(data.userInfo)
      setAkStep('link_needed')
    } catch {
      setAkError(t('auth.serverError'))
      setAkStep('idle')
    }
  }

  const handleAkademiyaLink = async (e) => {
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
      const data = await res.json()
      if (data.success) {
        onLogin({ sessionId: data.sessionId, studentNo: data.studentNo, studentName: data.studentName || '', role: data.role ?? 0 })
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
      {/* 테마 버튼 */}
      <button
        onClick={toggleTheme}
        className="btn btn-outline"
        style={{ position: 'fixed', top: '36px', right: '16px', padding: '7px 10px', zIndex: 10 }}
        title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
      >
        {theme === 'dark' ? <IconSun /> : <IconMoon />}
      </button>

      <div className="card login-card">
        {/* 로고 */}
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

        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'gmc',       label: t('auth.tabGmc',       'GMCAuto 계정') },
            { id: 'akademiya', label: t('auth.tabAkademiya', 'Akademiya 로그인') },
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

        <div className="card-body">
          {sessionExpired && tab === 'gmc' && !error && (
            <div className="alert alert-warning">{t('auth.sessionExpired')}</div>
          )}

          {/* ── GMCAuto 계정 ── */}
          {tab === 'gmc' && (
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

          {/* ── Akademiya 로그인 ── */}
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
                  </div>
                  <button className="btn btn-primary btn-block btn-lg" onClick={handleAkademiyaLogin}>
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
    </div>
  )
}
