import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SessionData, ApiKeyItem } from '../../types'
import SecretRevealModal from './SecretRevealModal'
import styles from './Developer.module.css'

interface ApiKeyDetailPageProps {
  session: SessionData
}

const OPTIONAL_SCOPES = [
  { key: 'schedule_time', minRole: 1 },
  { key: 'full_history', minRole: 2 },
] as const

export default function ApiKeyDetailPage({ session }: ApiKeyDetailPageProps) {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const role = session.role ?? 0

  const [key, setKey] = useState<ApiKeyItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null)
  const [regenerated, setRegenerated] = useState<{ keyId: string; keySecret: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchKey = useCallback(async () => {
    try {
      const res = await fetch(`/api/developer/keys/${id}?sessionId=${encodeURIComponent(session.sessionId)}`)
      const data = await res.json() as { success: boolean; key?: ApiKeyItem }
      if (data.success && data.key) {
        setKey(data.key)
        setName(data.key.name)
        setScopes(data.key.enabledScopes.split(/\s+/).filter(Boolean))
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [id, session.sessionId])

  useEffect(() => { queueMicrotask(() => fetchKey()) }, [fetchKey])

  const toggleScope = (scopeKey: string, minRole: number) => {
    if (role < minRole) return
    setScopes(prev => prev.includes(scopeKey) ? prev.filter(s => s !== scopeKey) : [...prev, scopeKey])
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const [renameRes, scopesRes] = await Promise.all([
        fetch(`/api/developer/keys/${id}/rename`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId, name }),
        }),
        fetch(`/api/developer/keys/${id}/scopes`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.sessionId, scopes }),
        }),
      ])
      const renameData = await renameRes.json() as { success: boolean; message?: string }
      const scopesData = await scopesRes.json() as { success: boolean; message?: string }
      if (renameData.success && scopesData.success) {
        setMessage({ success: true, text: t('common.saved', '저장되었습니다.') })
        fetchKey()
      } else {
        setMessage({ success: false, text: renameData.message || scopesData.message || t('common.error', '오류가 발생했습니다.') })
      }
    } catch {
      setMessage({ success: false, text: t('auth.serverError') })
    } finally {
      setSaving(false)
    }
  }

  const handleRegenerate = async () => {
    try {
      const res = await fetch(`/api/developer/keys/${id}/regenerate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      })
      const data = await res.json() as { success: boolean; keyId?: string; keySecret?: string }
      if (data.success && data.keyId && data.keySecret) {
        setRegenerated({ keyId: data.keyId, keySecret: data.keySecret })
      }
    } catch { /* ignore */ }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/developer/keys/${id}?sessionId=${encodeURIComponent(session.sessionId)}`, { method: 'DELETE' })
      navigate('/developer/keys', { replace: true })
    } catch {
      setDeleting(false)
    }
  }

  if (regenerated) {
    return <SecretRevealModal keyId={regenerated.keyId} keySecret={regenerated.keySecret} onClose={() => setRegenerated(null)} />
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px', width: '26px', height: '26px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
      </div>
    )
  }

  if (!key) {
    return <div className="card"><div className="card-body">{t('developer.notFound', '키를 찾을 수 없습니다.')}</div></div>
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>{key.name}</h2>
        <p><code>{key.keyId}</code></p>
      </div>
      <div className="card-body">
        <button className="btn btn-outline" onClick={() => navigate('/developer/keys')} style={{ marginBottom: '18px', fontSize: '12px', padding: '5px 12px' }}>
          {t('common.back', '← 뒤로')}
        </button>

        <div className={styles.statRow}>
          <div className={styles.statCard}>
            <div className={styles.statNumber}>{key.requestCount}</div>
            <div className={styles.statLabel}>{t('developer.requestCountLabel', '누적 호출 수')}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statNumber} style={{ fontSize: '13px' }}>
              {key.lastUsedAt ? key.lastUsedAt.slice(0, 16).replace('T', ' ') : t('developer.never', '없음')}
            </div>
            <div className={styles.statLabel}>{t('developer.lastUsedLabel', '마지막 사용')}</div>
          </div>
        </div>

        {message && <div className={message.success ? 'alert alert-success' : 'alert alert-error'}>{message.text}</div>}

        <div className="form-group">
          <label htmlFor="keyNameEdit">{t('developer.nameLabel', '키 이름')}</label>
          <input id="keyNameEdit" type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
          {t('developer.scopesLabel', '허용 범위')}
        </label>
        <div className={styles.scopeGroup}>
          <div className={`${styles.scopeOption} ${styles.scopeOptionActive}`}>
            <input type="checkbox" checked disabled style={{ marginTop: '2px' }} />
            <span><span className={styles.scopeLabel}>{t('developer.scopeStatus', '신청 여부 (항상 포함)')}</span></span>
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

        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <span className="spinner" /> : t('account.saveBtn', '저장')}
        </button>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '18px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>{t('developer.regenerateBtn', '시크릿 재발급')}</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            {t('developer.regenerateWarning', '재발급하면 기존 시크릿은 즉시 무효화됩니다.')}
          </p>
          <button className="btn btn-outline" onClick={handleRegenerate}>{t('developer.regenerateBtn', '시크릿 재발급')}</button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '18px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px', color: 'var(--danger)' }}>{t('developer.deleteBtn', '삭제')}</h3>
          {!deleteOpen ? (
            <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setDeleteOpen(true)}>
              {t('developer.deleteBtn', '삭제')}
            </button>
          ) : (
            <div className={styles.dangerZone}>
              <p style={{ fontSize: '13px', color: 'var(--text)', margin: '0 0 12px' }}>
                {t('developer.deleteConfirmDesc', '삭제하면 이 키로 더 이상 API를 호출할 수 없습니다.')}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>{t('common.cancel', '취소')}</button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <span className="spinner" /> : t('developer.deleteConfirmBtn', '정말 삭제합니다')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
