import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Editor from '@monaco-editor/react'
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
  onChange,
  onRunAdvance,
  onRunInPlace,
}: Props) {
  const { t } = useTranslation()
  const isCode = cell.cell_type === 'code'

  // Monaco 인스턴스마다 ResizeObserver를 붙이면(automaticLayout) 셀이 많아질수록
  // 무거워진다. 줄 수로 높이를 직접 계산해 레이아웃을 고정한다.
  const height = useMemo(() => {
    const lines = Math.max(MIN_LINES, Math.min(MAX_LINES, cell.source.split('\n').length))
    return lines * LINE_HEIGHT + 16
  }, [cell.source])

  const marker = running ? '[*]' : queued ? '[…]' : isCode ? `[${cell.execution_count ?? ' '}]` : ''

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
              onMount={(editor, monaco) => {
                // Jupyter 관례: Shift+Enter는 실행 후 다음 셀, Ctrl+Enter는 제자리 실행
                editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, onRunAdvance)
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRunInPlace)
              }}
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
