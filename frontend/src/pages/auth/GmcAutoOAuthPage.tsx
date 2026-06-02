/**
 * GMCAuto OAuth 게이트웨이 페이지
 *
 * gmc.akademiya.kr의 "Akademiya로 로그인" 버튼이 이 URL로 리디렉트합니다:
 *   https://akademiya.kr/auth/gmcauto-oauth?redirect_uri=https://gmc.akademiya.kr/auth/callback
 *
 * 동작:
 * 1. 사용자가 Akademiya에 로그인된 경우 → 즉시 코드 발급 → redirect_uri?code=XXX로 이동
 * 2. 로그인되지 않은 경우 → 로그인 페이지로 리디렉트 (returnTo 포함)
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { authApi } from "../../api/auth.api";
import client from "../../api/client";

export default function GmcAutoOAuthPage() {
  const navigate              = useNavigate();
  const [searchParams]        = useSearchParams();
  const { user, initialized, setAuth, setInitialized } = useAuthStore();
  const [status, setStatus]   = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const processedRef          = useRef(false);

  const redirectUri = searchParams.get("redirect_uri") || "https://gmc.akademiya.kr/auth/callback";

  // 허용된 redirect_uri (보안: 허가된 도메인만 허용)
  const ALLOWED_ORIGINS = ["https://gmc.akademiya.kr", "http://localhost:5174", "http://localhost:3001"];

  function isSafeRedirectUri(uri: string) {
    try {
      const url = new URL(uri);
      return ALLOWED_ORIGINS.some(o => uri.startsWith(o)) && url.pathname === "/auth/callback";
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (!isSafeRedirectUri(redirectUri)) {
      setErrorMsg("허용되지 않은 redirect_uri입니다.");
      setStatus("error");
      return;
    }

    // 세션 초기화가 완료될 때까지 대기
    if (!initialized) return;

    if (!user) {
      // 로그인되지 않음 → 로그인 페이지로 이동 (로그인 후 이 페이지로 돌아옴)
      const returnTo = encodeURIComponent(`/auth/gmcauto-oauth?redirect_uri=${encodeURIComponent(redirectUri)}`);
      navigate(`/auth/login?returnTo=${returnTo}`, { replace: true });
      return;
    }

    // 이미 처리 중이면 중복 실행 방지
    if (processedRef.current) return;
    processedRef.current = true;

    // 코드 발급
    client.post("/oauth/gmcauto-code")
      .then((res) => {
        const code = (res.data as { code: string }).code;
        const dest = `${redirectUri}?code=${encodeURIComponent(code)}`;
        window.location.href = dest;
      })
      .catch((err) => {
        console.error("[GMCAuto OAuth] 코드 발급 실패", err);
        setErrorMsg("코드 발급에 실패했습니다. 다시 시도해주세요.");
        setStatus("error");
        processedRef.current = false;
      });
  }, [initialized, user, redirectUri]);

  // 세션 복원 (직접 이 URL에 접근한 경우 — AuthInitializer 미실행)
  useEffect(() => {
    if (initialized) return;
    authApi.refresh()
      .then((res) => setAuth(res.data.user, res.data.accessToken))
      .catch(() => setInitialized(true));
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg)",
        flexDirection: "column",
        gap: "16px",
        padding: "24px",
      }}
    >
      {status === "loading" ? (
        <>
          <div
            style={{
              width: "36px",
              height: "36px",
              border: "3px solid var(--border)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            GMCAuto로 이동 중...
          </p>
        </>
      ) : (
        <>
          <p style={{ color: "var(--danger, #f87171)", fontSize: "14px" }}>
            {errorMsg}
          </p>
          <button
            style={{
              padding: "8px 20px",
              background: "var(--accent, #22c55e)",
              color: "#000",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
            }}
            onClick={() => {
              processedRef.current = false;
              setStatus("loading");
              setErrorMsg("");
              window.location.reload();
            }}
          >
            다시 시도
          </button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
