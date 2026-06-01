import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";
import { sortedCountries } from "../../utils/countries";

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const lang = i18n.language as "ko" | "en" | "ja" | "zh";

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
    country: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Partial<typeof form & { global: string }>>({});
  const [loading, setLoading] = useState(false);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!form.displayName) e.displayName = t("common.required");
    if (!form.email) e.email = t("common.required");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t("auth.register.invalidEmail");
    if (!form.password) e.password = t("common.required");
    else if (form.password.length < 8) e.password = t("auth.register.passwordTooShort");
    if (form.password !== form.confirmPassword) e.confirmPassword = t("auth.register.passwordMismatch");
    if (!form.country) e.country = t("common.required");
    if (!form.phone) e.phone = t("common.required");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authApi.register({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        country: form.country,
        phone: form.phone,
      });
      setAuth(res.data.user, res.data.accessToken);
      navigate("/");
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "EMAIL_EXISTS") setErrors({ global: t("auth.register.emailExists") });
      else setErrors({ global: t("auth.register.serverError") });
    } finally {
      setLoading(false);
    }
  };

  const countries = sortedCountries(lang);

  return (
    <AuthLayout title={t("auth.register.title")}>
      {errors.global && <div className={s.alertError}>{errors.global}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.displayNameLabel")}</label>
          <input className={s.input} type="text" placeholder={t("auth.register.displayNamePlaceholder")} value={form.displayName} onChange={set("displayName")} />
          {errors.displayName && <p className={s.fieldError}>{errors.displayName}</p>}
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.emailLabel")}</label>
          <input className={s.input} type="email" placeholder={t("auth.register.emailPlaceholder")} value={form.email} onChange={set("email")} autoComplete="email" />
          {errors.email && <p className={s.fieldError}>{errors.email}</p>}
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.passwordLabel")}</label>
          <input className={s.input} type="password" placeholder={t("auth.register.passwordPlaceholder")} value={form.password} onChange={set("password")} autoComplete="new-password" />
          {errors.password && <p className={s.fieldError}>{errors.password}</p>}
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.confirmPasswordLabel")}</label>
          <input className={s.input} type="password" placeholder={t("auth.register.confirmPasswordPlaceholder")} value={form.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" />
          {errors.confirmPassword && <p className={s.fieldError}>{errors.confirmPassword}</p>}
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.countryLabel")}</label>
          <select className={s.select} value={form.country} onChange={set("country")}>
            <option value="">{t("auth.register.countryPlaceholder")}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{lang === "ko" ? c.ko : c.en}</option>
            ))}
          </select>
          {errors.country && <p className={s.fieldError}>{errors.country}</p>}
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.phoneLabel")}</label>
          <input className={s.input} type="tel" placeholder={t("auth.register.phonePlaceholder")} value={form.phone} onChange={set("phone")} />
          {errors.phone && <p className={s.fieldError}>{errors.phone}</p>}
        </div>
        <button className={s.btn} type="submit" disabled={loading}>
          {loading ? t("common.loading") : t("auth.register.submitButton")}
        </button>
      </form>
      <div className={s.footer}>
        {t("auth.register.hasAccount")}{" "}
        <Link to="/auth/login">{t("auth.register.loginLink")}</Link>
      </div>
    </AuthLayout>
  );
}
