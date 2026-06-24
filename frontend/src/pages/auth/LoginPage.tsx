import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";

const SAFE_AI_CALLBACKS = [
  "https://ai.akademiya.kr/auth/callback",
  "http://localhost:5175/auth/callback",
];
function isSafeAiRedirect(uri: string | null): uri is string {
  return !!uri && SAFE_AI_CALLBACKS.includes(uri);
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const aiRedirect = params.get("ai_redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "oauth_failed" ? t("common.error") : null
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.login({ email, password });
      setAuth(res.data.user, res.data.accessToken);
      if (isSafeAiRedirect(aiRedirect)) {
        const codeRes = await authApi.aiCode();
        window.location.href = `${aiRedirect}?code=${codeRes.data.code}`;
      } else {
        navigate("/");
      }
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "INVALID_CREDENTIALS") setError(t("auth.login.invalidCredentials"));
      else if (code === "GOOGLE_ONLY_ACCOUNT") setError(t("auth.login.googleOnlyAccount"));
      else setError(t("auth.login.serverError"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (isSafeAiRedirect(aiRedirect)) {
      sessionStorage.setItem("ai_redirect", aiRedirect);
    }
    window.location.href = "/api/auth/google";
  };

  const googleEnabled = true; // 백엔드 GOOGLE_CLIENT_ID 설정 후 사용

  return (
    <AuthLayout title={t("auth.login.title")}>
      {error && <div className={s.alertError}>{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className={s.field}>
          <label className={s.label}>{t("auth.login.emailLabel")}</label>
          <input
            className={s.input}
            type="email"
            placeholder={t("auth.login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.login.passwordLabel")}</label>
          <input
            className={s.input}
            type="password"
            placeholder={t("auth.login.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div style={{ textAlign: "right", marginBottom: 12 }}>
          <Link to="/auth/forgot-password" style={{ fontSize: 13 }}>
            {t("auth.login.forgotPassword")}
          </Link>
        </div>
        <button className={s.btn} type="submit" disabled={loading}>
          {loading ? t("common.loading") : t("auth.login.submitButton")}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className={s.divider}>{t("auth.login.divider")}</div>
          <a href="#" onClick={(e) => { e.preventDefault(); handleGoogleLogin(); }}>
            <button className={s.btnGoogle} type="button">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              {t("auth.login.googleButton")}
            </button>
          </a>
          <p className={s.googleHint}>{t("auth.login.googleHint")}</p>
        </>
      )}

      <div className={s.footer}>
        {t("auth.login.noAccount")}{" "}
        <Link to="/auth/register">{t("auth.login.registerLink")}</Link>
      </div>
    </AuthLayout>
  );
}
