import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { openoauthApi, type LoginMeans } from "../../api/openoauth.api";
import { useAuthStore } from "../../store/auth.store";
import GoogleIcon from "../../components/common/GoogleIcon";
import styles from "./OAuthAuthorizePage.module.css";

interface AuthorizeInfo {
  displayName: string;
  mainSiteUrl: string;
  loginMeans: LoginMeans;
}

/**
 * Akademiya OpenOAuth — 사용자가 서드파티 OAuth App의 "Akademiya로 로그인"을 통해
 * 도착하는 화면. 기본은 Akademiya 로그인 화면(AuthLayout)과 동일한 UI를 쓰되,
 * 앱의 loginMeans에 따라 버튼 구성이 달라지고, 로그인 완료 후에는 승인(Consent) 화면으로 전환된다.
 */
export default function OAuthAuthorizePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { user, initialized, setAuth } = useAuthStore();

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const scope = params.get("scope") ?? "openid profile email";
  const codeChallenge = params.get("code_challenge") ?? "";
  const codeChallengeMethod = params.get("code_challenge_method") ?? "";

  const [info, setInfo] = useState<AuthorizeInfo | null>(null);
  const [infoError, setInfoError] = useState("");
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [authorizing, setAuthorizing] = useState(false);
  const [authorizeError, setAuthorizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
      setInfoError(t("oauth.authorize.errorInvalidRequest"));
      setLoadingInfo(false);
      return;
    }
    openoauthApi.authorizeInfo(clientId, redirectUri, scope)
      .then((res) => setInfo(res.data))
      .catch(() => setInfoError(t("oauth.authorize.errorInvalidRequest")))
      .finally(() => setLoadingInfo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await authApi.login({ email, password });
      setAuth(res.data.user, res.data.accessToken);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "INVALID_CREDENTIALS") setLoginError(t("auth.login.invalidCredentials"));
      else if (code === "GOOGLE_ONLY_ACCOUNT") setLoginError(t("auth.login.googleOnlyAccount"));
      else setLoginError(t("auth.login.serverError"));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Google OAuth 왕복 후 이 화면으로 정확히 복귀하기 위해 현재 쿼리스트링을 보관
    sessionStorage.setItem("openoauth_pending", window.location.search.slice(1));
    window.location.href = "/api/auth/google";
  };

  const handleAllow = async () => {
    setAuthorizing(true);
    setAuthorizeError(null);
    try {
      const res = await openoauthApi.authorize({
        clientId, redirectUri, state, scope, codeChallenge, codeChallengeMethod: "S256",
      });
      window.location.href = res.data.redirectUrl;
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; reason?: string } } })?.response?.data;
      let message = t("oauth.authorize.errorGeneric");
      if (data?.error === "OAUTH_APP_BANNED") {
        message = data.reason
          ? t("oauth.authorize.errorBannedWithReason", { reason: data.reason })
          : t("oauth.authorize.errorBanned");
      } else if (data?.error === "OAUTH_NOT_ELIGIBLE") {
        message = t("oauth.authorize.errorNotEligible");
      } else if (data?.error === "OAUTH_GOOGLE_ONLY") {
        message = t("oauth.authorize.errorGoogleOnly");
      }
      setAuthorizeError(message);
      setAuthorizing(false);
    }
  };

  const handleCancel = () => {
    if (info?.mainSiteUrl) window.location.href = info.mainSiteUrl;
  };

  if (loadingInfo || !initialized) {
    return <div className={styles.centered}>{t("common.loading")}</div>;
  }

  if (infoError || !info) {
    return (
      <AuthLayout title={t("oauth.authorize.title")}>
        <div className={s.alertError}>{infoError || t("oauth.authorize.errorGeneric")}</div>
      </AuthLayout>
    );
  }

  const appBox = (
    <div className={styles.appBox}>
      {t("oauth.authorize.loggingInToPrefix")}
      <a href={info.mainSiteUrl} target="_blank" rel="noopener noreferrer" className={styles.appLink}>
        {info.displayName}
      </a>
      {t("oauth.authorize.loggingInToSuffix")}
    </div>
  );

  // ── 로그인이 필요한 상태 — loginMeans에 따라 버튼 구성 변경 ──
  if (!user) {
    const showAkademiya = info.loginMeans === "akademiya" || info.loginMeans === "both";
    const showGoogle = info.loginMeans === "google" || info.loginMeans === "both";
    const showRegister = info.loginMeans !== "google";

    return (
      <AuthLayout title={t("auth.login.title")}>
        {appBox}

        {showAkademiya && (
          <>
            {loginError && <div className={s.alertError}>{loginError}</div>}
            <form onSubmit={handleEmailLogin} noValidate>
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
              <button className={s.btn} type="submit" disabled={loginLoading}>
                {loginLoading ? t("common.loading") : t("auth.login.submitButton")}
              </button>
            </form>
          </>
        )}

        {showAkademiya && showGoogle && <div className={s.divider}>{t("auth.login.divider")}</div>}

        {showGoogle && (
          <>
            <button className={s.btnGoogle} type="button" onClick={handleGoogleLogin}>
              <GoogleIcon />
              {t("auth.login.googleButton")}
            </button>
            <p className={s.googleHint}>{t("auth.login.googleHint")}</p>
          </>
        )}

        {showRegister && (
          <div className={s.footer}>
            {t("auth.login.noAccount")}{" "}
            <Link to={`/auth/register?openoauthReturn=${encodeURIComponent(window.location.search.slice(1))}`}>
              {t("auth.login.registerLink")}
            </Link>
          </div>
        )}
      </AuthLayout>
    );
  }

  // ── 로그인 완료 → 승인(Consent) 화면 ──
  return (
    <AuthLayout title={t("oauth.authorize.consentTitle")}>
      {appBox}
      {authorizeError && <div className={s.alertError}>{authorizeError}</div>}
      <p className={styles.consentText}>{t("oauth.authorize.consentIntro", { email: user.email })}</p>
      <ul className={styles.consentList}>
        <li>{t("oauth.authorize.shareName")}</li>
        <li>{t("oauth.authorize.shareEmail")}</li>
      </ul>
      <button className={s.btn} onClick={handleAllow} disabled={authorizing}>
        {authorizing ? t("common.loading") : t("oauth.authorize.allowBtn")}
      </button>
      <button className={styles.cancelBtn} type="button" onClick={handleCancel}>
        {t("oauth.authorize.cancelBtn")}
      </button>
    </AuthLayout>
  );
}
