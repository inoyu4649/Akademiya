import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GMC_PRIVACY_POLICY_VERSION,
  gmcPrivacyPolicy,
  gmcPrivacySummaries,
} from '../policyContent'
import { policyModalStyles as styles } from './policyModalStyles'

interface PrivacyPolicyModalProps {
  sessionId: string
  /** 사용자가 마지막으로 동의한 처리방침 버전 (없으면 0) */
  consentedVersion: number
  onConsented: () => void
}

export default function PrivacyPolicyModal({ sessionId, consentedVersion, onConsented }: PrivacyPolicyModalProps) {
  const { t } = useTranslation()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showFull, setShowFull] = useState(false)
  const policy = gmcPrivacyPolicy

  // 마지막 동의 버전 이후의 변경 요약만 누적 표시 (예: v1 동의자 → v1→v2 ...)
  const newSummaries = gmcPrivacySummaries.filter((s) => s.to > consentedVersion)
  const showSummary = newSummaries.length > 0 && !showFull

  const handleConsent = async () => {
    if (!agreed) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/privacy/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, version: GMC_PRIVACY_POLICY_VERSION }),
      })
      const data = await res.json() as { success: boolean; message?: string }
      if (data.success) {
        onConsented()
      } else {
        setError(data.message || t('privacy.consentError', '동의 처리 중 오류가 발생했습니다.'))
      }
    } catch {
      setError(t('privacy.consentError', '서버에 연결할 수 없습니다. 다시 시도해 주세요.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>{policy.title}</h2>
          <p style={styles.subtitle}>
            {consentedVersion > 0
              ? '개인정보 처리방침이 개정되었습니다. 변경사항을 확인하고 다시 동의해 주세요.'
              : '서비스 이용을 위해 개인정보 처리방침에 동의해 주세요.'}
          </p>
          <span style={styles.version}>v{policy.version} · {policy.effectiveDate}</span>
        </div>

        <div style={styles.content}>
          {showSummary ? (
            <>
              <p style={styles.summaryIntro}>
                {consentedVersion > 0
                  ? `회원님이 동의하신 v${consentedVersion} 이후 변경된 주요 내용입니다.`
                  : '주요 변경 내용입니다.'}
              </p>
              {newSummaries.map((sum) => (
                <div key={sum.to} style={styles.section}>
                  <h3 style={styles.sectionTitle}>
                    v{sum.to - 1} → v{sum.to} 변경사항 ({sum.effectiveDate})
                  </h3>
                  <ul style={styles.changeList}>
                    {sum.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          ) : (
            // 변경 요약이 없거나 '전문 보기'를 선택한 경우 전문 표시
            <>
              <p style={styles.preamble}>{policy.preamble}</p>
              {policy.sections.map((sec) => (
                <div key={sec.id} style={styles.section}>
                  <h3 style={styles.sectionTitle}>{sec.title}</h3>
                  <div style={styles.sectionBody}>
                    {sec.content.split('\n').map((line, i) => (
                      <p key={i} style={line === '' ? styles.blank : styles.line}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={styles.footer}>
          {error && <p style={styles.error}>{error}</p>}
          {newSummaries.length > 0 && (
            <button type="button" style={styles.fullLink} onClick={() => setShowFull(v => !v)}>
              {showFull ? '변경 요약 보기' : '개인정보 처리방침 전문 보기'}
            </button>
          )}
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>개인정보 처리방침을 읽었으며, 이에 동의합니다.</span>
          </label>
          <button
            className="btn btn-primary btn-block"
            onClick={handleConsent}
            disabled={!agreed || loading}
          >
            {loading ? '처리 중...' : '동의하고 계속하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
