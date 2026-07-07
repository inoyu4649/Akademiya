import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { startAkademiyaLogin, consumeAkademiyaOAuthState } from '../utils/akademiyaOAuth'
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
}

export default function LoginPage({ onLogin, sessionExpired, theme, toggleTheme }: LoginPageProps) {
  const { t } = useTranslation()

  const [akStep, setAkStep]         = useState<AkStep>('idle')
  const [akUserInfo, setAkUserInfo]  = useState<AkUserInfo | null>(null)
  const [akLinkTicket, setAkLinkTicket] = useState('')
  const [akStudentNo, setAkStudentNo] = useState('')
  const [akPassword, setAkPassword]   = useState('')
  const [akError, setAkError]         = useState('')

  const verifyAkademiyaCode = useCallback(async (code: string, state: string | null) => {
    setAkStep('verifying')
    setAkError('')
    const codeVerifier = consumeAkademiyaOAuthState(state)
    if (!codeVerifier) {
      setAkError(t('auth.ak.verifyFailed'))
      setAkStep('idle')
      return
    }
    try {
      const res  = await fetch('/api/akademiya/oauth-callback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code, codeVerifier }),
      })
      const data = await res.json() as {
        success: boolean; message?: string;
        linked?: boolean; loginFailed?: boolean;
        sessionId?: string; studentNo?: string; studentName?: string; akademiyaEmail?: string | null;
        role?: number; needsPrivacyConsent?: boolean; needsTermsConsent?: boolean;
        userInfo?: AkUserInfo; linkTicket?: string;
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
          akademiyaEmail: data.akademiyaEmail ?? null,
          role: data.role ?? 0,
          needsPrivacyConsent: data.needsPrivacyConsent ?? false,
          needsTermsConsent: data.needsTermsConsent ?? false,
        })
        return
      }
      if (data.linked && data.loginFailed) {
        setAkUserInfo(data.userInfo ?? null)
        setAkLinkTicket(data.linkTicket ?? '')
        setAkStudentNo(data.studentNo || '')
        setAkStep('link_needed')
        setAkError(t('auth.ak.relink'))
        return
      }
      setAkUserInfo(data.userInfo ?? null)
      setAkLinkTicket(data.linkTicket ?? '')
      setAkStep('link_needed')
    } catch {
      setAkError(t('auth.serverError'))
      setAkStep('idle')
    }
  }, [t, onLogin])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    const state  = params.get('state')
    if (code) {
      queueMicrotask(() => verifyAkademiyaCode(code, state))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [verifyAkademiyaCode])

  const handleAkademiyaLogin = () => {
    startAkademiyaLogin().catch(() => setAkError(t('auth.serverError')))
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
          linkTicket: akLinkTicket,
          studentNo:  akStudentNo,
          password:   akPassword,
        }),
      })
      const data = await res.json() as {
        success: boolean; message?: string;
        sessionId: string; studentNo: string; studentName?: string; akademiyaEmail?: string | null;
        role?: number; needsPrivacyConsent?: boolean; needsTermsConsent?: boolean;
      }
      if (data.success) {
        localStorage.setItem('gmcauto_auth_method', 'akademiya')
        onLogin({
          sessionId: data.sessionId,
          studentNo: data.studentNo,
          studentName: data.studentName || '',
          akademiyaEmail: data.akademiyaEmail ?? null,
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
            <h1>GMCAuto 3</h1>
          </div>
          <p>{t('app.subtitle')}</p>
        </div>

        <div className="card-body">
          {sessionExpired && !akError && (
            <div className="alert alert-warning">{t('auth.sessionExpired')}</div>
          )}
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
              <button className="akademiya-login-btn" onClick={handleAkademiyaLogin}>
                <img
                  src="https://akademiya.kr/brand/akademiya-icon-32.png"
                  srcSet="https://akademiya.kr/brand/akademiya-icon-64.png 2x"
                  width="20" height="20" alt=""
                />
                <span>{t('auth.ak.loginBtn')}</span>
              </button>
              <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                {t('auth.viaAkademiya')}
              </p>
              <p style={{ textAlign: 'center', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
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
                onClick={() => { setAkStep('idle'); setAkError(''); setAkUserInfo(null); setAkLinkTicket('') }}>
                {t('common.cancel', '취소')}
              </button>
            </>
          )}

          {/* 기존 GMCAuto 계정 안내 — 3.1 버전에서 삭제 예정이므로 하드코딩(i18n 미적용) */}
          <div style={{
            marginTop: '20px', padding: '14px 16px',
            background: 'var(--primary-light)', border: '1px solid var(--primary)',
            borderRadius: 'var(--radius-sm)', fontSize: '12.5px', lineHeight: '1.7',
          }}>
            <strong style={{ color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>
              기존 GMCAuto 계정은 어떻게 되었나요?
            </strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              2026년 2학기를 맞이하여, GMCAuto의 대규모 업데이트가 진행되어 상위 서비스인 Akademiya 계정으로 일원화되었습니다.
              불편하시더라도 재등록 부탁드립니다. 로그인 방식은 학교 Google 계정을 사용하면 간단합니다.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
