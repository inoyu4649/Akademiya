import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import type { Conflict } from '../../hooks/useCloudSync'
import styles from './FileBrowser.module.css'

interface Props {
  conflict: Conflict
  /** 내 내용으로 덮어쓴다(revision 무시) */
  onOverwrite: () => void
  /** 서버에 저장된 내용을 다시 불러온다 — 내 편집분은 버려진다 */
  onReload: () => void
  onClose: () => void
}

/**
 * 낙관적 잠금이 걸렸을 때(=그 사이 다른 편집자가 저장) 사용자에게 선택을 받는다.
 * 자동으로 어느 한쪽을 고르지 않는다 — 어느 쪽을 골라도 누군가의 작업이 사라지므로
 * 그 결정은 사람이 해야 한다.
 */
export default function ConflictModal({ conflict, onOverwrite, onReload, onClose }: Props) {
  const { t, i18n } = useTranslation()

  return (
    <Modal
      title={t('files.conflict')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn btnGhost" onClick={onReload}>
            {t('files.conflictReload')}
          </button>
          <button className="btn btnPrimary" onClick={onOverwrite}>
            {t('files.conflictOverwrite')}
          </button>
        </>
      }
    >
      <p className={styles.muted}>
        {t('files.conflictDetail', {
          time: conflict.updatedAt
            ? new Date(conflict.updatedAt).toLocaleString(i18n.language)
            : '—',
        })}
      </p>
      <p className={styles.muted}>{t('files.conflictHint')}</p>
    </Modal>
  )
}
