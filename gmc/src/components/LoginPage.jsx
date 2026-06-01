import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function LoginPage({ onLogin, sessionExpired }) {
  const { t } = useTranslation()
  const [studentNo, setStudentNo] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentNo, password }),
      })
      const data = await res.json()

      if (data.success) {
        onLogin({
          sessionId: data.sessionId,
          studentNo: data.studentNo,
          studentName: data.studentName || '',
          role: data.role ?? 0,
        })
      } else {
        setError(data.message || '로그인에 실패했습니다.')
      }
    } catch {
      setError(t('auth.serverError', '서버에 연결할 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="card login-card">
        <div className="login-logo">
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>

        <div className="card-body">
          {sessionExpired && !error && (
            <div className="alert alert-warning">
              {t('auth.sessionExpired')}
            </div>
          )}
          {error && (
            <div className="alert alert-error">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="studentNo">{t('auth.studentNoLabel')}</label>
              <input
                id="studentNo"
                type="text"
                placeholder={t('auth.studentNoPlaceholder')}
                value={studentNo}
                onChange={(e) => setStudentNo(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">{t('auth.passwordLabel')}</label>
              <input
                id="password"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading || !studentNo || !password}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  {t('auth.logging')}
                </>
              ) : t('auth.loginBtn')}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {t('auth.loginHelp')}<br />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {t('auth.recaptchaNote')}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
