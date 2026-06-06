import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type React from 'react'

const GMC_TERMS_OF_USE_VERSION = 1

const TERMS_EFFECTIVE_DATE = '2026-06-06'

const TERMS_SECTIONS = [
  {
    id: 'purpose',
    title: '제1조 (목적 및 서비스 성격)',
    content: `① 이 약관은 GMCAuto가 제공하는 Going HAFS 사이트 GMC PASS 자동 신청 서비스의 이용 조건 및 절차, 운영자와 이용자의 권리·의무 및 책임에 관한 사항을 규정함을 목적으로 합니다.

② GMCAuto는 용인한국외국어대학교부설고등학교(HAFS)와 공식적인 제휴 관계가 없는 독립 운영 서비스입니다.

③ 서비스는 Going HAFS 사이트의 자동 신청 편의를 위해 제공되며, 신청 결과에 대한 보장을 하지 않습니다.`,
  },
  {
    id: 'definitions',
    title: '제2조 (정의)',
    content: `1. "서비스": GMCAuto가 제공하는 GMC PASS 자동 신청 및 스케줄 관리 서비스
2. "이용자": 이 약관에 따라 서비스에 로그인하여 기능을 이용하는 자
3. "자격증명": Going HAFS 사이트 이용을 위한 학번 및 비밀번호
4. "스케줄": 자동 신청을 위해 등록한 시간, 날짜, 담당교사 등의 정보`,
  },
  {
    id: 'terms_posting',
    title: '제3조 (약관의 게시 및 변경)',
    content: `① 이 약관은 로그인 화면 및 동의 모달에 게시됩니다.

② 약관 변경 시 적용 7일 이전에 공지합니다. 재동의가 필요한 경우 로그인 후 동의 화면을 통해 진행합니다.`,
  },
  {
    id: 'credentials',
    title: '제4조 (자격증명 관리 및 책임)',
    content: `① 이용자는 Going HAFS 학번 및 비밀번호를 안전하게 관리할 책임이 있습니다.

② 자격증명은 GMC PASS 자동 신청 목적으로만 사용되며, 이외의 목적으로는 절대 사용되지 않습니다.

③ 서비스 탈퇴 기능으로 저장된 자격증명을 언제든지 즉시 삭제할 수 있습니다.`,
  },
  {
    id: 'obligations',
    title: '제5조 (이용자의 의무 및 금지행위)',
    content: `다음 행위는 금지됩니다.
1. 타인의 학번·비밀번호를 도용하는 행위
2. 서버에 과부하를 주거나 시스템을 악용하는 행위
3. Going HAFS 사이트를 비정상적으로 이용하는 행위
4. 기술적 보호조치를 우회하거나 리버스 엔지니어링하는 행위
5. 관계 법령에 위반되는 행위`,
  },
  {
    id: 'service',
    title: '제6조 (서비스 제공 및 중단)',
    content: `서비스는 연중무휴 무료 제공을 원칙으로 합니다. 단, 서버 점검, Going HAFS 정책 변경, 불가항력적 사유 등으로 일시 중단될 수 있습니다.`,
  },
  {
    id: 'disclaimer',
    title: '제7조 (면책사항)',
    content: `서비스는 다음의 경우 책임을 지지 않습니다.
1. 이용자의 자격증명 오류로 인한 자동 신청 실패
2. Going HAFS 정책 변경, 점검, 장애로 인한 신청 실패
3. 불가항력적 사유로 인한 서비스 중단
4. 이용자 귀책사유로 인한 이용 장애

※ 본 서비스는 HAFS 공식 서비스가 아닙니다.`,
  },
  {
    id: 'dispute',
    title: '제8조 (분쟁 해결 및 준거법)',
    content: `서비스와 이용자 간의 분쟁은 대한민국 법원에서 관할합니다.
문의: lmg1152@naver.com`,
  },
  {
    id: 'supplementary',
    title: '부칙',
    content: `이 약관은 ${TERMS_EFFECTIVE_DATE}부터 시행됩니다.`,
  },
]

interface TermsOfUseModalProps {
  sessionId: string
  onConsented: () => void
}

export default function TermsOfUseModal({ sessionId, onConsented }: TermsOfUseModalProps) {
  const { t } = useTranslation()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConsent = async () => {
    if (!agreed) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/terms/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, version: GMC_TERMS_OF_USE_VERSION }),
      })
      const data = await res.json() as { success: boolean; message?: string }
      if (data.success) {
        onConsented()
      } else {
        setError(data.message || t('terms.consentError', '동의 처리 중 오류가 발생했습니다.'))
      }
    } catch {
      setError(t('terms.consentError', '서버에 연결할 수 없습니다. 다시 시도해 주세요.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>GMCAuto 이용약관</h2>
          <p style={styles.subtitle}>서비스 이용을 위해 이용약관에 동의해 주세요.</p>
          <span style={styles.version}>v{GMC_TERMS_OF_USE_VERSION} · {TERMS_EFFECTIVE_DATE}</span>
        </div>

        <div style={styles.content}>
          <p style={styles.preamble}>
            GMCAuto(이하 '서비스')가 제공하는 Going HAFS GMC PASS 자동 신청 서비스의 이용에 관한
            조건 및 절차, 운영자와 이용자의 권리·의무, 책임에 관한 사항을 규정합니다.
          </p>
          {TERMS_SECTIONS.map((sec) => (
            <div key={sec.id} style={styles.section}>
              <h3 style={styles.sectionTitle}>{sec.title}</h3>
              <div style={styles.sectionBody}>
                {sec.content.split('\n').map((line, i) => (
                  <p key={i} style={line === '' ? styles.blank : styles.line}>{line}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          {error && <p style={styles.error}>{error}</p>}
          <label style={styles.checkLabel}>
            <input
              type="checkbox"
              style={styles.checkbox}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>이용약관을 읽었으며, 이에 동의합니다.</span>
          </label>
          <button
            style={{ ...styles.btn, ...((!agreed || loading) ? styles.btnDisabled : {}) }}
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

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modal: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '20px 24px 14px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: {
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--text)',
    margin: '0 0 5px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text-secondary, #9ca3af)',
    margin: '0 0 6px',
  },
  version: {
    fontSize: '11px',
    color: 'var(--text-secondary, #9ca3af)',
    background: 'var(--bg, #1e1e1e)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 8px',
    display: 'inline-block',
  },
  content: {
    overflowY: 'auto',
    flex: 1,
    padding: '18px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  preamble: {
    fontSize: '12px',
    lineHeight: 1.7,
    color: 'var(--text-secondary, #9ca3af)',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '6px',
    padding: '10px 12px',
    margin: 0,
  },
  section: {
    borderTop: '1px solid var(--border)',
    paddingTop: '12px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--primary)',
    marginBottom: '7px',
    marginTop: 0,
  },
  sectionBody: {
    fontSize: '12px',
    lineHeight: 1.75,
    color: 'var(--text-secondary, #9ca3af)',
  },
  line: { margin: 0 },
  blank: { height: '7px', margin: 0 },
  footer: {
    padding: '14px 24px 18px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  error: {
    fontSize: '12px',
    color: '#ef4444',
    margin: 0,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    color: 'var(--text)',
    lineHeight: 1.5,
  },
  checkbox: {
    width: '15px',
    height: '15px',
    flexShrink: 0,
    marginTop: '1px',
    accentColor: 'var(--primary)',
    cursor: 'pointer',
  },
  btn: {
    width: '100%',
    padding: '10px',
    background: 'var(--primary)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
}
