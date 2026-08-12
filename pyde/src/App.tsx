import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './hooks/AuthProvider'
import IdePage from './pages/IdePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<IdePage />} />
          {/* /s/:token — 링크 공유로 들어온 파일 (Phase 6) */}
          <Route path="/s/:token" element={<IdePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
