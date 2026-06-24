import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";
import { redirectToGmcAuto, isSafeGmcRedirect } from "../../utils/gmcAuto";

export default function OAuthCallbackPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    const code = params.get("code");
    const gmcRedirectRaw = params.get("gmcRedirect");
    const gmcRedirect = isSafeGmcRedirect(gmcRedirectRaw) ? gmcRedirectRaw : null;
    const aiRedirectStored = sessionStorage.getItem("ai_redirect");
    const safeAiCallbacks = [
      "https://ai.akademiya.kr/auth/callback",
      "http://localhost:5175/auth/callback",
    ];
    const aiRedirect = aiRedirectStored && safeAiCallbacks.includes(aiRedirectStored)
      ? aiRedirectStored
      : null;

    if (!code) {
      navigate("/auth/login?error=oauth_failed");
      return;
    }
    authApi
      .oauthExchange(code)
      .then(async (res) => {
        setAuth(res.data.user, res.data.accessToken);
        const user = res.data.user;

        // AkashaAlt SSO: 로그인 완료 후 ai.akademiya.kr로 복귀
        if (aiRedirect && user.country && user.phone) {
          sessionStorage.removeItem("ai_redirect");
          const codeRes = await authApi.aiCode();
          window.location.href = `${aiRedirect}?code=${codeRes.data.code}`;
          return;
        }

        if (!user.country || !user.phone) {
          navigate(
            gmcRedirect
              ? `/auth/complete-profile?gmcRedirect=${encodeURIComponent(gmcRedirect)}`
              : "/auth/complete-profile"
          );
        } else if (gmcRedirect) {
          redirectToGmcAuto(gmcRedirect);
        } else {
          navigate("/");
        }
      })
      .catch(() => navigate("/auth/login?error=oauth_failed"));
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-secondary)" }}>
      {t("common.loading")}
    </div>
  );
}
