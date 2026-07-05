import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";

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

    // Akademiya OpenOAuth: /oauth/authorize에서 "Google로 로그인"을 눌러 진입한 경우 복귀용 쿼리스트링
    const openoauthPending = sessionStorage.getItem("openoauth_pending");

    if (!code) {
      navigate("/auth/login?error=oauth_failed");
      return;
    }
    authApi
      .oauthExchange(code)
      .then((res) => {
        setAuth(res.data.user, res.data.accessToken);
        const user = res.data.user;

        // Akademiya OpenOAuth: 로그인 완료 후 승인 화면으로 정확히 복귀
        if (openoauthPending && user.country && user.phone) {
          sessionStorage.removeItem("openoauth_pending");
          navigate(`/oauth/authorize?${openoauthPending}`);
          return;
        }

        if (!user.country || !user.phone) {
          const completeParams = new URLSearchParams();
          if (openoauthPending) completeParams.set("openoauthReturn", openoauthPending);
          const qs = completeParams.toString();
          navigate(qs ? `/auth/complete-profile?${qs}` : "/auth/complete-profile");
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
