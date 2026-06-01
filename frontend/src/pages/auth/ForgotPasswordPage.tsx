import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("auth.forgotPassword.title")}>
      {sent ? (
        <>
          <div className={s.alertSuccess}>{t("auth.forgotPassword.codeSent")}</div>
          <Link to="/auth/reset-password">
            <button className={s.btn} type="button">
              {t("auth.resetPassword.title")} →
            </button>
          </Link>
        </>
      ) : (
        <>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
            {t("auth.forgotPassword.description")}
          </p>
          <form onSubmit={handleSubmit} noValidate>
            <div className={s.field}>
              <label className={s.label}>{t("auth.forgotPassword.emailLabel")}</label>
              <input
                className={s.input}
                type="email"
                placeholder={t("auth.forgotPassword.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <button className={s.btn} type="submit" disabled={loading || !email}>
              {loading ? t("common.loading") : t("auth.forgotPassword.submitButton")}
            </button>
          </form>
        </>
      )}
      <div className={s.footer}>
        <Link to="/auth/login">{t("auth.forgotPassword.backToLogin")}</Link>
      </div>
    </AuthLayout>
  );
}
