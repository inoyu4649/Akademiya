import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { SessionData, ScheduleInfo, LogEntry, PassRecord, TakenSlotDetail } from '../types'
import LogViewer from './LogViewer'
import ScheduleTimeline from './ScheduleTimeline'

interface HomePageProps {
  session: SessionData
  logs: LogEntry[]
  addLog: (message: string, type?: LogEntry['type']) => void
}

interface PassHistoryProps {
  session: SessionData
}

const TIME_CODE_OPTIONS = [
  { value: '1', key: 'pass.yaja1' },
  { value: '2', key: 'pass.yaja2' },
  { value: '3', key: 'pass.yaja12' },
]

export default function HomePage({ session, logs, addLog }: HomePageProps) {
  const { t } = useTranslation()

  const [mySchedule, setMySchedule]         = useState<ScheduleInfo | null>(null)
  const [takenSlots, setTakenSlots]          = useState<string[]>([])
  const [takenSlotDetails, setTakenSlotDetails] = useState<TakenSlotDetail[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [targetDate, setTargetDate]           = useState('')
  const [weekend, setWeekend]                 = useState(false)
  const [suspended, setSuspended]             = useState(false)
  const [resumeDate, setResumeDate]           = useState<string | null>(null)

  const [regTime, setRegTime]         = useState('09:00')
  const [regTimeCode, setRegTimeCode] = useState('3')
  const [regReason, setRegReason]     = useState('')
  const [regLoading, setRegLoading]   = useState(false)
  const [regMessage, setRegMessage]   = useState<{ success: boolean; message: string } | null>(null)

  const fetchSchedule = useCallback(async () => {
    try {
      const res  = await fetch(`/api/schedule/status?sessionId=${session.sessionId}`)
      const data = await res.json() as {
        success: boolean;
        mySchedule?: ScheduleInfo;
        takenSlots?: string[];
        takenSlotDetails?: TakenSlotDetail[];
        targetDate?: string;
        isWeekend?: boolean;
        suspended?: boolean;
        resumeDate?: string | null;
      }
      if (data.success) {
        setMySchedule(data.mySchedule ?? null)
        setTakenSlots(data.takenSlots || [])
        setTakenSlotDetails(data.takenSlotDetails || [])
        setTargetDate(data.targetDate || '')
        setWeekend(data.isWeekend || false)
        setSuspended(data.suspended || false)
        setResumeDate(data.resumeDate || null)
      }
    } catch { /* 무시 */ }
    finally { setScheduleLoading(false) }
  }, [session.sessionId])

  useEffect(() => {
    queueMicrotask(() => fetchSchedule())
    const iv = setInterval(fetchSchedule, 30000)
    return () => clearInterval(iv)
  }, [fetchSchedule])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegLoading(true)
    setRegMessage(null)
    try {
      const res  = await fetch('/api/schedule/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId: session.sessionId, time: regTime, timeCode: regTimeCode, reason: regReason }),
      })
      const data = await res.json() as { success: boolean; message: string }
      setRegMessage(data)
      if (data.success) {
        addLog(`자동 신청 등록: ${regTime}`, 'success')
        fetchSchedule()
      } else {
        addLog(`등록 실패: ${data.message}`, 'error')
      }
    } catch {
      setRegMessage({ success: false, message: '서버 오류' })
    } finally {
      setRegLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!mySchedule) return
    try {
      const res  = await fetch('/api/schedule/cancel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId: session.sessionId }),
      })
      const data = await res.json() as { success: boolean }
      if (data.success) {
        addLog(`자동 신청 해제: ${mySchedule.time}`, 'info')
        setMySchedule(null)
        fetchSchedule()
      }
    } catch { /* 무시 */ }
  }

  const isTimeValid = (time: string): boolean => {
    if (!/^\d{2}:\d{2}$/.test(time)) return false
    const [h, m] = time.split(':').map(Number)
    const total = h * 60 + m
    return total >= 540 && total <= 1059
  }

  const isSlotTaken = (time: string): boolean => {
    return takenSlots.includes(time) && (!mySchedule || mySchedule.time !== time)
  }

  return (
    <div className="dashboard-grid">
      {/* 신청 불가일(휴일/중단기간) 안내 */}
      {(suspended || weekend) && (
        <div
          style={{
            gridColumn: '1 / -1', padding: '10px 16px',
            background: suspended ? 'var(--danger-light)' : 'var(--warning-light)',
            border: `1px solid ${suspended ? 'var(--danger)' : 'var(--warning)'}`,
            borderRadius: 'var(--radius)', fontSize: '13px',
            color: suspended ? 'var(--danger)' : 'var(--warning)', fontWeight: 500,
          }}
        >
          {suspended
            ? t('home.suspendNotice', { date: resumeDate || targetDate })
            : t('home.holidayNotice', { date: targetDate })}
        </div>
      )}

      {/* 내 자동 신청 현황 */}
      {mySchedule && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{t('home.myScheduleTitle')}</h2>
            <button className="btn btn-danger" onClick={handleCancel} style={{ fontSize: '12px', padding: '5px 11px' }}>
              {t('home.cancelBtn')}
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
              <div><strong>{t('home.applyTimeLabel')}:</strong> {mySchedule.time}</div>
              <div>
                <strong>{t('home.yajaLabel')}:</strong>{' '}
                {t(TIME_CODE_OPTIONS.find(o => o.value === mySchedule.timeCode)?.key || 'pass.yaja12')}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong>{t('home.reasonLabel')}:</strong> {mySchedule.reason || '-'}
              </div>
            </div>
            {mySchedule.executed ? (
              <div
                className={`alert ${mySchedule.result?.success ? 'alert-success' : 'alert-error'}`}
                style={{ marginTop: '12px', marginBottom: 0 }}
              >
                {mySchedule.result?.success ? t('home.executed_success') : t('home.executed_fail')}: {mySchedule.result?.message}
              </div>
            ) : (
              <div className="alert alert-warning" style={{ marginTop: '12px', marginBottom: 0 }}>
                {t('home.pending', { time: mySchedule.time })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 자동 신청 등록 */}
      {!mySchedule && (
        <div className="card">
          <div className="card-header">
            <h2>{t('home.registerTitle')}</h2>
            <p>{t('home.registerDesc')}</p>
          </div>
          <div className="card-body">
            {regMessage && (
              <div className={`alert ${regMessage.success ? 'alert-success' : 'alert-error'}`}>
                {regMessage.message}
              </div>
            )}
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label htmlFor="regTime">{t('home.timeLabel')}</label>
                <input
                  id="regTime" type="time" min="09:00" max="17:39"
                  value={regTime} onChange={e => setRegTime(e.target.value)} required
                />
                {regTime && !isTimeValid(regTime) && (
                  <small style={{ color: 'var(--danger)', fontSize: '11px' }}>{t('home.timeRangeError')}</small>
                )}
                {regTime && isSlotTaken(regTime) && (
                  <small style={{ color: 'var(--danger)', fontSize: '11px' }}>{t('home.slotTaken')}</small>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="regTimeCode">{t('home.yajaSelectLabel')}</label>
                <select id="regTimeCode" value={regTimeCode} onChange={e => setRegTimeCode(e.target.value)} required>
                  {TIME_CODE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{t(o.key)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="regReason">{t('home.reasonOptLabel')}</label>
                <textarea
                  id="regReason" value={regReason}
                  onChange={e => setRegReason(e.target.value)}
                  placeholder={t('home.reasonPlaceholder')} rows={2}
                />
              </div>
              <button
                type="submit" className="btn btn-primary btn-block btn-lg"
                disabled={regLoading || !isTimeValid(regTime) || isSlotTaken(regTime)}
              >
                {regLoading ? <><span className="spinner" /> {t('home.registering')}</> : t('home.registerBtn')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 즉시 신청 */}
      <div className="card">
        <div className="quick-action">
          <h3>{t('home.quickTitle')}</h3>
          <p>{t('home.quickDesc')}</p>
          <Link to="/apply" className="btn btn-primary btn-lg">
            {t('home.quickBtn')}
          </Link>
        </div>
      </div>

      {/* 슬롯 현황 */}
      <div className="card">
        <div className="card-header">
          <h2>{t('home.slotsTitle')}</h2>
          <p>
            {t('home.slotsSubtitle')} ({takenSlots.length})
            {suspended && <span style={{ marginLeft: '6px', color: 'var(--danger)', fontSize: '11px', fontWeight: '600' }}>{t('home.suspendLabel')}</span>}
            {!suspended && weekend && <span style={{ marginLeft: '6px', color: 'var(--warning)', fontSize: '11px', fontWeight: '600' }}>{t('home.holidayLabel')}</span>}
          </p>
        </div>
        <div className="card-body">
          {scheduleLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '14px' }}>
              {t('home.slotsLoading')}
            </div>
          ) : (
            <ScheduleTimeline takenSlots={takenSlots} mySlot={mySchedule?.time ?? null} slotDetails={takenSlotDetails} />
          )}
        </div>
      </div>

      {/* 활동 로그 */}
      <div className="card">
        <div className="card-header"><h2>{t('home.logTitle')}</h2></div>
        <div className="card-body" style={{ padding: '0' }}>
          <LogViewer logs={logs} />
        </div>
      </div>
    </div>
  )
}

export function PassHistory({ session }: PassHistoryProps) {
  const { t } = useTranslation()
  const [records, setRecords] = useState<PassRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/pass/list?sessionId=${session.sessionId}`)
      const data = await res.json() as { success: boolean; records?: PassRecord[]; message?: string }
      if (data.success) {
        setRecords(data.records || [])
      } else {
        setError(data.message || '')
      }
    } catch {
      setError(t('history.fetchError'))
    } finally {
      setLoading(false)
    }
  }, [session.sessionId, t])

  useEffect(() => { queueMicrotask(() => fetchHistory()) }, [fetchHistory])

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>{t('history.title')}</h2>
          <p>{t('history.subtitle')}</p>
        </div>
        <button className="btn btn-outline" onClick={fetchHistory} disabled={loading} style={{ fontSize: '12px' }}>
          {t('history.refresh')}
        </button>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
            {t('history.loading')}
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
            {t('history.empty')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {[t('history.colDate'), t('history.colType'), t('history.colTime'), t('history.colConfirmed'), t('history.colTeacher')].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px' }}>{record.date}</td>
                    <td style={{ padding: '7px 10px' }}>{record.type}</td>
                    <td style={{ padding: '7px 10px' }}>{record.time}</td>
                    <td style={{ padding: '7px 10px' }}>{record.confirmed}</td>
                    <td style={{ padding: '7px 10px' }}>{record.teacher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
