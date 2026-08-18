// Pyodide 워커의 수명과 부팅 상태를 쥐고 있는 훅.
// 실행 출력(stdout/artifact/…)은 상태로 쌓지 않고 구독자에게 그대로 흘려보낸다 —
// 루프 하나가 수천 줄을 찍어도 리렌더가 그만큼 일어나면 UI가 멈추기 때문이다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BootLogLine, BootProgress, WorkerIn, WorkerOut } from './protocol'
import { KOREAN_FONT_FALLBACK_URL } from './pyodideConfig'
import { acknowledgeMobileDataNotice, needsMobileDataNotice } from '../utils/device'

export type RuntimeStatus = 'booting' | 'ready' | 'failed' | 'mobileDataNotice'

export type RunEvent = Extract<
  WorkerOut,
  | { type: 'stdout' }
  | { type: 'stderr' }
  | { type: 'artifact' }
  | { type: 'run-done' }
  | { type: 'run-error' }
  | { type: 'stdin-request' }
>

const MAX_LOG_LINES = 500

export function usePyodideRuntime() {
  const workerRef = useRef<Worker | null>(null)
  const runListeners = useRef(new Set<(e: RunEvent) => void>())
  const runIdRef = useRef(0)
  // 워커가 넘겨준 공유 인터럽트 버퍼. 실행 중인 워커는 메시지를 못 받으므로
  // 중지는 반드시 이 메모리에 직접 써야 한다.
  const interruptRef = useRef<Uint8Array | null>(null)
  // input() 동기 대기용 공유 버퍼. control[0]=상태(0 대기/1 데이터 있음/2 EOF·취소),
  // control[1]=data에 쓴 바이트 길이. 워커가 Atomics.wait로 이 값이 바뀌길 블로킹 대기한다.
  const stdinControlRef = useRef<Int32Array | null>(null)
  const stdinDataRef = useRef<Uint8Array | null>(null)
  // writeDataFile의 요청↔응답 짝짓기. 실행(run)과 달리 매번 호출자가 결과를
  // 기다려야 해서(성공/실패 모달 문구가 갈린다) Promise로 감싼다.
  const dataFileReqId = useRef(0)
  const dataFileCallbacks = useRef(
    new Map<number, (res: { ok: true; path: string } | { ok: false; message: string }) => void>()
  )

  // 휴대폰 첫 접속이면 워커(=다운로드)를 아직 띄우지 않는다. 안내 모달에서
  // "계속"을 눌러야 armed가 true로 바뀌고 그때 비로소 부팅 이펙트가 실행된다.
  const [armed, setArmed] = useState(() => !needsMobileDataNotice())
  const [status, setStatus] = useState<RuntimeStatus>(() => (armed ? 'booting' : 'mobileDataNotice'))
  const [progress, setProgress] = useState<BootProgress>({
    stage: 'checkingCache',
    fraction: null,
    loadedBytes: 0,
    totalBytes: 0,
  })
  const [logs, setLogs] = useState<BootLogLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pythonVersion, setPythonVersion] = useState<string | null>(null)

  const acknowledgeMobileData = useCallback(() => {
    acknowledgeMobileDataNotice()
    setStatus('booting')
    setArmed(true)
  }, [])

  useEffect(() => {
    // armed가 false인 동안(휴대폰 안내 대기 중)에는 워커를 만들지 않는다 —
    // 수십 MB 다운로드가 사용자 확인 전에 시작되면 안 된다.
    if (!armed) return

    const worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const msg = event.data
      switch (msg.type) {
        case 'interrupt-buffer':
          interruptRef.current = new Uint8Array(msg.buffer)
          break
        case 'stdin-buffers':
          stdinControlRef.current = new Int32Array(msg.control)
          stdinDataRef.current = new Uint8Array(msg.data)
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
        case 'font-fallback-request':
          // 워커는 CSP상 같은 오리진에 요청을 보낼 수 없다(protocol.ts 주석 참고).
          // 학교망에서 CDN이 막힌 경우를 위해 메인 스레드가 서버 사본을 대신 받아 넘긴다.
          void fetch(KOREAN_FONT_FALLBACK_URL)
            .then((res) => (res.ok ? res.arrayBuffer() : null))
            .catch(() => null)
            .then((buffer) => {
              // 4MB를 복사하지 않고 소유권째 넘긴다(메인 스레드는 이 버퍼를 쓰지 않는다)
              worker.postMessage({ type: 'font-fallback', buffer } satisfies WorkerIn, buffer ? [buffer] : [])
            })
          break
        case 'data-file-ready':
          dataFileCallbacks.current.get(msg.requestId)?.({ ok: true, path: msg.path })
          dataFileCallbacks.current.delete(msg.requestId)
          break
        case 'data-file-error':
          dataFileCallbacks.current.get(msg.requestId)?.({ ok: false, message: msg.message })
          dataFileCallbacks.current.delete(msg.requestId)
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
  }, [armed])

  /** 실행을 요청하고 이번 실행의 runId를 돌려준다 */
  const run = useCallback((code: string): number => {
    const runId = ++runIdRef.current
    workerRef.current?.postMessage({ type: 'run', runId, code } satisfies WorkerIn)
    return runId
  }, [])

  /** input() 대기 중인 워커를 EOF로 풀어준다 — 대기 중이 아니었다면 아무 효과 없다(다음 stdinRead가 어차피 0으로 리셋). */
  const cancelStdin = useCallback(() => {
    const control = stdinControlRef.current
    if (!control) return
    Atomics.store(control, 0, 2)
    Atomics.notify(control, 0)
  }, [])

  const interrupt = useCallback(() => {
    // 2 = SIGINT. Pyodide가 다음 바이트코드 경계에서 KeyboardInterrupt를 던진다.
    // 공유 메모리라 워커가 무한 루프에 빠져 있어도 즉시 전달된다.
    if (interruptRef.current) {
      interruptRef.current[0] = 2
    } else {
      // SharedArrayBuffer가 없는 환경(cross-origin isolation 미지원)용 폴백.
      // 워커가 바쁘면 도달하지 못하지만, 없는 것보다는 낫다.
      workerRef.current?.postMessage({ type: 'interrupt' } satisfies WorkerIn)
    }
    // ⚠️ input() 대기 중이면 워커는 Atomics.wait로 완전히 멈춰 있어 바이트코드 경계 자체가
    //    없다 — 위 SIGINT만으로는 절대 깨어나지 않는다. 대기 중일 수도 있으니 항상 함께 푼다.
    cancelStdin()
  }, [cancelStdin])

  /** 터미널에서 사용자가 입력한 한 줄을 워커의 input()에 전달한다(줄바꿈은 워커가 붙인다) */
  const sendStdin = useCallback((text: string) => {
    const control = stdinControlRef.current
    const data = stdinDataRef.current
    if (!control || !data) return
    const bytes = new TextEncoder().encode(text)
    const len = Math.min(bytes.length, data.length)
    data.set(bytes.subarray(0, len))
    Atomics.store(control, 1, len)
    Atomics.store(control, 0, 1)
    Atomics.notify(control, 0)
  }, [])

  const subscribe = useCallback((listener: (e: RunEvent) => void) => {
    runListeners.current.add(listener)
    return () => {
      runListeners.current.delete(listener)
    }
  }, [])

  /**
   * 업로드한 데이터 파일을 Pyodide 가상 파일시스템 `/data/<name>`에 써서, 실행 중인
   * Python 코드가 바로 읽을 수 있게 한다. 이 훅을 쓰는 쪽(로컬 처리든 클라우드 저장이든)
   * 모두 이 호출을 거쳐야 파일이 `pd.read_csv('/data/파일명')`처럼 즉시 보인다.
   */
  const writeDataFile = useCallback(
    (name: string, content: string): Promise<{ ok: true; path: string } | { ok: false; message: string }> => {
      return new Promise((resolve) => {
        const requestId = ++dataFileReqId.current
        dataFileCallbacks.current.set(requestId, resolve)
        workerRef.current?.postMessage({ type: 'write-data-file', requestId, name, content } satisfies WorkerIn)
      })
    },
    []
  )

  return {
    status,
    progress,
    logs,
    error,
    pythonVersion,
    run,
    interrupt,
    subscribe,
    writeDataFile,
    sendStdin,
    cancelStdin,
    acknowledgeMobileData,
  }
}
