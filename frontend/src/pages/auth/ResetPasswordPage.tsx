import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", code: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.newPassword.length < 8) { setError(t("auth.resetPassword.passwordTooShort")); return; }
    if (form.newPassword !== form.confirmPassword) { setError(t("auth.resetPassword.passwordMismatch")); return; }
    setLoading(true);
    try {
      await authApi.resetPassword({ email: form.email, code: form.code, newPassword: form.newPassword });
      navigate("/auth/login?reset=1");
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "INVALID_OR_EXPIRED_CODE") setError(t("auth.resetPassword.invalidCode"));
      else setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title={t("auth.resetPassword.title")}>
      {error && <div className={s.alertError}>{error}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className={s.field}>
          <label className={s.label}>{t("auth.resetPassword.emailLabel")}</label>
          <input className={s.input} type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.resetPassword.codeLabel")}</label>
          <input className={s.input} type="text" placeholder={t("auth.resetPassword.codePlaceholder")} value={form.code} onChange={set("code")} maxLength={6} required />
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.resetPassword.newPasswordLabel")}</label>
          <input className={s.input} type="password" placeholder={t("auth.resetPassword.newPasswordPlaceholder")} value={form.newPassword} onChange={set("newPassword")} autoComplete="new-password" required />
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.resetPassword.confirmPasswordLabel")}</label>
          <input className={s.input} type="password" value={form.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" required />
        </div>
        <button className={s.btn} type="submit" disabled={loading}>
          {loading ? t("common.loading") : t("auth.resetPassword.submitButton")}
        </button>
      </form>
      <div className={s.footer}>
        <Link to="/auth/login">{t("auth.forgotPassword.backToLogin")}</Link>
      </div>
    </AuthLayout>
  );
}
