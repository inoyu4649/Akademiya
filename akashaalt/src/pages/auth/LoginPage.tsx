import { useEffect, useRef } from "react";
import { useAuthStore } from "../../store/auth.store";
import { startAkademiyaLogin } from "../../utils/akademiyaOAuth";

// 이미 로그인된 경우 홈으로, 아니면 Akademiya OpenOAuth 인가 화면으로 리다이렉트(PKCE)
export default function LoginPage() {
  const token = useAuthStore((s) => s.accessToken);
  const started = useRef(false);

  useEffect(() => {
    if (token) {
      window.location.href = "/";
      return;
    }
    if (started.current) return;
    started.current = true;
    void startAkademiyaLogin();
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
