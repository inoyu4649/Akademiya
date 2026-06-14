import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type React from 'react'

const GMC_PRIVACY_POLICY_VERSION = 1

const POLICY_EFFECTIVE_DATE = '2026-06-06'

const POLICY_SECTIONS = [
  {
    id: 'purpose',
    title: '제1조 (개인정보의 처리 목적)',
    content: `GMCAuto는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않습니다.

1. 서비스 제공
Going HAFS 사이트 자동 로그인 및 GMC PASS 자동 신청 서비스 제공을 목적으로 개인정보를 처리합니다.

2. 스케줄 관리
GMC PASS 신청 스케줄 등록·실행·관리 및 결과 기록 목적으로 개인정보를 처리합니다.`,
  },
  {
    id: 'items',
    title: '제2조 (처리하는 개인정보의 항목)',
    content: `GMCAuto는 다음의 개인정보 항목을 처리합니다.

[필수항목]
- Going HAFS 학번(학생 번호)
- Going HAFS 비밀번호 (암호화 저장, 자동 신청 전용)

[Akademiya OAuth 연동 시]
- Akademiya 계정 이메일, 사용자 식별 ID

[자동 수집]
- GMC PASS 신청 스케줄 정보 (시간, 날짜, 담당교사)
- 신청 결과 이력 (성공/실패)
- 세션 식별자 (로그인 상태 유지용)

※ 비밀번호는 자동 신청 목적으로만 서버에 저장되며, 다른 목적으로 절대 사용되지 않습니다.`,
  },
  {
    id: 'retention',
    title: '제3조 (개인정보의 처리 및 보유 기간)',
    content: `- 계정 정보 (학번, 비밀번호): 서비스 탈퇴 시까지
- 스케줄 이력: 실행 후 7일 후 자동 삭제
- 재시도 기록: 신청일 기준 7일 후 자동 삭제`,
  },
  {
    id: 'security',
    title: '제4조 (개인정보의 안전성 확보조치)',
    content: `1. 비밀번호 암호화 저장 및 자동 신청 외 목적 사용 금지
2. HTTPS(TLS) 암호화 통신
3. 데이터베이스 접근 권한 제한`,
  },
  {
    id: 'rights',
    title: '제5조 (정보주체의 권리 및 행사방법)',
    content: `이용자는 언제든지 다음의 권리를 행사할 수 있습니다.

1. 개인정보 열람, 정정, 삭제, 처리정지 요구
2. 서비스 내 탈퇴 기능으로 저장된 자격증명 즉시 삭제 가능
3. 추가 문의: 022207@hafs.hs.kr`,
  },
  {
    id: 'officer',
    title: '제6조 (개인정보 보호책임자)',
    content: `- 성명: 이민기
- 직책: 서비스 운영자
- 연락처(이메일): 022207@hafs.hs.kr
- 서비스: https://gmc.akademiya.kr`,
  },
  {
    id: 'remedy',
    title: '제7조 (권익침해 구제방법)',
    content: `1. 개인정보 분쟁조정위원회: 1833-6972 (www.kopico.go.kr)
2. 개인정보침해신고센터: 118 (privacy.kisa.or.kr)
3. 경찰청: 182 (ecrm.police.go.kr)`,
  },
  {
    id: 'changes',
    title: '제8조 (개인정보 처리방침의 변경)',
    content: `이 처리방침은 ${POLICY_EFFECTIVE_DATE}부터 적용됩니다. 변경 시 모달 팝업으로 안내하고 재동의를 받습니다.`,
  },
]

interface PrivacyPolicyModalProps {
  sessionId: string
  onConsented: () => void
}

export default function PrivacyPolicyModal({ sessionId, onConsented }: PrivacyPolicyModalProps) {
  const { t } = useTranslation()
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
          <h2 style={styles.title}>GMCAuto 개인정보 처리방침</h2>
          <p style={styles.subtitle}>서비스 이용을 위해 개인정보 처리방침에 동의해 주세요.</p>
          <span style={styles.version}>v{GMC_PRIVACY_POLICY_VERSION} · {POLICY_EFFECTIVE_DATE}</span>
        </div>

        <div style={styles.content}>
          <p style={styles.preamble}>
            GMCAuto(이하 '서비스')는 정보주체의 자유와 권리 보호를 위해 「개인정보 보호법」 및 관계 법령이
            정한 바를 준수하여, 적법하게 개인정보를 처리하고 안전하게 관리하고 있습니다.
          </p>
          {POLICY_SECTIONS.map((sec) => (
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
            <span>개인정보 처리방침을 읽었으며, 이에 동의합니다.</span>
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
