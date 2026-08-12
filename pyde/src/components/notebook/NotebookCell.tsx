import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { NbCell } from '../../notebook/nbformat'
import { renderMarkdown } from '../../notebook/markdown'
import { PYDE_THEME } from '../editor/pydeTheme'
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
}: Props) {
  const { t } = useTranslation()
  const isCode = cell.cell_type === 'code'
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)

  // 키보드로 편집 모드에 들어온 경우(Enter) 실제 포커스도 옮겨줘야 타이핑이 먹힌다.
  // 이게 없으면 "편집 모드인데 글자가 안 써지는" 상태가 된다.
  useEffect(() => {
    if (editing && selected) editorRef.current?.focus()
  }, [editing, selected])

  // Monaco 인스턴스마다 ResizeObserver를 붙이면(automaticLayout) 셀이 많아질수록
  // 무거워진다. 줄 수로 높이를 직접 계산해 레이아웃을 고정한다.
  const height = useMemo(() => {
    const lines = Math.max(MIN_LINES, Math.min(MAX_LINES, cell.source.split('\n').length))
    return lines * LINE_HEIGHT + 16
  }, [cell.source])

  const marker = running ? '[*]' : queued ? '[…]' : isCode ? `[${cell.execution_count ?? ' '}]` : ''

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

      <div className={styles.cellBody}>
        {showEditor ? (
          <div className={styles.editorBox} style={{ height }}>
            <Editor
              language={isCode ? 'python' : 'markdown'}
              theme={PYDE_THEME}
              value={cell.source}
              onChange={(v) => onChange(v ?? '')}
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
                automaticLayout: false,
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
