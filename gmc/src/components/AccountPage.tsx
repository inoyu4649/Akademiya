import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SessionData } from '../types'

interface AccountPageProps {
  session: SessionData
  onSessionUpdate: (patch: Partial<SessionData>) => void
  onAccountDeleted: () => void
}

export default function AccountPage({ session, onSessionUpdate, onAccountDeleted }: AccountPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // ── Going HAFS 학번/비밀번호 수정 ──
  const [studentNo, setStudentNo] = useState(session.studentNo)
  const [password, setPassword] = useState('')
  const [credSaving, setCredSaving] = useState(false)
  const [credMessage, setCredMessage] = useState<{ success: boolean; text: string } | null>(null)

  const handleCredentialsSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setCredSaving(true)
    setCredMessage(null)
    try {
      const res = await fetch('/api/account/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, studentNo, password }),
      })
      const data = await res.json() as { success: boolean; message?: string; studentNo?: string }
      if (data.success) {
        setPassword('')
        if (data.studentNo) onSessionUpdate({ studentNo: data.studentNo })
        setCredMessage({ success: true, text: data.message || t('account.credentialsSaved') })
      } else {
        setCredMessage({ success: false, text: data.message || t('common.error', '오류가 발생했습니다.') })
      }
    } catch {
      setCredMessage({ success: false, text: t('auth.serverError') })
    } finally {
      setCredSaving(false)
    }
  }

  // ── 개발자 모드 ──
  const [developerMode, setDeveloperMode] = useState(!!session.developerMode)
  const [devSaving, setDevSaving] = useState(false)

  const handleToggleDeveloperMode = async () => {
    const next = !developerMode
    setDevSaving(true)
    try {
      const res = await fetch('/api/account/developer-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, enabled: next }),
      })
      const data = await res.json() as { success: boolean; developerMode?: boolean }
      if (data.success) {
        setDeveloperMode(!!data.developerMode)
        onSessionUpdate({ developerMode: !!data.developerMode })
      }
    } catch { /* ignore */ }
    finally { setDevSaving(false) }
  }

  // ── 탈퇴 ──
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirming, setDeleteConfirming] = useState(false)

  const handleDelete = async () => {
    setDeleteConfirming(true)
    try {
      await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId }),
      })
    } catch { /* ignore */ }
    onAccountDeleted()
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>{t('account.title', '계정 설정')}</h2>
        <p>{session.akademiyaEmail}</p>
      </div>
      <div className="card-body">
        <button className="btn btn-outline" onClick={() => navigate(-1)} style={{ marginBottom: '18px', fontSize: '12px', padding: '5px 12px' }}>
          {t('common.back', '← 뒤로')}
        </button>

        {/* ── 학번/비밀번호 수정 ── */}
        <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
          {t('account.credentialsTitle', 'Going HAFS 학번/비밀번호 수정')}
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          {t('account.credentialsDesc', '학번이 바뀌었거나 비밀번호를 변경했다면 다시 연동해주세요.')}
        </p>
        {credMessage && (
          <div className={credMessage.success ? 'alert alert-success' : 'alert alert-error'}>{credMessage.text}</div>
        )}
        <form onSubmit={handleCredentialsSave} style={{ marginBottom: '28px' }}>
          <div className="form-group">
            <label htmlFor="accStudentNo">{t('auth.studentNoLabel')}</label>
            <input id="accStudentNo" type="text" value={studentNo} onChange={e => setStudentNo(e.target.value)}
              autoComplete="username" required />
          </div>
          <div className="form-group">
            <label htmlFor="accPassword">{t('auth.ak.goingPasswordLabel')}</label>
            <input id="accPassword" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('auth.ak.goingPasswordPlaceholder')} autoComplete="current-password" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={credSaving || !studentNo || !password}>
            {credSaving ? <><span className="spinner" />{t('account.saving', '확인 중...')}</> : t('account.saveBtn', '저장')}
          </button>
        </form>

        {/* ── 개발자 모드 ── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '18px', marginBottom: '28px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
            {t('account.developerTitle', '개발자 모드')}
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            {t('account.developerDesc', 'GMCAuto API 키를 발급하려면 개발자 모드를 켜세요.')}
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: devSaving ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={developerMode} disabled={devSaving} onChange={handleToggleDeveloperMode} />
            {t('account.developerEnable', '개발자 모드 사용')}
          </label>
        </div>

        {/* ── 탈퇴 ── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: 'var(--danger)' }}>
            {t('account.dangerTitle', '회원 탈퇴')}
          </h3>
          {!deleteOpen ? (
            <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setDeleteOpen(true)}>
              {t('account.dangerBtn', '탈퇴하기')}
            </button>
          ) : (
            <div style={{
              background: 'var(--danger-light)', border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-sm)', padding: '14px 16px',
            }}>
              <p style={{ fontSize: '13px', color: 'var(--text)', margin: '0 0 12px' }}>
                {t('admin.withdrawConfirm', '탈퇴하면 저장된 비밀번호가 삭제되어 자동 신청이 불가합니다.\n정말 탈퇴하시겠습니까?')}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setDeleteOpen(false)} disabled={deleteConfirming}>
                  {t('common.cancel', '취소')}
                </button>
                <button className="btn btn-danger" onClick={handleDelete} disabled={deleteConfirming}>
                  {deleteConfirming ? <span className="spinner" /> : t('account.dangerConfirmBtn', '정말 탈퇴합니다')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
