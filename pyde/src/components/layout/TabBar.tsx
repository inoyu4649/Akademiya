import { useTranslation } from 'react-i18next'
import type { Doc } from '../../hooks/useWorkspace'
import styles from './TabBar.module.css'

interface Props {
  docs: Doc[]
  activeId: string
  /** 문서별 "저장되지 않음" 여부 — 판정 기준은 페이지가 정한다 */
  isDirty: (doc: Doc) => boolean
  onActivate: (docId: string) => void
  onClose: (docId: string) => void
  onNew: () => void
}

export default function TabBar({ docs, activeId, isDirty, onActivate, onClose, onNew }: Props) {
  const { t } = useTranslation()

  return (
    <div className={styles.bar} role="tablist" aria-label={t('files.title')}>
      {docs.map((doc) => {
        const active = doc.docId === activeId
        const dirty = isDirty(doc)
        return (
          <div
            key={doc.docId}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onActivate(doc.docId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate(doc.docId)
              }
            }}
            // 가운데 버튼 클릭으로 닫기 — 브라우저 탭과 같은 관례
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(doc.docId)
              }
            }}
            title={doc.name}
          >
            {doc.role === 'viewer' && (
              <span className={styles.readOnlyMark} title={t('files.readOnly')}>
                🔒
              </span>
            )}
            <span className={styles.tabName}>{doc.name}</span>

            {dirty && <span className={styles.dirtyDot} title={t('files.unsaved')} />}

            <button
              className={styles.closeBtn}
              onClick={(e) => {
                e.stopPropagation()
                onClose(doc.docId)
              }}
              aria-label={t('files.closeTab', { name: doc.name })}
            >
              ✕
            </button>
          </div>
        )
      })}

      <button className={styles.newTabBtn} onClick={onNew} aria-label={t('header.newFile')} title={t('header.newFile')}>
        +
      </button>
    </div>
  )
}
