import { useEffect } from "react";
import { useAuthStore } from "../../store/auth.store";

// 이미 로그인된 경우 홈으로, 아니면 Akademiya 로그인 페이지로 리다이렉트
const AKADEMIYA_LOGIN = import.meta.env.VITE_AKADEMIYA_LOGIN_URL ?? "https://akademiya.kr/auth/login";
const AI_CALLBACK    = import.meta.env.VITE_AI_CALLBACK_URL    ?? "https://ai.akademiya.kr/auth/callback";

export default function LoginPage() {
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (token) {
      window.location.href = "/";
      return;
    }
    window.location.href = `${AKADEMIYA_LOGIN}?ai_redirect=${encodeURIComponent(AI_CALLBACK)}`;
  }, [token]);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100dvh", background: "var(--bg-base)", color: "var(--text-secondary)", fontSize: 14,
    }}>
      Akademiya 로그인 페이지로 이동 중...
    </div>
  );
}
