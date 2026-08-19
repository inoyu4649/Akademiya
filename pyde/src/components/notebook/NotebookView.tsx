import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { useNotebook } from '../../notebook/useNotebook'
import NotebookCell from './NotebookCell'
import styles from './Notebook.module.css'

interface Props {
  nb: ReturnType<typeof useNotebook>
}

/**
 * Jupyter 사용자가 손에 익은 대로 쓸 수 있게 명령/편집 두 모드를 그대로 가져왔다.
 *   명령 모드: Esc로 진입. ↑↓/JK 이동, A 위 추가, B 아래 추가, DD 삭제,
 *             M 마크다운, Y 코드, Enter 편집 모드
 *   공통: Shift+Enter 실행 후 다음, Ctrl+Enter 제자리 실행
 */
export default function NotebookView({ nb }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  // D를 두 번 눌러 삭제 — 마지막 D를 누른 시각을 들고 있는다
  const lastDeleteKey = useRef(0)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // ⚠️ Monaco 안에서 올라온 키 이벤트는 절대 가로채지 않는다.
      //    mode 상태만 믿으면 포커스와 어긋난 순간(클릭 직후 등)에 사용자가 친 글자가
      //    셀 추가·삭제 단축키로 실행돼 버린다. 이벤트 출처를 직접 확인한다.
      if ((e.target as HTMLElement | null)?.closest?.('.monaco-editor')) return

      // 편집 모드에서는 Esc 말고는 전부 에디터에 맡긴다
      if (nb.mode === 'edit') {
        if (e.key === 'Escape') {
          e.preventDefault()
          nb.setMode('command')
          containerRef.current?.focus()
        }
        return
      }

      const id = nb.selectedId

      // Ctrl+Shift+↑/↓ 로 셀 순서 바꾸기 — 화살표만으로는 선택 이동이라 조합키를 쓴다
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        nb.moveCell(id, e.key === 'ArrowUp' ? -1 : 1)
        return
      }

      switch (e.key) {
        case 'Enter':
          if (e.shiftKey) {
            e.preventDefault()
            nb.runAndAdvance(id)
          } else if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            nb.runCell(id)
          } else {
            e.preventDefault()
            nb.setMode('edit')
          }
          break
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          nb.selectRelative(-1)
          break
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          nb.selectRelative(1)
          break
        case 'a':
          e.preventDefault()
          nb.insertCell(id, 'above')
          break
        case 'b':
          e.preventDefault()
          nb.insertCell(id, 'below')
          break
        case 'd': {
          e.preventDefault()
          const now = Date.now()
          // 500ms 안에 두 번이면 삭제. 한 번만 누른 건 무시한다(오조작 방지)
          if (now - lastDeleteKey.current < 500) {
            nb.deleteCell(id)
            lastDeleteKey.current = 0
          } else {
            lastDeleteKey.current = now
          }
          break
        }
        case 'm':
          e.preventDefault()
          nb.changeCellType(id, 'markdown')
          break
        case 'y':
          e.preventDefault()
          nb.changeCellType(id, 'code')
          break
        case 'i':
          // Jupyter는 II로 커널 인터럽트 — 여기서는 실행 중지에 대응
          e.preventDefault()
          nb.interrupt()
          break
      }
    },
    [nb]
  )

  // 선택된 셀이 화면 밖이면 따라 스크롤한다(키보드로만 이동할 때 필수)
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-cell-id="${nb.selectedId}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [nb.selectedId])

  return (
    <div
      className={styles.notebook}
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      role="list"
      aria-label={t('notebook.title')}
      // 셀 안 Monaco에서 Esc를 눌렀을 때 포커스를 되돌릴 대상
      data-notebook-root=""
    >
      {nb.notebook.cells.map((cell, index) => (
        <NotebookCell
          // ⚠️ cell.id가 아니라 nb.cellKey — 이유는 useNotebook의 moveCell 주석 참조
          key={nb.cellKey(cell.id)}
          cell={cell}
          selected={cell.id === nb.selectedId}
          editing={nb.mode === 'edit' && cell.id === nb.selectedId}
          running={nb.runningCellId === cell.id}
          queued={nb.isQueued(cell.id)}
          inputRequested={nb.inputRequestedCellId === cell.id}
          onSubmitStdin={nb.submitStdin}
          onSelect={() => nb.setSelectedId(cell.id)}
          onEdit={() => {
            nb.setSelectedId(cell.id)
            nb.setMode('edit')
          }}
          onEnterEdit={() => {
            nb.setSelectedId(cell.id)
            nb.setMode('edit')
          }}
          onLeaveEdit={() => nb.setMode('command')}
          onChange={(source) => nb.setCellSource(cell.id, source)}
          onRunAdvance={() => nb.runAndAdvance(cell.id)}
          onRunInPlace={() => nb.runCell(cell.id)}
          onMoveUp={() => nb.moveCell(cell.id, -1)}
          onMoveDown={() => nb.moveCell(cell.id, 1)}
          onDelete={() => nb.deleteCell(cell.id)}
          canMoveUp={index > 0}
          canMoveDown={index < nb.notebook.cells.length - 1}
          // 마지막 한 개는 지울 수 없다 — 빈 노트북은 편집할 곳 자체가 없어진다
          canDelete={nb.notebook.cells.length > 1}
        />
      ))}

      <div className={styles.addRow}>
        <button
          className={styles.addBtn}
          onClick={() => nb.insertCell(nb.notebook.cells[nb.notebook.cells.length - 1].id, 'below', 'code')}
        >
          + {t('notebook.addCode')}
        </button>
        <button
          className={styles.addBtn}
          onClick={() =>
            nb.insertCell(nb.notebook.cells[nb.notebook.cells.length - 1].id, 'below', 'markdown')
          }
        >
          + {t('notebook.addMarkdown')}
        </button>
      </div>
    </div>
  )
}
