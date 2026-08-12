import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App'
import { configureMonacoLoader } from './components/editor/monacoLoader'

// Monaco를 CDN에서 받도록 버전을 고정한다(서버 egress 절약 — monacoLoader.ts 참고).
// Editor가 처음 마운트되기 전에 호출되어야 한다.
configureMonacoLoader()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
