import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileKind } from '../../hooks/useLocalDraft'
import type { SaveStatus } from '../../hooks/useCloudSync'
import styles from './EditorToolbar.module.css'

interface Props {
  fileName: string
  kind: FileKind
  running: boolean
  /** 런타임이 아직 준비되지 않았으면 실행 버튼을 잠근다 */
  ready: boolean
  onRun: () => void
  onRunAll: () => void
  onStop: () => void
  onDownload: () => void
  onNew: (kind: FileKind) => void
  onOpenFile: (file: File) => void
  // ── 클라우드 (로그인했을 때만 의미가 있다) ──
  signedIn: boolean
  saveStatus: SaveStatus
  savedAt: Date | null
  dirty: boolean
  readOnly: boolean
  /** 클라우드에 저장된 파일일 때만 공유할 수 있다 */
  canShare: boolean
  onSave: () => void
  onShare: () => void
  onBrowse: () => void
}

/** 맥에서는 Ctrl이 아니라 ⌘가 실제 단축키다 — 안내 문구를 플랫폼에 맞춘다 */
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const RUN_HINT = IS_MAC ? '⌘↵' : 'Ctrl+↵'

export default function EditorToolbar({
  fileName,
  kind,
  running,
  ready,
  onRun,
  onRunAll,
  onStop,
  onDownload,
  onNew,
  onOpenFile,
  signedIn,
  saveStatus,
  savedAt,
  dirty,
  readOnly,
  canShare,
  onSave,
  onShare,
  onBrowse,
}: Props) {
  const { t, i18n } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 바깥을 누르면 메뉴를 닫는다
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const isNotebook = kind === 'ipynb'

  return (
    <div className={styles.group}>
      <div className={styles.menuWrap} ref={menuRef}>
        <button className={styles.iconBtn} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
          {t('header.files')} ▾
        </button>
        {menuOpen && (
          <div className={styles.menu} role="menu">
            <button
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false)
                onNew('py')
              }}
            >
              {t('header.newPyFile')}
            </button>
            <button
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false)
                onNew('ipynb')
              }}
            >
              {t('header.newNotebookFile')}
            </button>
            <button
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false)
                fileInputRef.current?.click()
              }}
            >
              {t('header.openFile')}
            </button>
            {signedIn && (
              <button
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false)
                  onBrowse()
                }}
              >
                {t('header.openFromCloud')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 파일은 브라우저 안에서만 읽는다 — 업로드되지 않는다 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".py,.ipynb,text/x-python,application/json"
        className={styles.hiddenInput}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onOpenFile(file)
          e.target.value = '' // 같은 파일을 다시 열 수 있게 초기화
        }}
      />

      <span className={styles.fileName}>{fileName}</span>

      {running ? (
        <button className={styles.stopBtn} onClick={onStop}>
          ■ {t('header.stop')}
        </button>
      ) : (
        <button className={styles.runBtn} onClick={onRun} disabled={!ready}>
          ▶ {isNotebook ? t('header.runCell') : t('header.run')}
          <span className={styles.shortcut}>{RUN_HINT}</span>
        </button>
      )}

      {isNotebook && (
        <button className={styles.iconBtn} onClick={onRunAll} disabled={!ready || running}>
          ⏭ {t('header.runAll')}
        </button>
      )}

      {signedIn && !readOnly && (
        <button className={styles.iconBtn} onClick={onSave} disabled={saveStatus === 'saving'}>
          {t('header.save')}
        </button>
      )}

      {signedIn && canShare && (
        <button className={styles.iconBtn} onClick={onShare}>
          {t('header.share')}
        </button>
      )}

      <button className={styles.iconBtn} onClick={onDownload}>
        {t('header.download')}
      </button>

      {/* 자동 저장이 5분 간격이라 "지금 저장돼 있는지"를 항상 보여줘야 안심하고 쓴다 */}
      {signedIn && (
        <span className={styles.saveStatus}>
          {readOnly
            ? t('files.readOnly')
            : saveStatus === 'saving'
              ? t('files.saving')
              : dirty
                ? t('files.unsaved')
                : savedAt
                  ? t('files.savedAt', {
                      time: savedAt.toLocaleTimeString(i18n.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })
                  : ''}
        </span>
      )}
    </div>
  )
}
