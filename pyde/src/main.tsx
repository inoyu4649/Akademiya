import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App'
import { configureMonacoLoader } from './components/editor/monacoLoader'

// Monaco를 CDN에서 받도록 버전을 고정한다(서버 egress 절약 — monacoLoader.ts 참고).
// Editor가 처음 마운트되기 전에 호출되어야 한다.
configureMonacoLoader()

// ── PWA 서비스 워커 ─────────────────────────────────────────────────────────
// ⚠️ 개발 서버에서는 등록하지 않는다. Vite HMR이 주는 모듈까지 서비스 워커가 가로채면
//    코드를 고쳐도 옛 화면이 뜨는 유령 버그가 생기고, 원인을 찾기가 아주 어렵다.
// ⚠️ load 이후로 미루는 이유: 등록 자체가 sw.js를 받아오는 네트워크 요청이라,
//    첫 화면과 Pyodide 다운로드에 쓸 대역폭을 초기에 나눠 갖지 않게 한다.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // 등록 실패는 앱 동작과 무관하다(설치·오프라인 셸만 못 쓸 뿐) — 조용히 넘어간다
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
