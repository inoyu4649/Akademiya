import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './hooks/AuthProvider'
import IdePage from './pages/IdePage'

// ⚠️ 약관·처리방침 전문은 분량이 커서 메인 번들에 넣으면 IDE만 쓰러 온 첫 방문자에게도
//    매번 전송된다(서버 egress 원칙 — monacoLoader.ts 주석 참고). 실제로 넣어 봤더니
//    gzip 기준 12KB가 늘었다. 별도 청크로 떼어 링크를 눌렀을 때만 받도록 한다.
const PolicyPage = lazy(() => import('./pages/PolicyPage'))

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<IdePage />} />
          {/* /s/:token — 링크 공유로 들어온 파일 (Phase 6) */}
          <Route path="/s/:token" element={<IdePage />} />
          {/* 처리방침·약관은 로그인 여부와 무관하게 열려야 한다 */}
          <Route
            path="/privacy"
            element={
              <Suspense fallback={null}>
                <PolicyPage kind="privacy" />
              </Suspense>
            }
          />
          <Route
            path="/terms"
            element={
              <Suspense fallback={null}>
                <PolicyPage kind="terms" />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
