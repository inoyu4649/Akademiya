import { useTranslation } from 'react-i18next'
import type { RunArtifact } from '../../runtime/protocol'
import styles from './CanvasPanel.module.css'

interface Props {
  artifacts: RunArtifact[]
}

export default function CanvasPanel({ artifacts }: Props) {
  const { t } = useTranslation()

  const download = (artifact: RunArtifact, index: number) => {
    // data: URL을 그대로 다운로드시킨다 — 서버를 거치지 않으므로 그림이 밖으로 나가지 않는다
    const a = document.createElement('a')
    a.href = `data:${artifact.mime};base64,${artifact.data}`
    a.download = `pyde-figure-${index + 1}.png`
    a.click()
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>{t('canvas.title')}</span>
        {artifacts.length > 0 && <span className={styles.count}>{artifacts.length}</span>}
      </div>

      <div className={styles.body}>
        {artifacts.length === 0 ? (
          <div className={styles.empty}>{t('canvas.empty')}</div>
        ) : (
          artifacts.map((artifact, i) => (
            <div className={styles.figure} key={i}>
              <img
                className={styles.image}
                src={`data:${artifact.mime};base64,${artifact.data}`}
                alt={`Figure ${i + 1}`}
              />
              <div className={styles.figureFoot}>
                <span className={styles.figureLabel}>Figure {i + 1}</span>
                <button className={styles.downloadBtn} onClick={() => download(artifact, i)}>
                  {t('canvas.download')}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
