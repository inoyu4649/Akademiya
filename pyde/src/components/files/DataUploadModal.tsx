import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import { formatBytes } from '../../utils/bytes'
import styles from './FileBrowser.module.css'

interface Props {
  fileName: string
  sizeBytes: number
  busy: boolean
  error: string | null
  /** 클라우드 저장은 로그인이 있어야 한다 — 없으면 그 버튼만 비활성화한다 */
  signedIn: boolean
  onClose: () => void
  onUseLocal: () => void
  onUseCloud: () => void
}

/**
 * 업로드한 데이터를 "이번 세션에서만 쓸지" "Akademiya Cloud에 영구 저장할지" 고르는 모달.
 *
 * ⚠️ 새 모달을 만들지 않고 ConflictModal과 똑같은 재료(Modal + FileBrowser.module.css의
 *    .muted/.error)를 그대로 썼다 — "선택지 두 개 중 하나를 고른다"는 모양 자체가 이미
 *    있어서 새 스타일을 만들 이유가 없다.
 */
export default function DataUploadModal({
  fileName,
  sizeBytes,
  busy,
  error,
  signedIn,
  onClose,
  onUseLocal,
  onUseCloud,
}: Props) {
  const { t } = useTranslation()

  return (
    <Modal
      title={t('data.title')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn btnGhost" onClick={onUseLocal} disabled={busy}>
            {t('data.useLocal')}
          </button>
          <button
            className="btn btnPrimary"
            onClick={onUseCloud}
            disabled={busy || !signedIn}
            title={signedIn ? undefined : t('data.signInRequired')}
          >
            {t('data.useCloud')}
          </button>
        </>
      }
    >
      {error && <div className={styles.error}>{t([`data.error.${error}`, 'common.error'])}</div>}

      <p className={styles.muted}>{t('data.fileInfo', { name: fileName, size: formatBytes(sizeBytes) })}</p>
      <p className={styles.muted}>{t('data.localHint')}</p>
      <p className={styles.muted}>{t('data.cloudHint')}</p>
      {!signedIn && <p className={styles.muted}>{t('data.signInRequired')}</p>}
    </Modal>
  )
}
