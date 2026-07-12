import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { gmcPrivacyPolicy, gmcTermsOfUse } from '../policyContent'
import { policyModalStyles as styles } from './policyModalStyles'

interface PolicyPageProps {
  kind: 'privacy' | 'terms'
}

// 사이드바 하단 링크로 접근하는 전문 상시 열람 페이지 — 로그인 시 강제 동의 모달
// (PrivacyPolicyModal/TermsOfUseModal)과 달리 체크박스 없이 항상 최신 전문만 보여준다.
export default function PolicyPage({ kind }: PolicyPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const policy = kind === 'privacy' ? gmcPrivacyPolicy : gmcTermsOfUse

  return (
    <div className="card">
      <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: 'var(--text)' }}>{policy.title}</h2>
        <span style={styles.version}>v{policy.version} · {policy.effectiveDate}</span>
      </div>
      <div style={{ padding: '18px 24px' }}>
        <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ marginBottom: '16px', fontSize: '12px', padding: '5px 12px' }}>
          {t('common.back', '← 뒤로')}
        </button>
        <p style={styles.preamble}>{policy.preamble}</p>
        {policy.sections.map(sec => (
          <div key={sec.id} style={{ ...styles.section, marginTop: '14px' }}>
            <h3 style={styles.sectionTitle}>{sec.title}</h3>
            <div style={styles.sectionBody}>
              {sec.content.split('\n').map((line, i) => (
                <p key={i} style={line === '' ? styles.blank : styles.line}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
