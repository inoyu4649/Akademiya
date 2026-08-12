// ============================================================================
//  메인 스레드 ↔ Pyodide 워커 메시지 프로토콜
// ============================================================================
//  Python 실행이 UI를 멈추지 않게 하려고 런타임 전체를 Web Worker에 둔다.
//  워커는 사용자 코드를 실행하는 유일한 장소이자 보안 경계이기도 하다 —
//  워커에는 DOM도, 세션 쿠키를 읽을 방법도, 서버 API 접근 코드도 없다.

/** 부팅 단계 — i18n의 boot.stage.* 키와 이름을 맞춘다 */
export type BootStage =
  | 'checkingCache'
  | 'runtime'
  | 'packages'
  | 'font'
  | 'initializing'
  | 'warmup'
  | 'done'

export interface BootProgress {
  stage: BootStage
  /** 0~1. null이면 진행률을 알 수 없는 단계(indeterminate)라는 뜻 */
  fraction: number | null
  /** 실제로 받은 바이트 / 응답 헤더가 알려준 총 바이트 */
  loadedBytes: number
  totalBytes: number
  /** 현재 내려받는 중인 항목 이름 (예: 'numpy') */
  currentItem?: string
}

/** '자세히 보기'에 흘려보낼 실제 로그 한 줄 */
export interface BootLogLine {
  /** 워커 시작 시점 기준 경과 ms — 가짜 타임스탬프를 만들지 않는다 */
  t: number
  level: 'info' | 'warn' | 'error'
  text: string
}

/** 실행 결과로 나온 그림 (matplotlib figure 등) */
export interface RunArtifact {
  kind: 'image'
  mime: string
  /** base64 (data: URL 본문) */
  data: string
}

export type WorkerOut =
  // ⚠️ 인터럽트 버퍼는 반드시 메인 스레드로 넘겨야 한다. 무한 루프가 돌면 워커의
  //    이벤트 루프가 막혀 postMessage('interrupt')를 영영 처리하지 못하므로,
  //    메인 스레드가 공유 메모리에 직접 값을 써서 Python을 깨우는 수밖에 없다.
  | { type: 'interrupt-buffer'; buffer: SharedArrayBuffer }
  | { type: 'boot-progress'; progress: BootProgress }
  | { type: 'boot-log'; line: BootLogLine }
  | { type: 'boot-ready'; pythonVersion: string; elapsedMs: number }
  | { type: 'boot-failed'; message: string }
  | { type: 'stdout'; runId: number; text: string }
  | { type: 'stderr'; runId: number; text: string }
  | { type: 'artifact'; runId: number; artifact: RunArtifact }
  | { type: 'run-done'; runId: number; elapsedMs: number; result: string | null }
  | { type: 'run-error'; runId: number; elapsedMs: number; traceback: string; friendly: string }

export type WorkerIn =
  | { type: 'boot' }
  | { type: 'run'; runId: number; code: string }
  | { type: 'interrupt' }
