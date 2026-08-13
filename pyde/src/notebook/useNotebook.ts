// ============================================================================
//  노트북 상태 + 셀 단위 실행
// ============================================================================
//  Pyodide는 전역 네임스페이스 하나를 계속 쓰므로 셀 사이에 변수가 자연스럽게
//  이어진다 — Jupyter의 핵심 동작이 공짜로 얻어진다.
//
//  실행은 **한 번에 하나씩**만 한다. Shift+Enter를 연타하면 큐에 쌓아 순서대로
//  돌린다(동시에 던지면 워커가 뒤엉키고 실행 순서가 뒤집힌다).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RunEvent } from '../runtime/usePyodideRuntime'
import {
  createCell,
  createNotebook,
  errorOutput,
  imageOutput,
  parseNotebook,
  resultOutput,
  serializeNotebook,
  streamOutput,
  type CellType,
  type NbCell,
  type NbOutput,
  type Notebook,
} from './nbformat'

export type CellMode = 'command' | 'edit'

interface Runtime {
  run: (code: string) => number
  interrupt: () => void
  subscribe: (listener: (e: RunEvent) => void) => () => void
}

/** 직렬화 비용이 있으므로 타이핑이 잠깐 멈췄을 때만 상위로 알린다 */
const SERIALIZE_DEBOUNCE_MS = 500

export function useNotebook(runtime: Runtime, initialSource: string, onChange: (text: string) => void) {
  const [notebook, setNotebook] = useState<Notebook>(
    () => parseNotebook(initialSource) ?? createNotebook()
  )
  const [selectedId, setSelectedId] = useState<string>(() => notebook.cells[0]?.id ?? '')
  const [mode, setMode] = useState<CellMode>('command')
  const [runningCellId, setRunningCellId] = useState<string | null>(null)
  /** 셀 id → key 세대. 순서를 바꾼 셀만 올라간다(아래 moveCell 주석 참조) */
  const [keyEpochs, setKeyEpochs] = useState<Record<string, number>>({})

  const execCounter = useRef(0)
  const queue = useRef<string[]>([])
  const activeRun = useRef<{ runId: number; cellId: string } | null>(null)
  // 이벤트 핸들러(실행 큐 등)에서 최신 노트북을 읽기 위한 거울.
  // 렌더 중에 ref를 쓰면 react-hooks 규칙 위반이라 이펙트에서 갱신한다.
  const notebookRef = useRef(notebook)
  useEffect(() => {
    notebookRef.current = notebook
  }, [notebook])

  // ── 상위(파일 초안)로 직렬화 결과 전달 ────────────────────────────────────
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onChangeRef.current(serializeNotebook(notebook))
    }, SERIALIZE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [notebook])

  // ⚠️ 언마운트(=탭 전환) 시 디바운스 대기 중이던 마지막 편집을 반드시 흘려보낸다.
  //    안 그러면 "타이핑하고 0.5초 안에 탭을 옮기면 방금 친 게 사라지는" 버그가 된다.
  useEffect(() => {
    return () => {
      onChangeRef.current(serializeNotebook(notebookRef.current))
    }
  }, [])

  // ── 셀 조작 ──────────────────────────────────────────────────────────────
  const updateCell = useCallback((id: string, patch: (cell: NbCell) => NbCell) => {
    setNotebook((nb) => ({
      ...nb,
      cells: nb.cells.map((c) => (c.id === id ? patch(c) : c)),
    }))
  }, [])

  const setCellSource = useCallback(
    (id: string, source: string) => {
      updateCell(id, (c) => (c.source === source ? c : { ...c, source }))
    },
    [updateCell]
  )

  const appendOutput = useCallback(
    (cellId: string, output: NbOutput) => {
      updateCell(cellId, (c) => {
        const outputs = c.outputs ?? []
        const last = outputs[outputs.length - 1]
        // 연속된 같은 스트림은 한 덩어리로 합친다(Jupyter도 그렇게 저장한다)
        if (
          output.output_type === 'stream' &&
          last?.output_type === 'stream' &&
          last.name === output.name
        ) {
          const merged: NbOutput = { ...last, text: [...last.text, ...output.text] }
          return { ...c, outputs: [...outputs.slice(0, -1), merged] }
        }
        return { ...c, outputs: [...outputs, output] }
      })
    },
    [updateCell]
  )

  const insertCell = useCallback(
    (anchorId: string, where: 'above' | 'below', type: CellType = 'code') => {
      const cell = createCell(type)
      setNotebook((nb) => {
        const index = nb.cells.findIndex((c) => c.id === anchorId)
        const at = index < 0 ? nb.cells.length : where === 'above' ? index : index + 1
        const cells = [...nb.cells]
        cells.splice(at, 0, cell)
        return { ...nb, cells }
      })
      setSelectedId(cell.id)
      return cell.id
    },
    []
  )

  const deleteCell = useCallback((id: string) => {
    setNotebook((nb) => {
      // 마지막 한 개는 지우지 않는다 — 빈 노트북은 편집할 곳이 없어진다
      if (nb.cells.length <= 1) return nb
      const index = nb.cells.findIndex((c) => c.id === id)
      if (index < 0) return nb
      const cells = nb.cells.filter((c) => c.id !== id)
      const nextSelected = cells[Math.min(index, cells.length - 1)]
      if (nextSelected) queueMicrotask(() => setSelectedId(nextSelected.id))
      return { ...nb, cells }
    })
  }, [])

  /**
   * 셀 순서 바꾸기.
   *
   * ⚠️ 자리를 맞바꾼 두 셀의 **React key를 함께 갈아끼운다**(`cellKey` 참조).
   *    key를 그대로 두면 React는 기존 fiber를 "이동"시키는데, StrictMode 개발 모드는
   *    그때 이펙트를 한 번 정리했다가 다시 실행한다. @monaco-editor/react는 정리 단계에서
   *    에디터를 dispose해 놓고 다시 만들지는 않아서, 이어지는 이펙트가 죽은 에디터에
   *    setModel을 호출하며 **앱 전체가 하얗게 내려앉는다**(실제로 재현했다).
   *    프로덕션 빌드에서는 StrictMode가 아무것도 하지 않아 재현되지 않지만, 개발 중에
   *    셀을 옮길 때마다 앱이 죽으면 아무도 이 기능을 손보지 못한다.
   *    key를 바꾸면 "이동"이 아니라 "지우고 새로 마운트"가 되어 두 경우 모두 안전하다.
   *    (대가는 옮긴 두 셀의 실행 취소 이력뿐이다 — 셀을 옮겼으면 잃어도 되는 것이다)
   */
  const moveCell = useCallback((id: string, delta: -1 | 1) => {
    const cells = notebookRef.current.cells
    const index = cells.findIndex((c) => c.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= cells.length) return
    const swappedWith = cells[target].id

    setNotebook((nb) => {
      const i = nb.cells.findIndex((c) => c.id === id)
      const t = i + delta
      if (i < 0 || t < 0 || t >= nb.cells.length) return nb
      const next = [...nb.cells]
      ;[next[i], next[t]] = [next[t], next[i]]
      return { ...nb, cells: next }
    })

    setKeyEpochs((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
      [swappedWith]: (prev[swappedWith] ?? 0) + 1,
    }))
  }, [])

  const changeCellType = useCallback(
    (id: string, type: CellType) => {
      updateCell(id, (c) => {
        if (c.cell_type === type) return c
        return type === 'code'
          ? { ...c, cell_type: 'code', execution_count: null, outputs: [] }
          : { id: c.id, cell_type: 'markdown', source: c.source, metadata: c.metadata }
      })
    },
    [updateCell]
  )

  const clearOutputs = useCallback((id?: string) => {
    setNotebook((nb) => ({
      ...nb,
      cells: nb.cells.map((c) =>
        c.cell_type === 'code' && (id === undefined || c.id === id)
          ? { ...c, outputs: [], execution_count: null }
          : c
      ),
    }))
  }, [])

  // ── 실행 ─────────────────────────────────────────────────────────────────
  const startNext = useCallback(() => {
    if (activeRun.current) return
    // 재귀 대신 루프로 건너뛴다(자기 자신을 참조하는 useCallback은 규칙 위반이기도 하다)
    for (;;) {
      const cellId = queue.current.shift()
      if (!cellId) {
        setRunningCellId(null)
        return
      }
      const cell = notebookRef.current.cells.find((c) => c.id === cellId)
      // 마크다운이거나 빈 셀은 건너뛴다 — Jupyter도 빈 셀엔 실행 번호를 주지 않는다
      if (!cell || cell.cell_type !== 'code' || !cell.source.trim()) continue

      updateCell(cellId, (c) => ({ ...c, outputs: [], execution_count: null }))
      setRunningCellId(cellId)
      const runId = runtime.run(cell.source)
      activeRun.current = { runId, cellId }
      return
    }
  }, [runtime, updateCell])

  useEffect(() => {
    const unsubscribe = runtime.subscribe((e) => {
      const active = activeRun.current
      if (!active || e.runId !== active.runId) return
      const cellId = active.cellId

      switch (e.type) {
        case 'stdout':
          appendOutput(cellId, streamOutput('stdout', e.text))
          break
        case 'stderr':
          appendOutput(cellId, streamOutput('stderr', e.text))
          break
        case 'artifact':
          appendOutput(cellId, imageOutput(e.artifact.data))
          break
        case 'run-done': {
          const count = ++execCounter.current
          if (e.result !== null) appendOutput(cellId, resultOutput(count, e.result))
          updateCell(cellId, (c) => ({ ...c, execution_count: count }))
          activeRun.current = null
          startNext()
          break
        }
        case 'run-error': {
          const count = ++execCounter.current
          appendOutput(cellId, errorOutput(e.friendly))
          updateCell(cellId, (c) => ({ ...c, execution_count: count }))
          activeRun.current = null
          // 오류가 나면 남은 큐를 버린다 — Jupyter의 "Run All"과 같은 동작이고,
          // 앞 셀이 실패했는데 뒤를 계속 돌리면 오류가 줄줄이 이어져 원인이 묻힌다.
          queue.current = []
          setRunningCellId(null)
          break
        }
      }
    })
    return unsubscribe
  }, [runtime, appendOutput, updateCell, startNext])

  const runCell = useCallback(
    (id: string) => {
      queue.current.push(id)
      startNext()
    },
    [startNext]
  )

  const runAll = useCallback(() => {
    queue.current = notebookRef.current.cells.filter((c) => c.cell_type === 'code').map((c) => c.id)
    startNext()
  }, [startNext])

  const interrupt = useCallback(() => {
    queue.current = []
    runtime.interrupt()
  }, [runtime])

  /** Shift+Enter — 실행하고 아래 셀로 이동(없으면 새로 만든다) */
  const runAndAdvance = useCallback(
    (id: string) => {
      runCell(id)
      const cells = notebookRef.current.cells
      const index = cells.findIndex((c) => c.id === id)
      if (index >= 0 && index < cells.length - 1) {
        setSelectedId(cells[index + 1].id)
        setMode('command')
      } else {
        insertCell(id, 'below')
        setMode('edit')
      }
    },
    [runCell, insertCell]
  )

  /**
   * 다른 문서를 열었을 때 노트북을 통째로 갈아끼운다.
   * ⚠️ notebook은 useState 초기화 함수로만 만들어지므로, 이 함수를 호출하지 않으면
   *    클라우드에서 다른 .ipynb를 열어도 화면이 그대로 남는다(문서를 바꾸는 모든
   *    경로에서 반드시 불러야 한다).
   */
  const reset = useCallback((source: string) => {
    queue.current = []
    activeRun.current = null
    execCounter.current = 0
    const next = parseNotebook(source) ?? createNotebook()
    setNotebook(next)
    setSelectedId(next.cells[0]?.id ?? '')
    setMode('command')
    setRunningCellId(null)
    setKeyEpochs({})
  }, [])

  const selectedIndex = useMemo(
    () => notebook.cells.findIndex((c) => c.id === selectedId),
    [notebook.cells, selectedId]
  )

  const selectRelative = useCallback(
    (delta: -1 | 1) => {
      const cells = notebookRef.current.cells
      const index = cells.findIndex((c) => c.id === selectedId)
      const next = index + delta
      if (next >= 0 && next < cells.length) setSelectedId(cells[next].id)
    },
    [selectedId]
  )

  return {
    notebook,
    selectedId,
    selectedIndex,
    /** 목록 렌더링에 쓸 React key — 셀 id만 쓰면 안 된다(moveCell 주석 참조) */
    cellKey: (id: string) => (keyEpochs[id] ? `${id}#${keyEpochs[id]}` : id),
    mode,
    runningCellId,
    isQueued: (id: string) => queue.current.includes(id),
    setSelectedId,
    setMode,
    setCellSource,
    insertCell,
    deleteCell,
    moveCell,
    changeCellType,
    clearOutputs,
    runCell,
    runAll,
    runAndAdvance,
    interrupt,
    selectRelative,
    reset,
  }
}
