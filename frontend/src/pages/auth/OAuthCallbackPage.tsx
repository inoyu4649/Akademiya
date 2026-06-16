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
    if (!code) {
      navigate("/auth/login?error=oauth_failed");
      return;
    }
    authApi
      .oauthExchange(code)
      .then((res) => {
        setAuth(res.data.user, res.data.accessToken);
        const user = res.data.user;
        if (!user.country || !user.phone) {
          // 신규 가입(필수 정보 미입력) → 가입 절차 완료 후 GMCAuto로 복귀하도록 전달
          navigate(
            gmcRedirect
              ? `/auth/complete-profile?gmcRedirect=${encodeURIComponent(gmcRedirect)}`
              : "/auth/complete-profile"
          );
        } else if (gmcRedirect) {
          // 기존 사용자 로그인 완료 → Akademiya 메인이 아니라 곧바로 GMCAuto로 복귀
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
