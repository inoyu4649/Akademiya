import { useTranslation } from 'react-i18next'

interface ScheduleTimelineProps {
  takenSlots: string[]
  mySlot: string | null
}

const START_MIN = 9 * 60       // 09:00
const END_MIN = 17 * 60 + 39   // 17:39 (포함)

function toHHMM(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** 09:00~17:39을 30분 단위 행으로 나눈다 (각 행은 최대 30개의 분 단위 셀을 가짐) */
function buildRows(): number[][] {
  const rows: number[][] = []
  let cur = START_MIN
  while (cur <= END_MIN) {
    const rowStart = cur - (cur % 30)
    const rowEnd = Math.min(rowStart + 29, END_MIN)
    const row: number[] = []
    for (let m = Math.max(cur, rowStart); m <= rowEnd; m++) row.push(m)
    rows.push(row)
    cur = rowEnd + 1
  }
  return rows
}

export default function ScheduleTimeline({ takenSlots, mySlot }: ScheduleTimelineProps) {
  const { t } = useTranslation()
  const taken = new Set(takenSlots)
  const rows = buildRows()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {rows.map(row => (
        <div key={row[0]} style={{ display: 'flex', alignItems: 'stretch', gap: '6px' }}>
          <span style={{
            flexShrink: 0, width: '42px', fontSize: '10.5px', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center',
          }}>
            {toHHMM(row[0])}
          </span>
          <div style={{
            display: 'flex', flex: 1, height: '18px',
            border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden',
          }}>
            {row.map(min => {
              const time = toHHMM(min)
              const isMine = mySlot === time
              const isTaken = taken.has(time)
              const bg = isMine
                ? 'var(--primary)'
                : isTaken
                ? 'var(--danger)'
                : 'var(--bg-hover)'
              return (
                <div
                  key={time}
                  title={time}
                  style={{
                    flex: 1,
                    minWidth: '2px',
                    background: bg,
                    borderRight: min === row[row.length - 1] ? 'none' : '1px solid var(--card-bg)',
                    cursor: 'default',
                  }}
                />
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--primary)', display: 'inline-block' }} />
          {t('home.legendMine')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--danger)', display: 'inline-block' }} />
          {t('home.legendTaken')}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--bg-hover)', border: '1px solid var(--border)', display: 'inline-block' }} />
          {t('home.legendEmpty')}
        </span>
      </div>
    </div>
  )
}
