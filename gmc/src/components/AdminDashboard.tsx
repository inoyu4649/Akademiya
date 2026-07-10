import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as XLSX from 'xlsx'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import type { SessionData, StatRecord, UserRecord } from '../types'

const PIE_COLORS    = ['#4fc3f7', '#4caf50', '#ff9800', '#f44336', '#ce93d8']
const SUCCESS_COLORS = ['#4caf50', '#f44336']

interface AdminDashboardProps {
  session: SessionData
}

interface ChartCardProps {
  title: string
  children: React.ReactNode
}

interface EmptyChartProps {
  label: string
}

interface UserManagerProps {
  session: SessionData
  roleNames: string[]
  ROLE_COLORS: string[]
}

const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: PieLabelRenderProps) => {
  if (
    cx === undefined || cy === undefined ||
    midAngle === undefined || innerRadius === undefined ||
    outerRadius === undefined || percent === undefined || percent < 0.05
  ) return null
  const cxN = Number(cx)
  const cyN = Number(cy)
  const irN = Number(innerRadius)
  const orN = Number(outerRadius)
  const RADIAN = Math.PI / 180
  const radius = irN + (orN - irN) * 0.55
  const x = cxN + radius * Math.cos(-midAngle * RADIAN)
  const y = cyN + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export default function AdminDashboard({ session }: AdminDashboardProps) {
  const { t } = useTranslation()
  const [stats, setStats]         = useState<StatRecord[]>([])
  const [loading, setLoading]     = useState(false)
  const [grade, setGrade]         = useState('')
  const [cls, setCls]             = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [showCharts, setShowCharts] = useState(false)

  const rawRoleNames = t('admin.roleNames', { returnObjects: true })
  const roleNames: string[] = Array.isArray(rawRoleNames)
    ? (rawRoleNames as string[])
    : ['일반', '통계 보기', '통계+다운로드', '관리자']

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sessionId: session.sessionId })
      if (grade)    params.set('grade', grade)
      if (cls)      params.set('cls', cls)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo)   params.set('dateTo', dateTo)
      const res  = await fetch(`/api/admin/stats?${params}`)
      const data = await res.json() as { success: boolean; records?: StatRecord[] }
      if (data.success) setStats(data.records || [])
    } catch { /* 무시 */ }
    finally { setLoading(false) }
  }, [session.sessionId, grade, cls, dateFrom, dateTo])

  useEffect(() => { queueMicrotask(() => fetchStats()) }, [fetchStats])

  const exportXlsx = () => {
    const timeCodeMap: Record<string, string> = {
      '1': t('pass.yaja1'),
      '2': t('pass.yaja2'),
      '3': t('pass.yaja12'),
    }
    const rows = stats.map(r => ({
      'ID': r.id,
      [t('admin.colStudentNo', '학번')]:       r.student_no,
      [t('admin.colGrade',    '학년')]:        r.grade,
      [t('admin.colClass',    '반')]:          parseInt(r.class,  10),
      [t('admin.colNo',       '번호')]:        parseInt(r.number, 10),
      [t('home.yajaLabel')]:                   timeCodeMap[r.time_code] || r.time_code,
      [t('admin.colScheduleTime', '신청시간')]: r.schedule_time,
      [t('admin.colApplyDate',    '신청일')]:   r.apply_date,
      [t('admin.colResult',       '결과')]:     r.success ? '✓' : '✗',
      [t('admin.colMessage',      '메시지')]:   r.message,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Stats')
    XLSX.writeFile(wb, `gmcauto_stats_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const timeCodeMap: Record<string, string> = {
    '1': t('pass.yaja1'),
    '2': t('pass.yaja2'),
    '3': t('pass.yaja12'),
  }

  const timeCodeData = Object.entries(
    stats.reduce<Record<string, number>>((acc, r) => {
      const label = timeCodeMap[r.time_code] || (r.time_code ? `코드 ${r.time_code}` : '기타')
      acc[label] = (acc[label] || 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  const hourData = Object.entries(
    stats.reduce<Record<string, number>>((acc, r) => {
      const hour = r.schedule_time ? r.schedule_time.slice(0, 2) + ':00' : '기타'
      acc[hour] = (acc[hour] || 0) + 1
      return acc
    }, {})
  ).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value }))

  const successCount = stats.filter(r => r.success).length
  const failCount    = stats.length - successCount
  const successData  = [
    { name: t('home.executed_success', '성공'), value: successCount },
    { name: t('home.executed_fail',    '실패'), value: failCount    },
  ].filter(d => d.value > 0)

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', fontSize: '13px',
    background: 'var(--bg-input)', color: 'var(--text)',
  }
  const labelStyle: React.CSSProperties = { fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px' }
  const userRole    = session.role ?? 0
  const ROLE_COLORS = ['var(--text-secondary)', 'var(--primary)', 'var(--success)', 'var(--danger)']

  return (
    <div className="card">
      <div className="card-header">
        <h2>{t('admin.title')}</h2>
        <p>{t('admin.subtitle')} · 권한 {userRole} ({roleNames[userRole] || '-'})</p>
      </div>
      <div className="card-body">

        {/* ── 필터 ── */}
        <div style={{
          display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end',
          marginBottom: '14px', padding: '12px 14px',
          background: 'var(--bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={labelStyle}>{t('admin.gradeLabel')}</span>
            <select value={grade} onChange={e => setGrade(e.target.value)} style={selectStyle}>
              <option value="">{t('admin.allGrades')}</option>
              <option value="1">1학년</option>
              <option value="2">2학년</option>
              <option value="3">3학년</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={labelStyle}>{t('admin.clsLabel')}</span>
            <select value={cls} onChange={e => setCls(e.target.value)} style={selectStyle}>
              <option value="">{t('admin.allCls')}</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <option key={n} value={String(n).padStart(2, '0')}>{n}반</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={labelStyle}>{t('admin.dateFrom')}</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={selectStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={labelStyle}>{t('admin.dateTo')}</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={selectStyle} />
          </div>
          <button
            className="btn btn-outline"
            onClick={() => { setGrade(''); setCls(''); setDateFrom(''); setDateTo('') }}
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            {t('admin.reset')}
          </button>
        </div>

        {/* ── 액션 버튼 ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', marginRight: '4px' }}>
            총 <strong style={{ color: 'var(--text)' }}>{stats.length.toLocaleString()}</strong>건
            {stats.length > 0 && (
              <span style={{ marginLeft: '8px' }}>
                (성공 <span style={{ color: 'var(--success)', fontWeight: 600 }}>{successCount}</span>
                {' / '}실패 <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{failCount}</span>)
              </span>
            )}
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-outline" onClick={() => setShowCharts(v => !v)} style={{ fontSize: '12px', padding: '5px 12px' }}>
            {showCharts ? t('admin.toggleChartHide') : t('admin.toggleChartShow')}
          </button>
          {userRole >= 2 && (
            <button className="btn btn-primary" onClick={exportXlsx} disabled={stats.length === 0} style={{ fontSize: '12px', padding: '5px 12px' }}>
              {t('admin.exportXlsx')}
            </button>
          )}
          <button className="btn btn-outline" onClick={fetchStats} disabled={loading} style={{ fontSize: '12px', padding: '5px 12px' }}>
            {t('admin.refresh')}
          </button>
        </div>

        {/* ── 차트 ── */}
        {showCharts && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
            <ChartCard title={t('admin.chartYaja')}>
              {timeCodeData.length === 0 ? <EmptyChart label={t('admin.chartEmpty')} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={timeCodeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} labelLine={false} label={renderPieLabel}>
                      {timeCodeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v}명`]} />
                    <Legend iconSize={11} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title={t('admin.chartHour')}>
              {hourData.length === 0 ? <EmptyChart label={t('admin.chartEmpty')} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                      formatter={(v) => [`${v}명`, '학생수']}
                    />
                    <Bar dataKey="value" name="학생수" fill="var(--primary)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title={t('admin.chartSuccess')}>
              {successData.length === 0 ? <EmptyChart label={t('admin.chartEmpty')} /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={successData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} labelLine={false} label={renderPieLabel}>
                      {successData.map((_, i) => <Cell key={i} fill={SUCCESS_COLORS[i % SUCCESS_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v}명`]} />
                    <Legend iconSize={11} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        )}

        {/* ── 테이블 ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: '24px', height: '24px', borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
            {t('admin.loading')}
          </div>
        ) : stats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            {t('admin.empty')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                  {[
                    '#',
                    t('admin.colStudentNo',    '학번'),
                    t('admin.colGrade',        '학년'),
                    t('admin.colClass',        '반'),
                    t('admin.colNo',           '번호'),
                    t('home.yajaLabel'),
                    t('admin.colScheduleTime', '신청시간'),
                    t('admin.colApplyDate',    '신청일'),
                    t('admin.colResult',       '결과'),
                    t('admin.colMessage',      '메시지'),
                  ].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, background: 'var(--bg)', color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((r, idx) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--card-bg)' : 'var(--bg)' }}>
                    <td style={{ padding: '5px 10px', color: 'var(--text-muted)' }}>{r.id}</td>
                    <td style={{ padding: '5px 10px', fontWeight: 500 }}>{r.student_no}</td>
                    <td style={{ padding: '5px 10px' }}>{r.grade}</td>
                    <td style={{ padding: '5px 10px' }}>{parseInt(r.class,  10)}</td>
                    <td style={{ padding: '5px 10px' }}>{parseInt(r.number, 10)}</td>
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{timeCodeMap[r.time_code] || r.time_code}</td>
                    <td style={{ padding: '5px 10px' }}>{r.schedule_time}</td>
                    <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>{r.apply_date}</td>
                    <td style={{ padding: '5px 10px' }}>
                      <span style={{ color: r.success ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {r.success ? t('admin.successLabel', '✓ 성공') : t('admin.failLabel', '✗ 실패')}
                      </span>
                    </td>
                    <td style={{ padding: '5px 10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }} title={r.message ?? ''}>
                      {r.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 사용자 권한 관리 (권한 3) ── */}
        {userRole >= 3 && <UserManager session={session} roleNames={roleNames} ROLE_COLORS={ROLE_COLORS} />}

        {/* ── GMC PASS 중단 기간 설정 (권한 3) ── */}
        {userRole >= 3 && <SuspendManager session={session} />}
      </div>
    </div>
  )
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
      <h4 style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</h4>
      {children}
    </div>
  )
}

function EmptyChart({ label }: EmptyChartProps) {
  return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
      {label}
    </div>
  )
}

interface SuspendPeriod {
  id: number
  start_date: string
  end_date: string
  created_at?: string
}

interface SuspendManagerProps {
  session: SessionData
}

function SuspendManager({ session }: SuspendManagerProps) {
  const { t } = useTranslation()
  const [periods, setPeriods]           = useState<SuspendPeriod[]>([])
  const [startDate, setStartDate]       = useState('')
  const [endDate, setEndDate]           = useState('')
  const [saving, setSaving]             = useState(false)
  const [message, setMessage]           = useState<{ success: boolean; text: string } | null>(null)

  const fetchPeriods = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/suspend?sessionId=${session.sessionId}`)
      const data = await res.json() as { success: boolean; periods?: SuspendPeriod[] }
      if (data.success) setPeriods(data.periods || [])
    } catch { /* ignore */ }
  }, [session.sessionId])

  useEffect(() => { queueMicrotask(() => fetchPeriods()) }, [fetchPeriods])

  const handleAdd = async () => {
    if (!startDate || !endDate) return
    if (startDate > endDate) {
      setMessage({ success: false, text: t('admin.suspend.invalidRange') })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res  = await fetch('/api/admin/suspend', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId: session.sessionId, startDate, endDate }),
      })
      const data = await res.json() as { success: boolean; message?: string }
      if (data.success) {
        setStartDate('')
        setEndDate('')
        fetchPeriods()
      } else {
        setMessage({ success: false, text: data.message || '추가 실패' })
      }
    } catch {
      setMessage({ success: false, text: '서버 오류' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 중단 기간을 삭제하시겠습니까?')) return
    try {
      const res  = await fetch(`/api/admin/suspend/${id}?sessionId=${session.sessionId}`, { method: 'DELETE' })
      const data = await res.json() as { success: boolean }
      if (data.success) fetchPeriods()
    } catch { /* ignore */ }
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', fontSize: '13px',
    background: 'var(--bg-input)', color: 'var(--text)',
  }

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
        {t('admin.suspend.title')}
      </h3>

      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end',
        padding: '10px 12px', background: 'var(--bg)',
        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '10px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('admin.suspend.startLabel')}</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('admin.suspend.endLabel')}</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={saving || !startDate || !endDate}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          {t('admin.suspend.addBtn')}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '7px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginBottom: '10px',
          background: message.success ? 'var(--success-light)' : 'var(--danger-light)',
          color:      message.success ? 'var(--success)'       : 'var(--danger)',
          border:    `1px solid ${message.success ? 'var(--success)' : 'var(--danger)'}`,
        }}>
          {message.text}
        </div>
      )}

      {periods.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '16px', fontSize: '12px',
          color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        }}>
          {t('admin.suspend.empty')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {[t('admin.suspend.colStart'), t('admin.suspend.colEnd'), t('admin.suspend.colManage')].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, background: 'var(--bg)', color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p, idx) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--card-bg)' : 'var(--bg)' }}>
                  <td style={{ padding: '5px 10px', fontWeight: 500 }}>{p.start_date}</td>
                  <td style={{ padding: '5px 10px', fontWeight: 500 }}>{p.end_date}</td>
                  <td style={{ padding: '5px 10px' }}>
                    <button
                      className="btn btn-outline"
                      onClick={() => handleDelete(p.id)}
                      style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    >
                      {t('admin.suspend.deleteBtn')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UserManager({ session, roleNames, ROLE_COLORS }: UserManagerProps) {
  const { t } = useTranslation()
  const [users, setUsers]           = useState<UserRecord[]>([])
  const [inputEmail, setInputEmail] = useState('')
  const [inputRole, setInputRole]   = useState('1')
  const [saving, setSaving]         = useState(false)
  const [message, setMessage]       = useState<{ success: boolean; text: string } | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/users?sessionId=${session.sessionId}`)
      const data = await res.json() as { success: boolean; users?: UserRecord[] }
      if (data.success) setUsers((data.users || []).filter(u => u.role > 0))
    } catch { /* ignore */ }
  }, [session.sessionId])

  useEffect(() => { queueMicrotask(() => fetchUsers()) }, [fetchUsers])

  const applyRole = useCallback(async (email: string, role: number) => {
    setSaving(true)
    setMessage(null)
    try {
      const res  = await fetch('/api/admin/users/role', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId: session.sessionId, email, role }),
      })
      const data = await res.json() as { success: boolean; message?: string }
      setMessage({ success: data.success, text: data.message || '' })
      if (data.success) fetchUsers()
    } catch {
      setMessage({ success: false, text: '서버 오류가 발생했습니다.' })
    } finally {
      setSaving(false)
    }
  }, [session.sessionId, fetchUsers])

  const handleGrant = () => {
    const email = inputEmail.trim()
    if (!email) return
    applyRole(email, parseInt(inputRole, 10))
    setInputEmail('')
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', fontSize: '13px',
    background: 'var(--bg-input)', color: 'var(--text)',
  }

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '18px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
        {t('admin.users.title')}
      </h3>

      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end',
        padding: '10px 12px', background: 'var(--bg)',
        borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '10px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('admin.users.emailLabel')}</span>
          <input
            value={inputEmail}
            onChange={e => setInputEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGrant()}
            placeholder={t('admin.users.emailPlaceholder')}
            style={{ ...inputStyle, width: '190px' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('admin.users.roleLabel')}</span>
          <select value={inputRole} onChange={e => setInputRole(e.target.value)} style={inputStyle}>
            {roleNames.map((label, i) => (
              <option key={i} value={i}>{i} — {label}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGrant}
          disabled={saving || !inputEmail.trim()}
          style={{ fontSize: '12px', padding: '6px 12px' }}
        >
          {t('admin.users.applyBtn')}
        </button>
      </div>

      {message && (
        <div style={{
          padding: '7px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginBottom: '10px',
          background: message.success ? 'var(--success-light)' : 'var(--danger-light)',
          color:      message.success ? 'var(--success)'       : 'var(--danger)',
          border:    `1px solid ${message.success ? 'var(--success)' : 'var(--danger)'}`,
        }}>
          {message.text}
        </div>
      )}

      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '7px' }}>
        {t('admin.users.countLabel', { count: users.length })}
      </div>

      {users.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '16px', fontSize: '12px',
          color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        }}>
          {t('admin.users.empty')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {[
                  t('admin.users.colEmail'),
                  t('admin.users.colStudentNo'),
                  t('admin.users.colRole'),
                  t('admin.users.colLastActive'),
                  t('admin.users.colManage'),
                ].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, background: 'var(--bg)', color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <tr key={u.akademiya_email ?? u.student_no ?? idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--card-bg)' : 'var(--bg)' }}>
                  <td style={{ padding: '5px 10px' }}>{u.akademiya_email || '-'}</td>
                  <td style={{ padding: '5px 10px', fontWeight: 500 }}>{u.student_no || '-'}</td>
                  <td style={{ padding: '5px 10px' }}>
                    <span style={{ color: ROLE_COLORS[u.role], fontWeight: 600 }}>
                      {u.role} — {roleNames[u.role] || '-'}
                    </span>
                  </td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-secondary)' }}>
                    {u.updated_at ? u.updated_at.slice(0, 10) : '-'}
                  </td>
                  <td style={{ padding: '5px 10px' }}>
                    {u.akademiya_email === session.akademiyaEmail ? (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('admin.users.self')}</span>
                    ) : !u.akademiya_email ? (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>-</span>
                    ) : (
                      <button
                        className="btn btn-outline"
                        onClick={() => applyRole(u.akademiya_email!, 0)}
                        disabled={saving}
                        style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      >
                        {t('admin.users.revokeBtn')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
