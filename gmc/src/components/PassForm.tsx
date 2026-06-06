import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionData, LogEntry } from '../types'

interface PassFormProps {
  session: SessionData
  addLog: (message: string, type?: LogEntry['type']) => void
}

export default function PassForm({ session, addLog }: PassFormProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [error, setError] = useState('')
  const [hiddenFields, setHiddenFields] = useState<Record<string, string>>({})

  const [date, setDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [timeCode, setTimeCode] = useState('3')
  const [reason, setReason] = useState('')

  useEffect(() => { loadForm() }, [])

  const loadForm = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/pass/form?sessionId=${session.sessionId}`)
      const data = await res.json() as { success: boolean; hiddenFields?: Record<string, string>; message?: string }
      if (data.success) {
        setHiddenFields(data.hiddenFields || {})
        addLog('GMC PASS 신청 폼을 불러왔습니다', 'info')
      } else {
        setError(data.message || '')
        addLog(`폼 로드 실패: ${data.message}`, 'error')
      }
    } catch {
      setError('폼 정보를 불러올 수 없습니다.')
      addLog('폼 로드 중 오류 발생', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)
    addLog(`GMC PASS 신청 중... (${date})`, 'info')

    try {
      const res = await fetch('/api/pass/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, date, timeCode, reason }),
      })
      const data = await res.json() as { success: boolean; message: string }
      setResult(data)

      if (data.success) {
        addLog(`PASS 신청 성공: ${data.message}`, 'success')
      } else {
        addLog(`PASS 신청 실패: ${data.message}`, 'error')
      }
    } catch {
      setResult({ success: false, message: '서버 오류가 발생했습니다.' })
      addLog('신청 중 서버 오류', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: '48px' }}>
          <div className="spinner" style={{ margin: '0 auto 12px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>{t('pass.formLoading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2>{t('pass.title')}</h2>
        <p>
          {hiddenFields.student_name && `${hiddenFields.student_name} `}
          {hiddenFields.student_grade && `${hiddenFields.student_grade}학년 `}
          {hiddenFields.student_group && `${hiddenFields.student_group}반 `}
          {hiddenFields.student_number && `${hiddenFields.student_number}번`}
        </p>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-error">{error}</div>}
        {result && (
          <div className={`alert ${result.success ? 'alert-success' : 'alert-error'}`}>
            {result.message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="date">{t('pass.dateLabel')}</label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="timeCode">{t('pass.yajaLabel')}</label>
            <select
              id="timeCode"
              value={timeCode}
              onChange={(e) => setTimeCode(e.target.value)}
              required
            >
              <option value="1">{t('pass.yaja1')}</option>
              <option value="2">{t('pass.yaja2')}</option>
              <option value="3">{t('pass.yaja12')}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="reason">{t('pass.reasonLabel')}</label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('pass.reasonPlaceholder')}
              rows={3}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block btn-lg"
            disabled={submitting}
            style={{ marginTop: '8px' }}
          >
            {submitting ? (
              <><span className="spinner" /> {t('pass.submitting')}</>
            ) : t('pass.submitBtn')}
          </button>
        </form>
      </div>
    </div>
  )
}
