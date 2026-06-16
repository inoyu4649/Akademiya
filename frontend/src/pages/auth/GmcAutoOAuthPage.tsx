/**
 * GMCAuto OAuth 게이트웨이 페이지
 *
 * gmc.akademiya.kr의 "Akademiya로 로그인" 버튼이 이 URL로 리디렉트합니다:
 *   https://akademiya.kr/auth/gmcauto-oauth?redirect_uri=https://gmc.akademiya.kr/auth/callback
 *
 * 동작:
 * 1. 사용자가 Akademiya에 로그인된 경우 → 즉시 코드 발급 → redirect_uri?code=XXX로 이동
 * 2. 로그인되지 않은 경우 → Akademiya 로그인 선택 화면을 거치지 않고 곧바로 Google OAuth로 이동.
 *    OAuth 완료(신규 가입 절차 포함) 후에는 Akademiya 메인 화면이 아니라 다시 이 redirect_uri로 자동 복귀한다
 *    (OAuthCallbackPage / CompleteProfilePage의 gmcRedirect 처리 참조).
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import client from "../../api/client";
import { isSafeGmcRedirect } from "../../utils/gmcAuto";

export default function GmcAutoOAuthPage() {
  const [searchParams]        = useSearchParams();
  // 세션 복원은 App.tsx의 AuthInitializer가 모든 라우트에서 항상 1회 수행한다 — 여기서
  // 별도로 refresh()를 또 호출하면 동시에 두 번의 /auth/refresh 요청이 경합하게 되고,
  // 리프레시 토큰이 1회용(로테이션)이라 둘 중 하나가 "이미 사용된 토큰"으로 401을 받을 수 있다.
  // 그 401이 AuthInitializer의 성공 응답보다 먼저 반영되면 로그인 상태인데도 initialized=true,
  // user=null로 잠깐 보여 Google OAuth로 잘못 튕기는 경합 버그가 생긴다 → 중복 호출 제거.
  const { user, initialized } = useAuthStore();
  const [status, setStatus]   = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const processedRef          = useRef(false);

  const redirectUri = searchParams.get("redirect_uri") || "https://gmc.akademiya.kr/auth/callback";

  useEffect(() => {
    if (!isSafeGmcRedirect(redirectUri)) {
      setErrorMsg("허용되지 않은 redirect_uri입니다.");
      setStatus("error");
      return;
    }

    // 세션 초기화가 완료될 때까지 대기
    if (!initialized) return;

    if (!user) {
      // 로그인되지 않음 → Akademiya 로그인 선택 화면 없이 곧바로 Google OAuth로 이동.
      // 완료 후에는 backend가 이 redirectUri로 다시 돌려보낸다 (state 파라미터로 왕복).
      if (processedRef.current) return;
      processedRef.current = true;
      window.location.href = `/api/auth/google?state=${encodeURIComponent(redirectUri)}`;
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
