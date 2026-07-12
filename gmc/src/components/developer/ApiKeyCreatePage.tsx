import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SessionData } from '../../types'
import SecretRevealModal from './SecretRevealModal'
import styles from './Developer.module.css'

interface ApiKeyCreatePageProps {
  session: SessionData
}

// 서버의 maxScopesForRole(gmc/server/index.ts)과 대응하는 UI 캡 — 실제 권한 재검증은 서버가 수행
const OPTIONAL_SCOPES = [
  { key: 'schedule_time', minRole: 1 },
  { key: 'full_history', minRole: 2 },
] as const

export default function ApiKeyCreatePage({ session }: ApiKeyCreatePageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const role = session.role ?? 0

  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: number; keyId: string; keySecret: string } | null>(null)

  const toggleScope = (key: string, minRole: number) => {
    if (role < minRole) return
    setScopes(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, name, scopes }),
      })
      const data = await res.json() as { success: boolean; message?: string; id?: number; keyId?: string; keySecret?: string }
      if (data.success && data.id && data.keyId && data.keySecret) {
        setCreated({ id: data.id, keyId: data.keyId, keySecret: data.keySecret })
      } else {
        setError(data.message || t('common.error', '오류가 발생했습니다.'))
      }
    } catch {
      setError(t('auth.serverError'))
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    return (
      <SecretRevealModal
        keyId={created.keyId}
        keySecret={created.keySecret}
        onClose={() => navigate(`/developer/keys/${created.id}`, { replace: true })}
      />
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>{t('developer.createBtn', '새 키 발급')}</h2>
      </div>
      <div className="card-body">
        <button className="btn btn-outline" onClick={() => navigate('/developer/keys')} style={{ marginBottom: '18px', fontSize: '12px', padding: '5px 12px' }}>
          {t('common.back', '← 뒤로')}
        </button>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="keyName">{t('developer.nameLabel', '키 이름')}</label>
            <input id="keyName" type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={t('developer.namePlaceholder', '예: 학교 대시보드 연동')} required />
          </div>

          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            {t('developer.scopesLabel', '허용 범위')}
          </label>
          <div className={styles.scopeGroup}>
            <div className={`${styles.scopeOption} ${styles.scopeOptionActive}`}>
              <input type="checkbox" checked disabled style={{ marginTop: '2px' }} />
              <span>
                <span className={styles.scopeLabel}>{t('developer.scopeStatus', '신청 여부 (항상 포함)')}</span>
              </span>
            </div>
            {OPTIONAL_SCOPES.map(opt => {
              const allowed = role >= opt.minRole
              const active = scopes.includes(opt.key)
              return (
                <label
                  key={opt.key}
                  className={`${styles.scopeOption} ${active ? styles.scopeOptionActive : ''} ${!allowed ? styles.scopeOptionDisabled : ''}`}
                >
                  <input type="checkbox" checked={active} disabled={!allowed} onChange={() => toggleScope(opt.key, opt.minRole)} style={{ marginTop: '2px' }} />
                  <span>
                    <span className={styles.scopeLabel}>{t(`developer.scope.${opt.key}`)}</span>
                    <span className={styles.scopeDesc}>{t(`developer.scope.${opt.key}Hint`)}</span>
                  </span>
                </label>
              )
            })}
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? <><span className="spinner" />{t('account.saving', '확인 중...')}</> : t('developer.createSubmit', '발급')}
          </button>
        </form>
      </div>
    </div>
  )
}
