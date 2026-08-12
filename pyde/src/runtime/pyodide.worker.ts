// ============================================================================
//  Pyodide 런타임 워커
// ============================================================================
//  사용자 Python 코드가 실행되는 **유일한** 장소. 메인 스레드에서 돌리면 무거운
//  계산 한 번에 IDE 전체가 얼어붙으므로 런타임 전체를 여기 가둔다.
//
//  이 워커에는 의도적으로 없는 것들:
//    · DOM 접근 · 세션 쿠키 · Cloud API 호출 코드
//  사용자 코드가 무엇을 하든 브라우저 샌드박스 + 워커 경계 밖으로 나가지 못한다.
// ============================================================================
import {
  KOREAN_FONT_FAMILY,
  KOREAN_FONT_URL,
  PRELOAD_PACKAGES,
  PYODIDE_BASE_URL,
  PYODIDE_VERSION,
} from './pyodideConfig'
import type { BootProgress, BootStage, RunArtifact, WorkerIn, WorkerOut } from './protocol'

// ── Pyodide 최소 타입 (원격 모듈이라 @types를 붙일 수 없다) ──────────────────
interface PyodideInterface {
  runPythonAsync(code: string): Promise<unknown>
  loadPackage(
    names: string[],
    options?: { messageCallback?: (msg: string) => void; errorCallback?: (msg: string) => void }
  ): Promise<void>
  setStdout(opts: { batched: (s: string) => void }): void
  setStderr(opts: { batched: (s: string) => void }): void
  setInterruptBuffer(buffer: Uint8Array): void
  FS: {
    mkdirTree(path: string): void
    writeFile(path: string, data: Uint8Array, opts?: { encoding?: string }): void
  }
  version: string
}

const t0 = performance.now()
const post = (msg: WorkerOut) => self.postMessage(msg)
const elapsed = () => Math.round(performance.now() - t0)

function log(text: string, level: 'info' | 'warn' | 'error' = 'info') {
  post({ type: 'boot-log', line: { t: elapsed(), level, text } })
}

function progress(p: BootProgress) {
  post({ type: 'boot-progress', progress: p })
}

/** 진행률을 알 수 없는 단계는 fraction을 null로 보내 UI가 indeterminate로 그리게 한다 */
function indeterminate(stage: BootStage, currentItem?: string) {
  progress({ stage, fraction: null, loadedBytes: 0, totalBytes: 0, currentItem })
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// ============================================================================
//  1) 실제 바이트 기반 사전 다운로드
// ============================================================================
//  Pyodide는 자체적으로 바이트 단위 진행률을 알려주지 않는다. 그래서 필요한 파일을
//  우리가 먼저 스트리밍으로 받아 HTTP 캐시에 채워 넣고, 그 과정에서 진짜 수신
//  바이트로 진행률을 만든다. 이어서 loadPyodide()가 같은 URL을 다시 요청하면
//  브라우저 HTTP 캐시에서 즉시 반환된다(jsDelivr는 버전 경로가 immutable).
//
//  ⚠️ 진행률 단위 함정(실측으로 확인): jsDelivr는 **모든 파일을 brotli로** 보낸다.
//     Content-Length는 "전송된(압축된)" 바이트인데 스트림 리더가 주는 건 "압축 해제된"
//     바이트라 둘의 단위가 다르다. 실측 비율:
//        pyodide.asm.wasm  3.4MB → 9.6MB  (2.79배)
//        python_stdlib.zip 2.5MB → 2.55MB (1.016배)
//        *.whl             2.88MB → 2.92MB (1.011배)
//     휠과 zip은 이미 압축된 포맷이라 오차가 1% 남짓이지만, wasm은 3배 가까이 벌어져서
//     "실제로는 36%만 받았는데 막대는 100%"가 된다. 그건 가짜 진행률이다.
//     → 압축률을 알 수 없는 런타임 코어는 determinate: false로 두고(요구사항대로
//       indeterminate 표시), 오차 1%대인 휠 단계만 바이트 진행률을 보여준다.
interface FetchTask {
  name: string
  url: string
}

interface FileState {
  total: number
  loaded: number
}

async function prefetchAll(tasks: FetchTask[], stage: BootStage, determinate: boolean): Promise<void> {
  const states = new Map<string, FileState>()
  // ⚠️ 헤더가 도착하는 대로 분모에 더하면 막대가 뒤로 간다(총량만 커지고 받은 양은
  //    그대로라서). 실제 콜드 다운로드 실측에서 두 번 역행하는 걸 확인했다.
  //    모든 응답 헤더가 도착해 분모가 확정되기 전까지는 indeterminate를 유지한다.
  let settled = 0

  const report = (currentItem?: string) => {
    let total = 0
    let loaded = 0
    for (const s of states.values()) {
      total += s.total
      loaded += Math.min(s.loaded, s.total)
    }
    const sizesFinalized = settled === tasks.length
    progress({
      stage,
      // 압축률을 모르는 단계이거나 분모가 아직 확정되지 않았으면 indeterminate
      fraction: determinate && sizesFinalized && total > 0 ? loaded / total : null,
      loadedBytes: determinate && sizesFinalized ? loaded : 0,
      totalBytes: determinate && sizesFinalized ? total : 0,
      currentItem,
    })
  }

  report()

  // HTTP/2 멀티플렉싱이라 한꺼번에 띄워도 된다. 헤더가 거의 동시에 도착해
  // 총량이 1 RTT 만에 확정되므로 진행률 막대가 튀지 않는다.
  await Promise.all(
    tasks.map(async (task) => {
      try {
        const res = await fetch(task.url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const len = Number(res.headers.get('content-length') ?? 0)
        states.set(task.name, { total: len, loaded: 0 })
        settled++
        report(task.name)

        if (!res.body) {
          // 스트림을 못 쓰면 통째로 읽는다(진행률만 거칠어질 뿐 동작은 같다)
          await res.arrayBuffer()
          const s = states.get(task.name)!
          s.loaded = s.total
          report(task.name)
        } else {
          const reader = res.body.getReader()
          const state = states.get(task.name)!
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            state.loaded += value.byteLength
            report(task.name)
          }
          // 압축 전송이면 수신 바이트가 헤더값과 다르다 — 완료 시점엔 총량에 맞춘다
          state.loaded = state.total
        }

        // 캐시 적중 여부는 추측하지 않고 Resource Timing의 실측값으로 판단한다
        const entry = performance.getEntriesByName(task.url)[0] as PerformanceResourceTiming | undefined
        const cached = entry ? entry.transferSize === 0 : false
        // 압축 전송이라 "받은 용량"은 헤더값(네트워크 바이트)으로 적는 게 정확하다
        log(`${task.name} ${cached ? '캐시 적중' : mb(states.get(task.name)!.total)}`)
        report()
      } catch (err) {
        // 개별 파일 실패는 여기서 죽이지 않는다 — loadPyodide가 다시 시도하며,
        // 정말 못 받으면 그때 부팅 실패로 처리된다.
        log(`${task.name} 사전 다운로드 실패: ${(err as Error).message}`, 'warn')
        // 헤더를 받기 전에 터졌을 수도 있으니 여기서도 settled를 채워 분모를 확정시킨다
        // (안 그러면 남은 파일이 다 받아져도 영원히 indeterminate에 머문다)
        if (!states.has(task.name)) settled++
        states.delete(task.name)
        report()
      }
    })
  )
}

// ============================================================================
//  2) 부팅
// ============================================================================
let pyodide: PyodideInterface | null = null
let interruptBuffer: Uint8Array | null = null

async function boot(): Promise<void> {
  try {
    // ── 캐시 확인 + 패키지 목록 결정 ──────────────────────────────────────
    indeterminate('checkingCache')
    log(`PyDe Web 런타임 — Pyodide v${PYODIDE_VERSION}`)

    const lockUrl = `${PYODIDE_BASE_URL}pyodide-lock.json`
    const lock = (await (await fetch(lockUrl)).json()) as {
      info: { python: string }
      packages: Record<string, { file_name: string; depends?: string[] }>
    }
    log(`Python ${lock.info.python} / 패키지 인덱스 ${Object.keys(lock.packages).length}개`)

    // 의존성 closure를 lock에서 직접 펼친다 — 목록을 코드에 박아두면 버전이
    // 올라갈 때 조용히 어긋난다.
    const closure = new Set<string>()
    const stack: string[] = [...PRELOAD_PACKAGES]
    while (stack.length) {
      const name = stack.pop()!
      if (closure.has(name)) continue
      const entry = lock.packages[name]
      if (!entry) {
        log(`패키지 '${name}'을(를) 인덱스에서 찾지 못했습니다`, 'warn')
        continue
      }
      closure.add(name)
      for (const dep of entry.depends ?? []) stack.push(dep)
    }
    log(`사전 로딩 대상 ${closure.size}개 (의존성 포함)`)

    // ── 런타임 코어 ────────────────────────────────────────────────────────
    // brotli 압축률이 3배에 달해 바이트 진행률을 신뢰할 수 없다 → indeterminate
    await prefetchAll(
      [
        { name: 'pyodide.asm.wasm', url: `${PYODIDE_BASE_URL}pyodide.asm.wasm` },
        { name: 'python_stdlib.zip', url: `${PYODIDE_BASE_URL}python_stdlib.zip` },
      ],
      'runtime',
      false
    )

    // ── 라이브러리 휠 ──────────────────────────────────────────────────────
    // 이미 zip으로 압축된 포맷이라 헤더값과 실제 바이트 오차가 1% 남짓 → determinate
    await prefetchAll(
      [...closure].sort().map((name) => ({
        name,
        url: PYODIDE_BASE_URL + lock.packages[name].file_name,
      })),
      'packages',
      true
    )

    // ── 한글 폰트 ──────────────────────────────────────────────────────────
    indeterminate('font')
    const fontBuf = await (await fetch(KOREAN_FONT_URL)).arrayBuffer()
    log(`D2Coding ${mb(fontBuf.byteLength)}`)

    // ── Pyodide 초기화 ─────────────────────────────────────────────────────
    indeterminate('initializing')
    // 원격 ESM이라 Vite가 번들하지 않도록 @vite-ignore가 필요하다
    const mod = (await import(/* @vite-ignore */ `${PYODIDE_BASE_URL}pyodide.mjs`)) as {
      loadPyodide: (opts: { indexURL: string; stdLibURL?: string }) => Promise<PyodideInterface>
    }
    pyodide = await mod.loadPyodide({ indexURL: PYODIDE_BASE_URL })
    log(`Pyodide ${pyodide.version} 초기화 완료`)

    // ── 중지(인터럽트) 버퍼 ────────────────────────────────────────────────
    // ⚠️ 버퍼를 워커 안에서만 들고 있으면 무용지물이다. `while True:` 같은 동기
    //    루프가 돌면 워커의 이벤트 루프가 통째로 막혀서 'interrupt' 메시지를
    //    수신조차 못 한다(실제로 그렇게 만들었다가 중지가 먹지 않는 걸 확인).
    //    공유 메모리를 메인 스레드에 넘겨 거기서 직접 쓰게 해야 Python이 깨어난다.
    //    cross-origin isolation이 없으면 SharedArrayBuffer 자체가 없으므로
    //    중지 기능만 포기하고 나머지는 그대로 간다.
    if (typeof SharedArrayBuffer !== 'undefined') {
      const sab = new SharedArrayBuffer(1)
      interruptBuffer = new Uint8Array(sab)
      pyodide.setInterruptBuffer(interruptBuffer)
      post({ type: 'interrupt-buffer', buffer: sab })
    } else {
      log('SharedArrayBuffer를 쓸 수 없어 실행 중지 기능이 비활성화됩니다', 'warn')
    }

    pyodide.setStdout({ batched: (text) => post({ type: 'stdout', runId: currentRunId, text }) })
    pyodide.setStderr({ batched: (text) => post({ type: 'stderr', runId: currentRunId, text }) })

    // ── 패키지 적재 + 예열 ─────────────────────────────────────────────────
    indeterminate('warmup')
    // ⚠️ errorCallback을 넘기지 않으면 개별 패키지 적재 실패가 **조용히 삼켜진다**.
    //    loadPackage 자체는 정상 반환하고, 한참 뒤 예열 단계에서 엉뚱한
    //    ModuleNotFoundError로 터져서 원인을 찾기 어렵다(실제로 한 번 겪었다).
    const packageErrors: string[] = []
    await pyodide.loadPackage([...PRELOAD_PACKAGES], {
      messageCallback: (msg) => log(msg),
      errorCallback: (msg) => {
        packageErrors.push(msg)
        log(msg, 'error')
      },
    })
    if (packageErrors.length) {
      throw new Error(`라이브러리를 불러오지 못했습니다: ${packageErrors.join(' / ')}`)
    }

    pyodide.FS.mkdirTree('/fonts')
    pyodide.FS.writeFile(`/fonts/${KOREAN_FONT_FAMILY}.ttf`, new Uint8Array(fontBuf))

    // 첫 import는 수 초가 걸린다. 여기서 미리 치러두면 사용자가 처음 실행 버튼을
    // 눌렀을 때 바로 결과가 나온다(요구사항: 최초 접속에 전부 사전 로딩).
    await pyodide.runPythonAsync(WARMUP_PY)
    log('NumPy · Pandas · Matplotlib · SciPy · scikit-learn 예열 완료')

    // ⚠️ lock.info.python은 배포를 만들 때 기준으로 삼은 버전이라 실제 런타임과
    //    패치 버전이 다를 수 있다(예: lock 3.14.0 / 실제 3.14.2). 화면에 띄우는 값은
    //    반드시 인터프리터에게 직접 물어본다.
    const pythonVersion = String(
      await pyodide.runPythonAsync('import sys; ".".join(map(str, sys.version_info[:3]))')
    )

    indeterminate('done')
    post({ type: 'boot-ready', pythonVersion, elapsedMs: elapsed() })
  } catch (err) {
    const message = (err as Error).message ?? String(err)
    log(`부팅 실패: ${message}`, 'error')
    post({ type: 'boot-failed', message })
  }
}

/**
 * 예열 스크립트.
 *
 * `axes.unicode_minus = False`에 대해: 대부분의 한글 폰트는 U+2212(−, 진짜 마이너스
 * 기호) 글리프가 없어서 이걸 켜두면 음수 눈금이 두부(□)로 나오는 게 한글 matplotlib의
 * 고전적인 함정이다. **D2Coding은 U+2212를 실제로 갖고 있어서**(브라우저에서
 * `get_char_index(0x2212)`로 확인) 이 폰트만 쓴다면 굳이 끌 필요는 없다.
 * 그래도 끄는 이유는 학생이 rcParams로 다른 폰트를 지정했을 때를 대비한 안전장치이며,
 * ASCII 하이픈이 화면상 구분도 더 뚜렷하기 때문이다.
 */
const WARMUP_PY = `
import os
os.environ.setdefault("MPLBACKEND", "AGG")

import matplotlib
matplotlib.use("AGG")
from matplotlib import font_manager
font_manager.fontManager.addfont("/fonts/${KOREAN_FONT_FAMILY}.ttf")
matplotlib.rcParams["font.family"] = "${KOREAN_FONT_FAMILY}"
matplotlib.rcParams["axes.unicode_minus"] = False

import matplotlib.pyplot as plt
import numpy, pandas, scipy, sklearn
`

// ============================================================================
//  3) 코드 실행
// ============================================================================
let currentRunId = 0

/** 실행 후 열려 있는 matplotlib figure를 PNG로 거둬들이고 닫는다 */
const COLLECT_FIGURES_PY = `
import base64, io
import matplotlib.pyplot as _plt
_out = []
for _num in _plt.get_fignums():
    _fig = _plt.figure(_num)
    _buf = io.BytesIO()
    _fig.savefig(_buf, format="png", dpi=110, bbox_inches="tight",
                 facecolor=_fig.get_facecolor())
    _out.append(base64.b64encode(_buf.getvalue()).decode())
    _plt.close(_fig)
_out
`

/**
 * Pyodide traceback에서 사용자에게 의미 없는 프레임을 걷어낸다.
 * 교육용이라 "내 코드 몇 번째 줄이 왜 틀렸는지"만 남기는 게 중요하다
 * (요구사항 5-2). 원본은 그대로 보존해 필요하면 펼쳐 볼 수 있게 한다.
 */
function friendlyTraceback(raw: string): string {
  const lines = raw.split('\n')
  const kept: string[] = []
  let skipping = false

  for (const line of lines) {
    const isFrame = /^\s+File "/.test(line)
    if (isFrame) {
      // Pyodide 내부 프레임은 감춘다.
      // ⚠️ 실제 경로는 `/lib/python314.zip/_pyodide/_base.py` 형태다 —
      //    처음에 `/lib/python3.14/`를 가정했다가 필터가 통째로 무력화됐었다.
      //    stdlib는 zip으로 묶여 있고 버전이 점(.) 없이 붙는다는 걸 실측으로 확인.
      skipping =
        /File "\/lib\/python\d+[\d.]*(\.zip)?\//.test(line) || /File "\/lib\/pyodide/.test(line)
      if (skipping) continue
    } else if (skipping && /^\s/.test(line)) {
      // 감춘 프레임에 딸린 소스 인용 줄도 함께 버린다
      continue
    } else {
      skipping = false
    }
    kept.push(line)
  }

  const cleaned = kept
    .join('\n')
    // 사용자 코드는 <exec>라는 이름으로 실행된다 — 그대로 보여주면 혼란스럽다
    .replace(/File "<exec>"/g, 'File "내 코드"')
    .replace(/File "<string>"/g, 'File "내 코드"')
    .trim()

  return cleaned || raw.trim()
}

async function run(runId: number, code: string): Promise<void> {
  if (!pyodide) {
    post({
      type: 'run-error',
      runId,
      elapsedMs: 0,
      traceback: 'runtime not ready',
      friendly: 'Python 환경이 아직 준비되지 않았습니다.',
    })
    return
  }

  currentRunId = runId
  if (interruptBuffer) interruptBuffer[0] = 0 // 이전 실행의 중지 신호 초기화

  const started = performance.now()
  try {
    const result = await pyodide.runPythonAsync(code)
    await collectArtifacts(runId)
    post({
      type: 'run-done',
      runId,
      elapsedMs: Math.round(performance.now() - started),
      // 마지막 식의 값이 있으면 REPL처럼 보여준다
      result: result === undefined || result === null ? null : String(result),
    })
  } catch (err) {
    // 중단되었더라도 그 전까지 그린 그림은 살려서 보여준다
    await collectArtifacts(runId).catch(() => undefined)
    const raw = (err as Error).message ?? String(err)
    post({
      type: 'run-error',
      runId,
      elapsedMs: Math.round(performance.now() - started),
      traceback: raw,
      friendly: friendlyTraceback(raw),
    })
  }
}

async function collectArtifacts(runId: number): Promise<void> {
  if (!pyodide) return
  const encoded = (await pyodide.runPythonAsync(COLLECT_FIGURES_PY)) as unknown
  // PyProxy(리스트) → JS 배열
  const list = (encoded as { toJs?: () => string[] })?.toJs?.() ?? (encoded as string[] | undefined)
  if (!Array.isArray(list)) return
  for (const data of list) {
    const artifact: RunArtifact = { kind: 'image', mime: 'image/png', data }
    post({ type: 'artifact', runId, artifact })
  }
  ;(encoded as { destroy?: () => void })?.destroy?.()
}

// ============================================================================
//  메시지 루프
// ============================================================================
self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const msg = event.data
  switch (msg.type) {
    case 'boot':
      void boot()
      break
    case 'run':
      void run(msg.runId, msg.code)
      break
    case 'interrupt':
      // 폴백 경로. 워커가 한가할 때만 도달하므로(실행 중이면 메시지가 처리되지 않는다)
      // 실질적인 중지는 메인 스레드가 공유 버퍼에 직접 쓰는 쪽이 담당한다.
      if (interruptBuffer) interruptBuffer[0] = 2
      break
  }
}
