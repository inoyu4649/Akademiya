// Pyodide 워커의 수명과 부팅 상태를 쥐고 있는 훅.
// 실행 출력(stdout/artifact/…)은 상태로 쌓지 않고 구독자에게 그대로 흘려보낸다 —
// 루프 하나가 수천 줄을 찍어도 리렌더가 그만큼 일어나면 UI가 멈추기 때문이다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BootLogLine, BootProgress, WorkerIn, WorkerOut } from './protocol'

export type RuntimeStatus = 'booting' | 'ready' | 'failed'

export type RunEvent = Extract<
  WorkerOut,
  { type: 'stdout' } | { type: 'stderr' } | { type: 'artifact' } | { type: 'run-done' } | { type: 'run-error' }
>

const MAX_LOG_LINES = 500

export function usePyodideRuntime() {
  const workerRef = useRef<Worker | null>(null)
  const runListeners = useRef(new Set<(e: RunEvent) => void>())
  const runIdRef = useRef(0)
  // 워커가 넘겨준 공유 인터럽트 버퍼. 실행 중인 워커는 메시지를 못 받으므로
  // 중지는 반드시 이 메모리에 직접 써야 한다.
  const interruptRef = useRef<Uint8Array | null>(null)

  const [status, setStatus] = useState<RuntimeStatus>('booting')
  const [progress, setProgress] = useState<BootProgress>({
    stage: 'checkingCache',
    fraction: null,
    loadedBytes: 0,
    totalBytes: 0,
  })
  const [logs, setLogs] = useState<BootLogLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pythonVersion, setPythonVersion] = useState<string | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const msg = event.data
      switch (msg.type) {
        case 'interrupt-buffer':
          interruptRef.current = new Uint8Array(msg.buffer)
          break
        case 'boot-progress':
          setProgress(msg.progress)
          break
        case 'boot-log':
          // 로그가 무한히 쌓이면 메모리를 갉아먹는다 — 최근 것만 남긴다
          setLogs((prev) => (prev.length >= MAX_LOG_LINES ? [...prev.slice(1), msg.line] : [...prev, msg.line]))
          break
        case 'boot-ready':
          setPythonVersion(msg.pythonVersion)
          setStatus('ready')
          break
        case 'boot-failed':
          setError(msg.message)
          setStatus('failed')
          break
        default:
          for (const listener of runListeners.current) listener(msg)
      }
    }

    const send: WorkerIn = { type: 'boot' }
    worker.postMessage(send)

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  /** 실행을 요청하고 이번 실행의 runId를 돌려준다 */
  const run = useCallback((code: string): number => {
    const runId = ++runIdRef.current
    workerRef.current?.postMessage({ type: 'run', runId, code } satisfies WorkerIn)
    return runId
  }, [])

  const interrupt = useCallback(() => {
    // 2 = SIGINT. Pyodide가 다음 바이트코드 경계에서 KeyboardInterrupt를 던진다.
    // 공유 메모리라 워커가 무한 루프에 빠져 있어도 즉시 전달된다.
    if (interruptRef.current) {
      interruptRef.current[0] = 2
      return
    }
    // SharedArrayBuffer가 없는 환경(cross-origin isolation 미지원)용 폴백.
    // 워커가 바쁘면 도달하지 못하지만, 없는 것보다는 낫다.
    workerRef.current?.postMessage({ type: 'interrupt' } satisfies WorkerIn)
  }, [])

  const subscribe = useCallback((listener: (e: RunEvent) => void) => {
    runListeners.current.add(listener)
    return () => {
      runListeners.current.delete(listener)
    }
  }, [])

  return { status, progress, logs, error, pythonVersion, run, interrupt, subscribe }
}
