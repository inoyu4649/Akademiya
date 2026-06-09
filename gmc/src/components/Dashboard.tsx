import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import PassForm from './PassForm'
import LogViewer from './LogViewer'
import type { SessionData, ScheduleInfo, LogEntry, PassRecord } from '../types'

const AdminDashboard = lazy(() => import('./AdminDashboard'))

interface DashboardProps {
  session: SessionData
  onLogout: () => void
  onAccountDelete: () => void
  theme: string
  toggleTheme: () => void
}

interface PassHistoryProps {
  session: SessionData
}

const TIME_CODE_OPTIONS = [
  { value: '1', key: 'pass.yaja1' },
  { value: '2', key: 'pass.yaja2' },
  { value: '3', key: 'pass.yaja12' },
]

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}
function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

export default function Dashboard({ session, onLogout, onAccountDelete, theme, toggleTheme }: DashboardProps) {
  const { t } = useTranslation()
  const [view, setView] = useState('home')
  const [logs, setLogs] = useState<LogEntry[]>([])

  const [mySchedule, setMySchedule]         = useState<ScheduleInfo | null>(null)
  const [takenSlots, setTakenSlots]          = useState<string[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [targetDate, setTargetDate]           = useState('')
  const [weekend, setWeekend]                 = useState(false)

  const [regTime, setRegTime]         = useState('09:00')
  const [regTimeCode, setRegTimeCode] = useState('3')
  const [regReason, setRegReason]     = useState('')
  const [regLoading, setRegLoading]   = useState(false)
  const [regMessage, setRegMessage]   = useState<{ success: boolean; message: string } | null>(null)

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    setLogs(prev => [...prev, { time, message, type }])
  }, [])

  const fetchSchedule = useCallback(async () => {
    try {
      const res  = await fetch(`/api/schedule/status?sessionId=${session.sessionId}`)
      const data = await res.json() as {
        success: boolean;
        mySchedule?: ScheduleInfo;
        takenSlots?: string[];
        targetDate?: string;
        isWeekend?: boolean;
      }
      if (data.success) {
        setMySchedule(data.mySchedule ?? null)
        setTakenSlots(data.takenSlots || [])
        setTargetDate(data.targetDate || '')
        setWeekend(data.isWeekend || false)
      }
    } catch { /* 무시 */ }
    finally { setScheduleLoading(false) }
  }, [session.sessionId])

  useEffect(() => {
    fetchSchedule()
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
        body:    JSON.stringify({ sessionId: session.sessionId, time: mySchedule.time }),
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

  const tabs = [
    { id: 'home',    key: 'nav.home'    },
    { id: 'apply',   key: 'nav.apply'   },
    { id: 'history', key: 'nav.history' },
    ...((session.role ?? 0) >= 1 ? [{ id: 'admin', key: 'nav.dashboard' }] : []),
  ]

  return (
    <div className="app" style={{ minHeight: 'unset', flex: 1 }}>
      <header className="header">
        <div className="header-left">
          <img src="/logo_gmc.png" alt="GMCAuto" style={{ height: '30px', objectFit: 'contain' }} />
          <h1>GMCAuto 2</h1>
          <span className="version">v2.6.1</span>
        </div>
        <div className="header-right">
          <button
            className="btn btn-outline"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
            style={{ padding: '5px 9px' }}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <span className="user-info">
            <strong>{session.studentName || session.studentNo}</strong>
          </span>
          <button className="btn btn-outline" onClick={onLogout} style={{ fontSize: '12px', padding: '5px 11px' }}>
            {t('nav.logout')}
          </button>
          <button className="btn btn-danger" onClick={onAccountDelete} style={{ fontSize: '12px', padding: '5px 11px' }}>
            {t('nav.withdraw')}
          </button>
        </div>
      </header>

      <nav className="nav-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab${view === tab.id ? ' active' : ''}`}
            onClick={() => setView(tab.id)}
          >
            {t(tab.key)}
          </button>
        ))}
      </nav>

      <div className="main-content">
        {/* ── 홈 ── */}
        {view === 'home' && (
          <div className="dashboard-grid">
            {/* 설문 배너 */}
            <a
              href="https://akademiya.kr/surveys/public/7"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                gridColumn: '1 / -1', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '8px', padding: '8px 16px',
                background: 'rgba(79, 195, 247, 0.08)', border: '1px solid rgba(79, 195, 247, 0.3)',
                borderRadius: '8px', color: 'var(--primary)', fontSize: '13px',
                fontWeight: '500', textDecoration: 'none', transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79, 195, 247, 0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(79, 195, 247, 0.08)')}
            >
              <span>📋</span>
              <span>더 나은 GMCAuto 2를 만들기 위해 설문조사에 참여해주세요! (~7월 6일)</span>
              <span style={{ fontSize: '11px', opacity: 0.7 }}>↗</span>
            </a>

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
                  <p>
                    {t('home.registerDesc')}
                    {weekend && (
                      <><br /><span style={{ color: 'var(--warning)', fontWeight: '600' }}>
                        {t('home.weekendNotice', { date: targetDate })}
                      </span></>
                    )}
                  </p>
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
                <button className="btn btn-primary btn-lg" onClick={() => setView('apply')}>
                  {t('home.quickBtn')}
                </button>
              </div>
            </div>

            {/* 슬롯 현황 */}
            <div className="card">
              <div className="card-header">
                <h2>{t('home.slotsTitle')}</h2>
                <p>
                  {weekend ? t('home.slotsNextWorkday', { date: targetDate }) : t('home.slotsToday')}{' '}
                  ({takenSlots.length})
                  {weekend && <span style={{ marginLeft: '6px', color: 'var(--warning)', fontSize: '11px', fontWeight: '600' }}>{t('home.holidayLabel')}</span>}
                </p>
              </div>
              <div className="card-body">
                {scheduleLoading ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '14px' }}>
                    {t('home.slotsLoading')}
                  </div>
                ) : takenSlots.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '14px' }}>
                    {t('home.slotsEmpty')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {[...takenSlots].sort().map(slot => (
                      <span key={slot} style={{
                        padding: '3px 9px', borderRadius: '4px', fontSize: '12px', fontWeight: '500',
                        background: mySchedule?.time === slot ? 'var(--primary)' : 'var(--danger-light)',
                        color: mySchedule?.time === slot ? '#0a1929' : 'var(--danger)',
                        border: `1px solid ${mySchedule?.time === slot ? 'var(--primary)' : 'var(--danger)'}`,
                      }}>
                        {slot} {mySchedule?.time === slot ? t('home.meLabel') : ''}
                      </span>
                    ))}
                  </div>
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
        )}

        {/* ── PASS 신청 ── */}
        {view === 'apply' && <PassForm session={session} addLog={addLog} />}

        {/* ── 신청 내역 ── */}
        {view === 'history' && <PassHistory session={session} />}

        {/* ── 관리자 대시보드 ── */}
        {view === 'admin' && (session.role ?? 0) >= 1 && (
          <Suspense fallback={
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', width: '26px', height: '26px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
            </div>
          }>
            <AdminDashboard session={session} />
          </Suspense>
        )}
      </div>
    </div>
  )
}

function PassHistory({ session }: PassHistoryProps) {
  const { t } = useTranslation()
  const [records, setRecords] = useState<PassRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const fetchHistory = async () => {
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
      setError('내역을 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHistory() }, [])

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
