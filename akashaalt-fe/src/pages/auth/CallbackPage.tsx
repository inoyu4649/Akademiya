import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import type { AkashaUser } from "../../store/auth.store";

interface ExchangeResponse {
  accessToken: string;
  user: AkashaUser;
}

export default function CallbackPage() {
  const [params] = useSearchParams();
  const navigate  = useNavigate();
  const setAuth   = useAuthStore((s) => s.setAuth);
  const called    = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const code = params.get("code");
    if (!code) { navigate("/auth/login"); return; }

    // oauth-exchange는 /api/auth/oauth-exchange — ai.akademiya.kr nginx가 /api/ 를 backend로 프록시
    fetch("/api/auth/oauth-exchange", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ code }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("exchange_failed");
        return r.json() as Promise<ExchangeResponse>;
      })
      .then((data) => {
        if (!data.accessToken) throw new Error("no_token");
        setAuth(data.user, data.accessToken);
        navigate("/");
      })
      .catch(() => navigate("/auth/login"));
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: "var(--bg-base)", color: "var(--text-secondary)", fontSize: 14,
    }}>
      로그인 처리 중...
    </div>
  );
}
