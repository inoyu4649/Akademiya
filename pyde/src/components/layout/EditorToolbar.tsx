import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FileKind } from '../../hooks/useLocalDraft'
import type { SaveStatus } from '../../hooks/useCloudSync'
import { IS_MOBILE } from '../../utils/device'
import ToolbarIcon from './ToolbarIcon'
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
  /** "데이터 관리" 클릭 — 파일 선택은 그 모달 안에서 이뤄진다(IdePage의 DataManagerModal) */
  onOpenDataManager: () => void
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
  onOpenDataManager,
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

  // 휴대폰에서는 "이미 있는 파일을 열어 실행"만 남긴다. 새 파일 만들기·내 컴퓨터에서 열기·
  // 데이터 관리·다운로드는 좁은 화면에서 제대로 다룰 수 없어 감춘다(요구사항).
  // 그래서 남는 메뉴 항목이 클라우드 열기 하나뿐이고, 비로그인이면 아예 없다.
  const showFileMenu = IS_MOBILE ? signedIn : true

  return (
    <div className={styles.group}>
      {showFileMenu && (
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            className={styles.iconBtn}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={t('header.files')}
            title={t('header.files')}
          >
            <ToolbarIcon name="folder" />
            {!IS_MOBILE && <>{t('header.files')} ▾</>}
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              {!IS_MOBILE && (
                <>
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
                  <button
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false)
                      onOpenDataManager()
                    }}
                  >
                    {t('header.uploadData')}
                  </button>
                </>
              )}
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
      )}

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
        <button className={styles.stopBtn} onClick={onStop} aria-label={t('header.stop')} title={t('header.stop')}>
          <ToolbarIcon name="stop" />
          {!IS_MOBILE && t('header.stop')}
        </button>
      ) : (
        <button
          className={styles.runBtn}
          onClick={onRun}
          disabled={!ready}
          aria-label={isNotebook ? t('header.runCell') : t('header.run')}
          title={isNotebook ? t('header.runCell') : t('header.run')}
        >
          <ToolbarIcon name="play" />
          {!IS_MOBILE && (
            <>
              {isNotebook ? t('header.runCell') : t('header.run')}
              <span className={styles.shortcut}>{RUN_HINT}</span>
            </>
          )}
        </button>
      )}

      {isNotebook && (
        <button
          className={styles.iconBtn}
          onClick={onRunAll}
          disabled={!ready || running}
          aria-label={t('header.runAll')}
          title={t('header.runAll')}
        >
          <ToolbarIcon name="runAll" />
          {!IS_MOBILE && t('header.runAll')}
        </button>
      )}

      {signedIn && !readOnly && (
        <button
          className={styles.iconBtn}
          onClick={onSave}
          disabled={saveStatus === 'saving'}
          aria-label={t('header.save')}
          title={t('header.save')}
        >
          <ToolbarIcon name="save" />
          {!IS_MOBILE && t('header.save')}
        </button>
      )}

      {signedIn && canShare && (
        <button
          className={styles.iconBtn}
          onClick={onShare}
          aria-label={t('header.share')}
          title={t('header.share')}
        >
          <ToolbarIcon name="share" />
          {!IS_MOBILE && t('header.share')}
        </button>
      )}

      {/* 다운로드는 휴대폰에서 감춘다 — 받아도 열어서 이어 쓸 방법이 마땅치 않다 */}
      {!IS_MOBILE && (
        <button className={styles.iconBtn} onClick={onDownload}>
          <ToolbarIcon name="download" />
          {t('header.download')}
        </button>
      )}

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
