import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";
import { sortedCountries, type Country } from "../../utils/countries";
import { PRIVACY_POLICY_VERSION, TERMS_OF_USE_VERSION, INTL_TRANSFER_VERSION } from "../privacy/privacyContent";
import type { SupportedLang } from "../../i18n";
import rs from "./RegisterPage.module.css";

const LANG_OPTIONS: { code: SupportedLang; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const lang = i18n.language as SupportedLang;
  // Akademiya OpenOAuth 승인 화면에서 회원가입으로 진입한 경우 가입 완료 후 복귀할 대상
  const openoauthReturn = searchParams.get("openoauthReturn");

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
    country: "KR", // 거주 국가는 대한민국만 허용 (GDPR 등 국외 규제 이슈 방지)
    phone: "",
    language: lang,
  });
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [intlAgreed, setIntlAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form & { global: string; privacy: string; terms: string; intl: string }>>({});
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
    if (!privacyAgreed) e.privacy = t("auth.register.privacyRequired");
    if (!termsAgreed) e.terms = t("auth.register.termsRequired");
    if (!intlAgreed) e.intl = t("auth.register.intlRequired", "국외 이전 동의가 필요합니다.");
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
        language: form.language,
        privacyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: TERMS_OF_USE_VERSION,
        intlTransferVersion: INTL_TRANSFER_VERSION,
      });
      setAuth(res.data.user, res.data.accessToken);
      if (openoauthReturn) {
        // Akademiya OpenOAuth 승인 화면에서 시작된 가입이므로 그 화면으로 복귀 (RegisterPage는 국가/전화번호를
        // 이미 수집하므로 CompleteProfilePage를 거칠 필요 없이 곧바로 복귀 가능)
        navigate(`/oauth/authorize?${openoauthReturn}`);
      } else {
        navigate("/");
      }
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "EMAIL_EXISTS") setErrors({ global: t("auth.register.emailExists") });
      else setErrors({ global: t("auth.register.serverError") });
    } finally {
      setLoading(false);
    }
  };

  // 거주 국가는 대한민국(KR)만 선택 가능
  const countries = sortedCountries(lang).filter((c) => c.code === "KR");
  const getLabel = (c: Country) => {
    if (lang === "ko") return c.ko;
    if (lang === "ja") return c.ja;
    if (lang === "zh") return c.zh;
    return c.en;
  };

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
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{getLabel(c)}</option>
            ))}
          </select>
          {errors.country && <p className={s.fieldError}>{errors.country}</p>}
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.languageLabel")}</label>
          <select className={s.select} value={form.language} onChange={set("language")}>
            {LANG_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.register.phoneLabel")}</label>
          <input className={s.input} type="tel" placeholder={t("auth.register.phonePlaceholder")} value={form.phone} onChange={set("phone")} />
          {errors.phone && <p className={s.fieldError}>{errors.phone}</p>}
        </div>
        <div className={s.field}>
          <label className={rs.privacyLabel}>
            <input
              type="checkbox"
              className={rs.privacyCheckbox}
              checked={privacyAgreed}
              onChange={(e) => setPrivacyAgreed(e.target.checked)}
            />
            <span>
              {t("auth.register.privacyAgree")}{" "}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className={rs.privacyLink}>
                {t("auth.register.privacyLink")}
              </Link>
              {" "}{t("auth.register.privacyAgreeSuffix")}
            </span>
          </label>
          {errors.privacy && <p className={s.fieldError}>{errors.privacy}</p>}
        </div>
        <div className={s.field}>
          <label className={rs.privacyLabel}>
            <input
              type="checkbox"
              className={rs.privacyCheckbox}
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
            />
            <span>
              {t("auth.register.termsAgree")}{" "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className={rs.privacyLink}>
                {t("auth.register.termsLink")}
              </Link>
              {" "}{t("auth.register.termsAgreeSuffix")}
            </span>
          </label>
          {errors.terms && <p className={s.fieldError}>{errors.terms}</p>}
        </div>
        <div className={s.field}>
          <label className={rs.privacyLabel}>
            <input
              type="checkbox"
              className={rs.privacyCheckbox}
              checked={intlAgreed}
              onChange={(e) => setIntlAgreed(e.target.checked)}
            />
            <span>
              {t("auth.register.intlAgree", "(필수) 개인정보의 국외 이전(Google LLC, 미국 — 소셜 로그인 및 이메일 발송)에 동의합니다.")}
            </span>
          </label>
          {errors.intl && <p className={s.fieldError}>{errors.intl}</p>}
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
