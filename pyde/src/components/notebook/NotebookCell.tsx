import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { NbCell } from '../../notebook/nbformat'
import { renderMarkdown } from '../../notebook/markdown'
import { definePydeTheme, PYDE_THEME } from '../editor/pydeTheme'
import CellOutputs from './CellOutputs'
import styles from './Notebook.module.css'

interface Props {
  cell: NbCell
  selected: boolean
  editing: boolean
  running: boolean
  queued: boolean
  onSelect: () => void
  onEdit: () => void
  /** 에디터에 실제로 포커스가 들어왔다 = 편집 모드 */
  onEnterEdit: () => void
  /** 포커스가 빠졌다 = 명령 모드 */
  onLeaveEdit: () => void
  onChange: (source: string) => void
  onRunAdvance: () => void
  onRunInPlace: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  /** 첫 셀/마지막 셀, 그리고 마지막 남은 한 개는 각각 이동·삭제할 수 없다 */
  canMoveUp: boolean
  canMoveDown: boolean
  canDelete: boolean
}

/** 셀 버튼용 아이콘.
 *  이모지 대신 인라인 SVG를 쓴다 — 이모지는 OS마다 모양·크기가 달라 정렬이 깨지고
 *  currentColor를 따라오지 않아 비활성 상태를 색으로 나타낼 수 없다(탭 아이콘과 같은 이유). */
function Icon({ shape }: { shape: 'up' | 'down' | 'trash' }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shape === 'up' && <path d="M8 12.5V3.5M4 7l4-3.5L12 7" />}
      {shape === 'down' && <path d="M8 3.5v9M4 9l4 3.5L12 9" />}
      {shape === 'trash' && <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.2a.8.8 0 0 0 .8.8h3.2a.8.8 0 0 0 .8-.8L11 4.5" />}
    </svg>
  )
}

const LINE_HEIGHT = 21
const MIN_LINES = 1
/** 셀 하나가 화면을 다 차지하지 않도록 상한을 둔다(그 안에서 스크롤) */
const MAX_LINES = 30

export default function NotebookCell({
  cell,
  selected,
  editing,
  running,
  queued,
  onSelect,
  onEdit,
  onEnterEdit,
  onLeaveEdit,
  onChange,
  onRunAdvance,
  onRunInPlace,
  onMoveUp,
  onMoveDown,
  onDelete,
  canMoveUp,
  canMoveDown,
  canDelete,
}: Props) {
  const { t } = useTranslation()
  const isCode = cell.cell_type === 'code'
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)

  // 키보드로 편집 모드에 들어온 경우(Enter) 실제 포커스도 옮겨줘야 타이핑이 먹힌다.
  // 이게 없으면 "편집 모드인데 글자가 안 써지는" 상태가 된다.
  useEffect(() => {
    if (editing && selected) editorRef.current?.focus()
  }, [editing, selected])

  // 줄 수에 맞춰 셀 높이를 키운다(노트북은 셀마다 내용 길이가 제각각이다).
  // ⚠️ 이 높이만 정해주고 automaticLayout을 끄면 안 된다 — 아래 옵션의 주석 참조.
  const height = useMemo(() => {
    const lines = Math.max(MIN_LINES, Math.min(MAX_LINES, cell.source.split('\n').length))
    return lines * LINE_HEIGHT + 16
  }, [cell.source])

  const marker = running ? '[*]' : queued ? '[…]' : isCode ? `[${cell.execution_count ?? ' '}]` : ''

  // ⚠️ 셀도 자기 테마를 직접 정의해야 한다. Monaco 테마는 전역이지만 **정의는 전역이 아니라
  //    누군가 defineTheme을 호출해야 생긴다.** 노트북을 먼저 열면 CodeEditor(.py)가 한 번도
  //    마운트되지 않아 'pyde-dark'가 없는 상태가 되고, Monaco는 모르는 테마 이름을 받으면
  //    조용히 기본 'vs'(밝은 테마)로 떨어진다 → 셀 안이 하얗게 뜬다.
  const handleBeforeMount: BeforeMount = (monaco) => {
    definePydeTheme(monaco)
  }

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor

    // ⚠️ 편집/명령 모드는 "에디터에 포커스가 있는가"로 판정한다.
    //    클릭만으로 커서를 넣었을 때도 편집 모드가 되어야 한다. 안 그러면 사용자가
    //    타이핑한 a·b·d 같은 글자를 노트북이 셀 추가/삭제 단축키로 가로챈다.
    editor.onDidFocusEditorText(onEnterEdit)
    editor.onDidBlurEditorText(onLeaveEdit)

    // Jupyter 관례: Shift+Enter는 실행 후 다음 셀, Ctrl+Enter는 제자리 실행
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, onRunAdvance)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRunInPlace)
    // Esc로 명령 모드 복귀 — Monaco 안에서 눌러야 하므로 여기서 잡는다
    editor.addCommand(monaco.KeyCode.Escape, () => {
      onLeaveEdit()
      // 포커스를 노트북 컨테이너로 돌려야 방향키·A/B 같은 명령이 먹는다
      const container = editor.getDomNode()?.closest<HTMLElement>('[data-notebook-root]')
      container?.focus()
    })
  }

  const showEditor = isCode || editing

  return (
    <div
      className={[
        styles.cell,
        selected ? styles.cellSelected : '',
        editing && selected ? styles.cellEditing : '',
      ].join(' ')}
      onClick={onSelect}
      data-cell-id={cell.id}
    >
      <div className={styles.gutter}>
        <span className={running ? styles.markerRunning : styles.marker}>{marker}</span>
      </div>

      {/* 셀 도구 — 평소엔 흐리게 두고 hover·선택 시 또렷해진다(Jupyter의 셀 툴바 자리와 같다).
          클릭이 셀로 새어 나가지 않게 막는다 — 지울 셀을 먼저 선택할 이유가 없다. */}
      <div className={styles.cellActions}>
        <button
          className={styles.cellActionBtn}
          disabled={!canMoveUp}
          onClick={(e) => {
            e.stopPropagation()
            onMoveUp()
          }}
          title={t('notebook.moveUp')}
          aria-label={t('notebook.moveUp')}
        >
          <Icon shape="up" />
        </button>
        <button
          className={styles.cellActionBtn}
          disabled={!canMoveDown}
          onClick={(e) => {
            e.stopPropagation()
            onMoveDown()
          }}
          title={t('notebook.moveDown')}
          aria-label={t('notebook.moveDown')}
        >
          <Icon shape="down" />
        </button>
        <button
          className={`${styles.cellActionBtn} ${styles.cellActionDanger}`}
          disabled={!canDelete}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title={t('notebook.deleteCell')}
          aria-label={t('notebook.deleteCell')}
        >
          <Icon shape="trash" />
        </button>
      </div>

      <div className={styles.cellBody}>
        {showEditor ? (
          <div className={styles.editorBox} style={{ height }}>
            <Editor
              language={isCode ? 'python' : 'markdown'}
              theme={PYDE_THEME}
              value={cell.source}
              onChange={(v) => onChange(v ?? '')}
              beforeMount={handleBeforeMount}
              onMount={handleEditorMount}
              options={{
                fontFamily: "'D2Coding', 'Cascadia Code', Consolas, monospace",
                fontSize: 13.5,
                lineHeight: LINE_HEIGHT,
                minimap: { enabled: false },
                lineNumbers: 'off',
                folding: false,
                glyphMargin: false,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 0,
                scrollBeyondLastLine: false,
                // ⚠️ 반드시 켜 둔다. 껐더니 셀이 마운트되는 시점에 컨테이너 크기가 아직
                //    0이면 Monaco가 그대로 0×0에 머물러, **클릭할 텍스트 영역 자체가 없어
                //    편집 모드로 들어갈 수 없었다.** 마운트 타이밍에 따라 되기도 하고 안 되기도
                //    하는 경쟁 조건이라 더 고약했다. 셀마다 ResizeObserver가 붙는 비용보다
                //    "클릭해도 커서가 안 잡히는" 쪽이 비교할 수 없이 나쁘다.
                automaticLayout: true,
                overviewRulerLanes: 0,
                renderLineHighlight: 'none',
                tabSize: 4,
                padding: { top: 8, bottom: 8 },
                scrollbar: { vertical: 'auto', verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                guides: { indentation: isCode },
              }}
            />
          </div>
        ) : (
          // 마크다운은 편집 중이 아닐 때 렌더링된 모습으로 보여준다(더블클릭하면 편집)
          <div className={styles.markdown} onDoubleClick={onEdit}>
            {cell.source.trim() ? (
              renderMarkdown(cell.source)
            ) : (
              <span className={styles.emptyMarkdown}>{t('notebook.emptyMarkdown')}</span>
            )}
          </div>
        )}

        {isCode && <CellOutputs outputs={cell.outputs ?? []} />}
      </div>
    </div>
  )
}
