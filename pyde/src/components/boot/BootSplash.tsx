import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BootLogLine, BootProgress } from '../../runtime/protocol'
import styles from './BootSplash.module.css'

interface Props {
  progress: BootProgress
  logs: BootLogLine[]
  error: string | null
  /** 휴대폰 첫 접속 — 데이터 사용량 안내를 확인해야 부팅(다운로드)이 시작된다 */
  mobileDataNotice: boolean
  onAcknowledgeMobileData: () => void
  onRetry: () => void
}

function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1)
}

export default function BootSplash({
  progress,
  logs,
  error,
  mobileDataNotice,
  onAcknowledgeMobileData,
  onRetry,
}: Props) {
  const { t } = useTranslation()
  const [showDetails, setShowDetails] = useState(false)
  const logBoxRef = useRef<HTMLDivElement>(null)

  // 새 로그가 붙으면 항상 맨 아래를 보여준다(주르륵 흐르는 느낌)
  useEffect(() => {
    const box = logBoxRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [logs, showDetails])

  const determinate = progress.fraction !== null
  const percent = determinate ? Math.round(progress.fraction! * 100) : null

  // 지금 무엇을 하는 중인지 — 다운로드 단계면 항목 이름까지 붙인다
  const stageText =
    progress.currentItem && (progress.stage === 'packages' || progress.stage === 'runtime')
      ? t('boot.stage.package', { name: progress.currentItem })
      : t(`boot.stage.${progress.stage}`)

  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div className={styles.blobs} aria-hidden="true">
        <div className={`${styles.blob} ${styles.blobBlue}`} />
        <div className={`${styles.blob} ${styles.blobYellow}`} />
        <div className={`${styles.blob} ${styles.blobGreen}`} />
      </div>

      <div className={styles.center}>
        <img className={styles.logo} src="/pyde_logo.png" alt="" />
        <div className={styles.title}>
          {mobileDataNotice ? t('boot.mobileDataNotice.title') : error ? t('boot.failed') : t('boot.title')}
        </div>
        {mobileDataNotice ? (
          <div className={styles.errorBox}>
            <div className={styles.subtitle}>{t('boot.mobileDataNotice.subtitle')}</div>
            <button className="btn btnPrimary" onClick={onAcknowledgeMobileData}>
              {t('boot.mobileDataNotice.continue')}
            </button>
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <div className={styles.errorDetail}>{error}</div>
            <button className="btn btnPrimary" onClick={onRetry}>
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className={styles.subtitle}>{t('boot.subtitle')}</div>
        )}
      </div>

      {/* 안내를 확인하기 전에는 다운로드/로그 자체가 없다 — 아직 워커를 띄우지 않았다 */}
      {mobileDataNotice ? null : (
      /* 실패했을 때도 로그는 계속 볼 수 있어야 한다 — 원인이 거기 적혀 있다 */
      <div className={styles.bottom}>
        {!error && (
          <>
            {/* 진행 바 바로 위 — 현재 다운로드/준비 중인 대상 */}
            <div className={styles.statusRow}>
              <span className={styles.statusText}>{stageText}</span>
              {progress.totalBytes > 0 && (
                <span className={styles.statusBytes}>
                  {formatMB(progress.loadedBytes)} / {formatMB(progress.totalBytes)} MB
                </span>
              )}
              {percent !== null && <span className={styles.percent}>{percent}%</span>}
            </div>

            <div className={styles.track}>
              {determinate ? (
                <div className={styles.fill} style={{ width: `${percent}%` }} />
              ) : (
                // 총량을 모르는 단계에서 임의의 퍼센트를 지어내지 않는다
                <div className={styles.indeterminate} />
              )}
            </div>
          </>
        )}

        <button
          className={styles.detailsToggle}
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
        >
          {showDetails ? t('boot.hideDetails') : t('boot.showDetails')}
        </button>

        {showDetails && (
          <div className={styles.logBox} ref={logBoxRef}>
            {logs.map((line, i) => (
              <div key={i} className={styles.logLine}>
                <span className={styles.logTime}>{(line.t / 1000).toFixed(2).padStart(6, ' ')}s</span>
                <span
                  className={
                    line.level === 'error'
                      ? styles.logError
                      : line.level === 'warn'
                        ? styles.logWarn
                        : styles.logInfo
                  }
                >
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
