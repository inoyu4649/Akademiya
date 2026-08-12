import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { RunStatus, TerminalLine } from '../../runtime/useRunner'
import styles from './TerminalPanel.module.css'

interface Props {
  lines: TerminalLine[]
  status: RunStatus
  elapsedMs: number | null
  onClear: () => void
}

export default function TerminalPanel({ lines, status, elapsedMs, onClear }: Props) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  // 사용자가 위로 스크롤해 옛 출력을 읽는 중이면 새 줄이 와도 끌어내리지 않는다
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = bodyRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [lines])

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>{t('terminal.title')}</span>

        <span className={`${styles.badge} ${styles[status]}`} role="status" aria-live="polite">
          <span className={styles.dot} aria-hidden="true" />
          {t(`terminal.status.${status}`)}
        </span>

        {elapsedMs !== null && (
          <span className={styles.elapsed}>
            {t('terminal.elapsed', { seconds: (elapsedMs / 1000).toFixed(2) })}
          </span>
        )}

        <span className={styles.spacer} />
        <button className={styles.clearBtn} onClick={onClear}>
          {t('terminal.clear')}
        </button>
      </div>

      <div className={styles.body} ref={bodyRef} onScroll={handleScroll}>
        {lines.length === 0 ? (
          <div className={styles.empty}>{t('terminal.hint')}</div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={line.kind === 'traceback' ? styles.traceback : `${styles.line} ${styles[line.kind]}`}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
