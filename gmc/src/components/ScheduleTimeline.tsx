import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { TakenSlotDetail } from '../types'

interface ScheduleTimelineProps {
  takenSlots: string[]
  mySlot: string | null
  /** 시간대별 상세 정보(신청자 학번). 서버가 권한 1 이상에서만 studentNo를 채워 내려준다. */
  slotDetails?: TakenSlotDetail[]
}

interface TooltipState {
  time: string
  studentNo?: string
  left: number
  top: number
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

export default function ScheduleTimeline({ takenSlots, mySlot, slotDetails }: ScheduleTimelineProps) {
  const { t } = useTranslation()
  const taken = new Set(takenSlots)
  const rows = buildRows()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const studentNoByTime = new Map(
    (slotDetails ?? [])
      .filter((d): d is TakenSlotDetail & { studentNo: string } => !!d.studentNo)
      .map(d => [d.time, d.studentNo])
  )

  const showTooltip = useCallback((time: string, el: HTMLElement) => {
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    const cellRect = el.getBoundingClientRect()
    setTooltip({
      time,
      studentNo: studentNoByTime.get(time),
      left: cellRect.left - containerRect.left + cellRect.width / 2,
      top: cellRect.top - containerRect.top,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotDetails])

  const hideTooltip = useCallback(() => setTooltip(null), [])

  // 타임라인 바깥을 탭/클릭하면 닫는다 (모바일에서 mouseleave가 발생하지 않으므로 필요)
  useEffect(() => {
    if (!tooltip) return
    const handleOutside = (e: Event) => {
      if (containerRef.current && e.target instanceof Node && !containerRef.current.contains(e.target)) {
        setTooltip(null)
      }
    }
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('mousedown', handleOutside)
    return () => {
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [tooltip])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.left,
            top: tooltip.top,
            transform: 'translate(-50%, calc(-100% - 6px))',
            background: 'rgba(17, 17, 17, 0.92)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 8px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {tooltip.studentNo ? `${tooltip.time} ${tooltip.studentNo}` : tooltip.time}
        </div>
      )}
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
                  onMouseEnter={e => showTooltip(time, e.currentTarget)}
                  onMouseLeave={hideTooltip}
                  onClick={e => {
                    if (tooltip?.time === time) hideTooltip()
                    else showTooltip(time, e.currentTarget)
                  }}
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
