import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileKind } from '../../hooks/useLocalDraft'
import type { Doc } from '../../hooks/useWorkspace'
import TabIcon from './TabIcon'
import { locationOf } from './tabLocation'
import styles from './TabBar.module.css'

interface Props {
  docs: Doc[]
  activeId: string
  /** 문서별 "저장되지 않음" 여부 — 판정 기준은 페이지가 정한다 */
  isDirty: (doc: Doc) => boolean
  onActivate: (docId: string) => void
  onClose: (docId: string) => void
  /** + 버튼에서 만들 파일 종류를 고른다 */
  onNew: (kind: FileKind) => void
  /** @returns 거절 사유(i18n 키 뒷부분). 성공이면 null */
  onRename: (docId: string, name: string) => string | null
}

export default function TabBar({
  docs,
  activeId,
  isDirty,
  onActivate,
  onClose,
  onNew,
  onRename,
}: Props) {
  const { t } = useTranslation()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const newMenuRef = useRef<HTMLDivElement>(null)

  // 바깥을 누르거나 Esc를 누르면 새 파일 메뉴를 닫는다
  useEffect(() => {
    if (!newMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!newMenuRef.current?.contains(e.target as Node)) setNewMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNewMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [newMenuOpen])

  useEffect(() => {
    if (!renamingId) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    // 확장자를 뺀 부분만 선택해 준다 — 보통 바꾸고 싶은 건 그쪽이다(VS Code와 동일)
    const dot = input.value.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
  }, [renamingId])

  const startRename = (doc: Doc) => {
    setRenamingId(doc.docId)
    setDraftName(doc.name)
    setError(null)
  }

  const cancelRename = () => {
    setRenamingId(null)
    setError(null)
  }

  const commitRename = () => {
    if (!renamingId) return
    const current = docs.find((d) => d.docId === renamingId)
    // 이름이 그대로면 조용히 닫는다
    if (!current || draftName === current.name) {
      cancelRename()
      return
    }
    const failure = onRename(renamingId, draftName)
    if (failure) {
      setError(failure)
      inputRef.current?.focus()
      return
    }
    cancelRename()
  }

  return (
    <div className={styles.bar} role="tablist" aria-label={t('files.title')}>
      {docs.map((doc) => {
        const active = doc.docId === activeId
        const dirty = isDirty(doc)
        const location = locationOf(doc)
        const renaming = renamingId === doc.docId

        return (
          <div
            key={doc.docId}
            className={`${styles.tab} ${active ? styles.tabActive : ''} ${renaming ? styles.tabRenaming : ''}`}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => !renaming && onActivate(doc.docId)}
            onDoubleClick={() => startRename(doc)}
            onKeyDown={(e) => {
              if (renaming) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate(doc.docId)
              } else if (e.key === 'F2') {
                e.preventDefault()
                startRename(doc)
              }
            }}
            // 가운데 버튼 클릭으로 닫기 — 브라우저 탭과 같은 관례
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(doc.docId)
              }
            }}
            title={renaming ? undefined : `${doc.name} — ${t(`files.location.${location}`)}`}
          >
            <TabIcon
              location={location}
              className={styles.locationIcon}
              title={t(`files.location.${location}`)}
            />

            {renaming ? (
              <input
                ref={inputRef}
                className={`${styles.renameInput} ${error ? styles.renameInputError : ''}`}
                value={draftName}
                onChange={(e) => {
                  setDraftName(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  // 이름 입력 중에는 탭 단축키가 끼어들면 안 된다
                  e.stopPropagation()
                  if (e.key === 'Enter') commitRename()
                  else if (e.key === 'Escape') cancelRename()
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('files.renameLabel')}
                title={error ? t(`files.nameError.${error}`) : undefined}
                spellCheck={false}
              />
            ) : (
              <span className={styles.tabName}>{doc.name}</span>
            )}

            {!renaming && dirty && <span className={styles.dirtyDot} title={t('files.unsaved')} />}

            {!renaming && (
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
            )}
          </div>
        )
      })}

      <div className={styles.newTabWrap} ref={newMenuRef}>
        <button
          className={`${styles.newTabBtn} ${newMenuOpen ? styles.newTabBtnOpen : ''}`}
          onClick={() => setNewMenuOpen((v) => !v)}
          aria-label={t('header.newFile')}
          aria-expanded={newMenuOpen}
          aria-haspopup="menu"
          title={t('header.newFile')}
        >
          +
        </button>

        {newMenuOpen && (
          <div className={styles.newMenu} role="menu">
            <button
              className={styles.newMenuItem}
              role="menuitem"
              onClick={() => {
                setNewMenuOpen(false)
                onNew('py')
              }}
            >
              {t('header.newPyFile')}
              <span className={styles.newMenuExt}>.py</span>
            </button>
            <button
              className={styles.newMenuItem}
              role="menuitem"
              onClick={() => {
                setNewMenuOpen(false)
                onNew('ipynb')
              }}
            >
              {t('header.newNotebookFile')}
              <span className={styles.newMenuExt}>.ipynb</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
