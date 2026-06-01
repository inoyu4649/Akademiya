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
          navigate("/auth/complete-profile");
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
