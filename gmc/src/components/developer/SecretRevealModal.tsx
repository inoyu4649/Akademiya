import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './Developer.module.css'

interface SecretRevealModalProps {
  keyId: string
  keySecret: string
  onClose: () => void
}

// Google Cloud Console 스타일의 "발급 즉시 1회만 노출" 패턴 (Akademiya SecretRevealModal 참고, 새로 작성)
export default function SecretRevealModal({ keyId, keySecret, onClose }: SecretRevealModalProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<'id' | 'secret' | null>(null)

  const copy = (field: 'id' | 'secret', value: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(field)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: '480px', padding: '24px' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--text)' }}>
          {t('developer.secretModalTitle', 'API 키가 발급되었습니다')}
        </h3>
        <p style={{ margin: '0 0 18px', fontSize: '12.5px', color: 'var(--warning)' }}>
          {t('developer.secretModalWarning', '이 시크릿은 지금만 표시됩니다. 안전한 곳에 복사해 두세요.')}
        </p>

        <div className={styles.secretField}>
          <span className={styles.secretLabel}>{t('developer.keyIdLabel', 'Key ID')}</span>
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{keyId}</code>
            <button className="btn btn-outline" style={{ fontSize: '11px', padding: '4px 10px', flexShrink: 0 }} onClick={() => copy('id', keyId)}>
              {copied === 'id' ? t('developer.copied', '복사됨') : t('developer.copyBtn', '복사')}
            </button>
          </div>
        </div>

        <div className={styles.secretField}>
          <span className={styles.secretLabel}>{t('developer.keySecretLabel', 'API Key (X-Api-Key 헤더에 그대로 사용)')}</span>
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{keySecret}</code>
            <button className="btn btn-outline" style={{ fontSize: '11px', padding: '4px 10px', flexShrink: 0 }} onClick={() => copy('secret', keySecret)}>
              {copied === 'secret' ? t('developer.copied', '복사됨') : t('developer.copyBtn', '복사')}
            </button>
          </div>
        </div>

        <button className="btn btn-primary btn-block" style={{ marginTop: '8px' }} onClick={onClose}>
          {t('developer.closeBtn', '닫기')}
        </button>
      </div>
    </div>
  )
}
