import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { useChatStore } from "./store/chat.store";
import LoginPage    from "./pages/auth/LoginPage";
import CallbackPage from "./pages/auth/CallbackPage";
import ChatPage     from "./pages/chat/ChatPage";
import SettingsPage from "./pages/settings/SettingsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  if (!token) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

// 로그인 후 대화 목록 + 모델 목록 초기화
function AppInit() {
  const token = useAuthStore((s) => s.accessToken);
  const init  = useChatStore((s) => s.init);
  useEffect(() => { if (token) void init(); }, [token]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInit />
      <Routes>
        <Route path="/auth/login"    element={<LoginPage />} />
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route path="/" element={
          <ProtectedRoute><ChatPage /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute><SettingsPage /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
