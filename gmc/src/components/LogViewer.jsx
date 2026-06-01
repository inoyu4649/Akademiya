import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

export default function LogViewer({ logs }) {
  const { t } = useTranslation()
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  if (logs.length === 0) {
    return (
      <div className="log-container" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        {t('home.logTitle', '활동 기록이 없습니다')}
      </div>
    )
  }

  return (
    <div className="log-container" ref={containerRef}>
      {logs.map((log, i) => (
        <div key={i} className="log-entry">
          <span className="log-time">[{log.time}]</span>
          <span className={`log-message log-${log.type}`}>{log.message}</span>
        </div>
      ))}
    </div>
  )
}
