// 워커에서 날아오는 실행 이벤트를 터미널이 그릴 수 있는 형태로 모으는 훅.
//
// ⚠️ 출력 한 줄마다 setState를 하면 `for i in range(100000): print(i)` 한 방에
//    UI가 멈춘다(런타임을 워커로 뺀 의미가 없어진다). 들어오는 줄은 ref 버퍼에
//    쌓아두고 주기적으로 한 번씩만 상태에 반영한다.
//
// ⚠️ 이때 requestAnimationFrame을 쓰면 안 된다. 탭이 백그라운드로 가거나 창이
//    가려져 화면을 그리지 않으면 rAF가 **아예 발화하지 않아서** 출력이 영영 버퍼에
//    갇힌다(실제로 터미널이 "실행 완료"인데 한 줄도 안 보이는 증상으로 드러났다).
//    setTimeout은 백그라운드에서 1초로 느려질 뿐 계속 돌아가므로 출력이 유실되지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunArtifact } from './protocol'
import type { RunEvent } from './usePyodideRuntime'

export type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'stopped'

export type LineKind = 'out' | 'err' | 'sys' | 'result' | 'traceback'

export interface TerminalLine {
  id: number
  kind: LineKind
  text: string
}

/** 터미널에 남겨두는 최대 줄 수 — 넘으면 오래된 것부터 버린다(메모리 방어) */
const MAX_LINES = 5000

/** 출력 반영 주기. 너무 짧으면 리렌더가 잦고, 길면 실행이 멈춘 것처럼 보인다 */
const FLUSH_INTERVAL_MS = 50

interface Runtime {
  run: (code: string) => number
  interrupt: () => void
  subscribe: (listener: (e: RunEvent) => void) => () => void
}

export function useRunner(runtime: Runtime) {
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [artifacts, setArtifacts] = useState<RunArtifact[]>([])
  const [status, setStatus] = useState<RunStatus>('idle')
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)

  const pending = useRef<TerminalLine[]>([])
  const flushTimer = useRef<number | null>(null)
  const lineId = useRef(0)
  const activeRunId = useRef<number | null>(null)
  // 사용자가 중지 버튼을 눌렀는지 — KeyboardInterrupt가 '오류'가 아니라 '중지'로
  // 보여야 하는데, traceback만으로는 사용자가 코드에서 직접 발생시킨 것과 구분이 안 된다.
  const stopRequested = useRef(false)

  const flush = useCallback(() => {
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    if (!pending.current.length) return
    const batch = pending.current
    pending.current = []
    setLines((prev) => {
      const next = prev.concat(batch)
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
    })
  }, [])

  const push = useCallback(
    (kind: LineKind, text: string) => {
      // print()는 줄바꿈까지 함께 오므로 줄 단위로 쪼갠다(마지막 빈 조각은 버림)
      const parts = text.split('\n')
      if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
      for (const part of parts) {
        pending.current.push({ id: lineId.current++, kind, text: part })
      }
      // 백그라운드 탭에서 타이머가 1초로 느려져도 버퍼가 무한히 자라지 않게 상한을 둔다.
      // 어차피 화면에는 최근 MAX_LINES 줄만 남으므로 오래된 것부터 버려도 손실이 없다.
      if (pending.current.length > MAX_LINES) {
        pending.current = pending.current.slice(pending.current.length - MAX_LINES)
      }
      if (flushTimer.current === null) {
        flushTimer.current = window.setTimeout(flush, FLUSH_INTERVAL_MS)
      }
    },
    [flush]
  )

  useEffect(() => {
    const unsubscribe = runtime.subscribe((e) => {
      // 이전 실행의 뒤늦은 출력이 새 실행에 섞이지 않게 막는다
      if (activeRunId.current !== null && e.runId !== activeRunId.current) return

      switch (e.type) {
        case 'stdout':
          push('out', e.text)
          break
        case 'stderr':
          push('err', e.text)
          break
        case 'artifact':
          setArtifacts((prev) => [...prev, e.artifact])
          break
        case 'run-done':
          if (e.result !== null) push('result', e.result)
          setElapsedMs(e.elapsedMs)
          setStatus('done')
          activeRunId.current = null
          // 실행이 끝났으면 남은 출력을 곧바로 게워낸다 — "완료됐는데 출력이 없다"로
          // 보이면 안 된다(다음 타이머를 기다리지 않는다)
          flush()
          break
        case 'run-error':
          push('traceback', e.friendly)
          setElapsedMs(e.elapsedMs)
          setStatus(stopRequested.current ? 'stopped' : 'error')
          activeRunId.current = null
          flush()
          break
      }
    })
    return () => {
      unsubscribe()
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current)
    }
  }, [runtime, push, flush])

  const run = useCallback(
    (code: string) => {
      // 실행마다 이전 결과를 지운다 — Jupyter가 아니라 스크립트 실행이므로
      // 화면에 남은 그림이 방금 결과인지 헷갈리면 안 된다.
      setArtifacts([])
      setElapsedMs(null)
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

  const clear = useCallback(() => {
    if (flushTimer.current !== null) {
      window.clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    pending.current = []
    setLines([])
    setArtifacts([])
    setElapsedMs(null)
    setStatus('idle')
  }, [])

  return { lines, artifacts, status, elapsedMs, run, stop, clear }
}
