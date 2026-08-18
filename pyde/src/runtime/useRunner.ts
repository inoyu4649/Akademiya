// 워커에서 날아오는 실행 이벤트를 터미널(xterm)이 그릴 수 있는 형태로 모으는 훅.
//
// ⚠️ 출력을 React 상태 배열로 쌓지 않는다. xterm.js는 자기 안에서 렌더링을 처리하므로
//    (React 재렌더와 무관) 청크가 도착하는 즉시 구독자(TerminalPanel)에게 콜백으로
//    흘려보내기만 하면 된다 — 예전엔 `for i in range(100000): print(i)` 같은 코드가
//    setState 폭주로 UI를 멈추게 해서 직접 배치·스로틀링을 했지만, xterm에 직접 write()할
//    때는 그 문제 자체가 없다(xterm 내부가 이미 효율적으로 처리한다).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunArtifact } from './protocol'
import type { RunEvent } from './usePyodideRuntime'

export type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'stopped'

export type OutputKind = 'out' | 'err' | 'result' | 'traceback'
export type OutputListener = (kind: OutputKind, text: string) => void

interface Runtime {
  run: (code: string) => number
  interrupt: () => void
  subscribe: (listener: (e: RunEvent) => void) => () => void
  sendStdin: (text: string) => void
}

export function useRunner(runtime: Runtime) {
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([])
  const [status, setStatus] = useState<RunStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  /** Python이 input()에서 한 줄을 기다리는 중인지 — 터미널이 입력 모드로 바뀌어야 한다 */
  const [waitingForInput, setWaitingForInput] = useState(false)

  const outputListeners = useRef(new Set<OutputListener>())
  const activeRunId = useRef<number | null>(null)
  // 사용자가 중지 버튼을 눌렀는지 — KeyboardInterrupt가 '오류'가 아니라 '중지'로
  // 보여야 하는데, traceback만으로는 사용자가 코드에서 직접 발생시킨 것과 구분이 안 된다.
  const stopRequested = useRef(false)

  const emitOutput = useCallback((kind: OutputKind, text: string) => {
    for (const listener of outputListeners.current) listener(kind, text)
  }, [])

  /** TerminalPanel이 마운트 시 등록 — 이후 이 실행(들)의 출력을 실시간으로 받는다 */
  const onOutput = useCallback((listener: OutputListener) => {
    outputListeners.current.add(listener)
    return () => {
      outputListeners.current.delete(listener)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = runtime.subscribe((e) => {
      // 이전 실행의 뒤늦은 출력이 새 실행에 섞이지 않게 막는다.
      // ⚠️ activeRunId가 null인 경우(=이 훅으로 실행한 적이 없음)도 반드시 걸러야 한다.
      //    노트북 셀 실행도 같은 워커·같은 구독을 타므로, 그냥 통과시키면 노트북 출력이
      //    터미널 상태(입력 대기 배지·실행 상태)를 건드린다.
      if (activeRunId.current === null || e.runId !== activeRunId.current) return

      switch (e.type) {
        case 'stdout':
          emitOutput('out', e.text)
          break
        case 'stderr':
          emitOutput('err', e.text)
          break
        case 'artifact':
          setArtifacts((prev) => [...prev, e.artifact])
          break
        case 'stdin-request':
          setWaitingForInput(true)
          break
        case 'run-done':
          if (e.result !== null) emitOutput('result', e.result)
          setElapsedMs(e.elapsedMs)
          setStatus('done')
          setWaitingForInput(false)
          activeRunId.current = null
          break
        case 'run-error':
          emitOutput('traceback', e.friendly)
          setElapsedMs(e.elapsedMs)
          setStatus(stopRequested.current ? 'stopped' : 'error')
          setWaitingForInput(false)
          activeRunId.current = null
          break
      }
    })
    return unsubscribe
  }, [runtime, emitOutput])

  const run = useCallback(
    (code: string) => {
      // 실행마다 이전 결과를 지운다 — Jupyter가 아니라 스크립트 실행이므로
      // 화면에 남은 그림이 방금 결과인지 헷갈리면 안 된다.
      setArtifacts([])
      setElapsedMs(null)
      setWaitingForInput(false)
      stopRequested.current = false
      setStatus('running')
      activeRunId.current = runtime.run(code)
    },
    [runtime]
  )

  const stop = useCallback(() => {
    stopRequested.current = true
    runtime.interrupt()
  }, [runtime])

  /** 터미널에서 사용자가 Enter를 눌렀을 때 — 로컬 에코는 TerminalPanel이 이미 했다 */
  const sendStdin = useCallback(
    (text: string) => {
      setWaitingForInput(false)
      runtime.sendStdin(text)
    },
    [runtime]
  )

  const clear = useCallback(() => {
    setArtifacts([])
    setElapsedMs(null)
    setStatus('idle')
  }, [])

  return { artifacts, status, elapsedMs, waitingForInput, onOutput, run, stop, sendStdin, clear }
}
