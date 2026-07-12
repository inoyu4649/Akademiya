import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SessionData, ApiKeyItem } from '../../types'
import styles from './Developer.module.css'

interface ApiKeysPageProps {
  session: SessionData
}

export default function ApiKeysPage({ session }: ApiKeysPageProps) {
  const { t } = useTranslation()
  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch(`/api/developer/keys?sessionId=${encodeURIComponent(session.sessionId)}`)
      const data = await res.json() as { success: boolean; keys?: ApiKeyItem[] }
      if (data.success) setKeys(data.keys || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [session.sessionId])

  useEffect(() => { queueMicrotask(() => fetchKeys()) }, [fetchKeys])

  return (
    <div className="card">
      <div className="card-header">
        <div className={styles.headerRow}>
          <div>
            <h2>{t('developer.keysTitle', 'GMCAuto API 키')}</h2>
            <p>{t('developer.keysDesc', '서버-서버 연동용 API 키를 관리합니다.')}</p>
          </div>
          <Link to="/developer/keys/new" className="btn btn-primary">{t('developer.createBtn', '새 키 발급')}</Link>
        </div>
      </div>
      <div className="card-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: '24px', height: '24px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
          </div>
        ) : keys.length === 0 ? (
          <div className={styles.empty}>{t('developer.empty', '발급된 키가 없습니다.')}</div>
        ) : (
          <div className={styles.list}>
            {keys.map(k => (
              <Link key={k.id} to={`/developer/keys/${k.id}`} className={styles.card}>
                <div className={styles.cardTitle}>{k.name}</div>
                <div className={styles.cardMeta}>
                  <code>{k.keyId}</code>
                  <span>{t('developer.requestCountLabel', '누적 호출 수')}: {k.requestCount}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
