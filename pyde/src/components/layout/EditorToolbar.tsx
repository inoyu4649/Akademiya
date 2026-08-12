import { useTranslation } from 'react-i18next'
import styles from './EditorToolbar.module.css'

interface Props {
  fileName: string
  dirty: boolean
  running: boolean
  /** 런타임이 아직 준비되지 않았으면 실행 버튼을 잠근다 */
  ready: boolean
  onRun: () => void
  onStop: () => void
  onDownload: () => void
}

/** 맥에서는 Ctrl이 아니라 ⌘가 실제 단축키다 — 안내 문구를 플랫폼에 맞춘다 */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const RUN_HINT = IS_MAC ? '⌘↵' : 'Ctrl+↵'

export default function EditorToolbar({
  fileName,
  dirty,
  running,
  ready,
  onRun,
  onStop,
  onDownload,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className={styles.group}>
      <span className={styles.fileName}>
        {fileName}
        {dirty && (
          <span className={styles.dirty} title={t('files.unsaved')} aria-label={t('files.unsaved')}>
            ●
          </span>
        )}
      </span>

      {running ? (
        <button className={styles.stopBtn} onClick={onStop}>
          ■ {t('header.stop')}
        </button>
      ) : (
        <button className={styles.runBtn} onClick={onRun} disabled={!ready}>
          ▶ {t('header.run')}
          <span className={styles.shortcut}>{RUN_HINT}</span>
        </button>
      )}

      <button className={styles.iconBtn} onClick={onDownload}>
        {t('header.download')}
      </button>
    </div>
  )
}
