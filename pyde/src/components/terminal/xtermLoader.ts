// ============================================================================
//  xterm.js 로딩 설정 — Monaco와 같은 이유로 번들이 아니라 CDN에서 가져온다
// ============================================================================
//  (monacoLoader.ts 참고) 이 서비스는 이미 Pyodide 때문에 jsDelivr에 의존하므로,
//  터미널까지 같은 CDN에서 ESM으로 동적 import하면 의존성은 늘리지 않으면서
//  우리 서버(OCI 무료 egress)의 전송량은 늘리지 않는다.
//  package.json의 devDependency(@xterm/xterm, @xterm/addon-fit)는 타입 전용이고
//  실제 런타임 코드는 이 파일을 통해서만 CDN에서 받는다.
import type { Terminal as TerminalCtor } from '@xterm/xterm'
import type { FitAddon as FitAddonCtor } from '@xterm/addon-fit'

/** package.json devDependency와 같은 버전으로 유지할 것 — 타입과 런타임 불일치 방지 */
const XTERM_VERSION = '6.0.0'
const FIT_ADDON_VERSION = '0.11.0'

export interface XtermModules {
  Terminal: typeof TerminalCtor
  FitAddon: typeof FitAddonCtor
}

let cached: Promise<XtermModules> | null = null

function ensureStylesheet(): void {
  if (document.getElementById('xterm-css')) return
  const link = document.createElement('link')
  link.id = 'xterm-css'
  link.rel = 'stylesheet'
  link.href = `https://cdn.jsdelivr.net/npm/@xterm/xterm@${XTERM_VERSION}/css/xterm.css`
  document.head.appendChild(link)
}

/** 여러 컴포넌트가 동시에 불러도 네트워크 요청은 한 번만 나가게 캐싱한다 */
export function loadXterm(): Promise<XtermModules> {
  if (!cached) {
    ensureStylesheet()
    cached = Promise.all([
      // @vite-ignore — 원격 ESM이라 Vite가 번들하면 안 된다(pyodide.worker.ts와 같은 이유)
      import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@xterm/xterm@${XTERM_VERSION}/+esm`),
      import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@xterm/addon-fit@${FIT_ADDON_VERSION}/+esm`),
    ]).then(([xtermMod, fitMod]) => ({
      Terminal: (xtermMod as { Terminal: typeof TerminalCtor }).Terminal,
      FitAddon: (fitMod as { FitAddon: typeof FitAddonCtor }).FitAddon,
    }))
  }
  return cached
}
