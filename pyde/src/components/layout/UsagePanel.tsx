// 프로필을 눌렀을 때 나오는 사용량 패널.
//
// 왜 두 줄로 나눠 보여주나: 한도는 **Akademiya Cloud 계정 단위**로 걸려 있고 PyDe는
// 그 안의 자기 폴더만 쓴다. 하나만 보여주면 "PyDe에서 얼마 안 썼는데 왜 저장이 막히지"
// 또는 그 반대의 오해가 생긴다. 그래서 PyDe 몫과 계정 전체를 함께 보여준다.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getUsage, type UsageResponse } from '../../api/cloud.api'
import { formatBytes } from '../../utils/bytes'
import styles from './UsagePanel.module.css'

function Meter({ used, total }: { used: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, used / total) : 0
  return (
    <div className={styles.meter}>
      <div
        className={`${styles.meterFill} ${ratio >= 0.9 ? styles.meterFull : ''}`}
        style={{ width: `${Math.max(ratio * 100, used > 0 ? 2 : 0)}%` }}
      />
    </div>
  )
}

export default function UsagePanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<UsageResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getUsage()
      .then((res) => !cancelled && setData(res))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) {
    return (
      <div className={styles.panel} role="dialog" aria-label={t('usage.title')}>
        <p className={styles.error}>{t('usage.loadFailed')}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={styles.panel} role="dialog" aria-label={t('usage.title')}>
        <p className={styles.loading}>{t('usage.loading')}</p>
      </div>
    )
  }

  // 폴더 한도가 없으면(설정 안 됨) 계정 한도를 그대로 쓴다
  const pydeLimit = data.folderLimit ?? data.limits.maxTotalBytes

  return (
    <div className={styles.panel} role="dialog" aria-label={t('usage.title')}>
      <h3 className={styles.title}>{t('usage.title')}</h3>

      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.rowLabel}>{t('usage.pyde')}</span>
          <span className={styles.rowValue}>
            {formatBytes(data.folderUsage.bytes)} / {formatBytes(pydeLimit)}
          </span>
        </div>
        <Meter used={data.folderUsage.bytes} total={pydeLimit} />
        <span className={styles.rowSub}>{t('usage.fileCount', { count: data.folderUsage.files })}</span>
      </div>

      <div className={styles.row}>
        <div className={styles.rowHead}>
          <span className={styles.rowLabel}>{t('usage.account')}</span>
          <span className={styles.rowValue}>
            {formatBytes(data.usage.bytes)} / {formatBytes(data.limits.maxTotalBytes)}
          </span>
        </div>
        <Meter used={data.usage.bytes} total={data.limits.maxTotalBytes} />
        <span className={styles.rowSub}>
          {t('usage.fileCountOf', { count: data.usage.files, max: data.limits.maxFiles })}
        </span>
      </div>

      <p className={styles.note}>{t('usage.note')}</p>
    </div>
  )
}
