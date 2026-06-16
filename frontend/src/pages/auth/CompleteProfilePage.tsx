import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import client from "../../api/client";
import { useAuthStore } from "../../store/auth.store";
import { sortedCountries, type Country } from "../../utils/countries";
import { redirectToGmcAuto, isSafeGmcRedirect } from "../../utils/gmcAuto";
import {
  PRIVACY_POLICY_VERSION,
  TERMS_OF_USE_VERSION,
  INTL_TRANSFER_VERSION,
} from "../privacy/privacyContent";
import type { SupportedLang } from "../../i18n";
import rs from "./RegisterPage.module.css";

const LANG_OPTIONS: { code: SupportedLang; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

export default function CompleteProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const updateUser = useAuthStore((s) => s.updateUser);
  const lang = i18n.language as SupportedLang;

  const gmcRedirectRaw = searchParams.get("gmcRedirect");
  const gmcRedirect = isSafeGmcRedirect(gmcRedirectRaw) ? gmcRedirectRaw : null;

  const [country, setCountry] = useState("KR"); // 거주 국가는 대한민국만 허용
  const [phone, setPhone] = useState("");
  const [language, setLang] = useState<SupportedLang>(lang);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [intlAgreed, setIntlAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!country || !phone) { setError(t("common.required")); return; }
    if (!privacyAgreed || !termsAgreed || !intlAgreed) {
      setError(t("auth.completeProfile.consentRequired", "필수 동의 항목에 모두 동의해 주세요."));
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.updateProfile({ country, phone, language });
      // 개인정보 처리방침 / 이용약관 / 국외 이전 동의 저장
      await Promise.all([
        client.post("/privacy/consent", { version: PRIVACY_POLICY_VERSION }),
        client.post("/terms/consent", { version: TERMS_OF_USE_VERSION }),
        client.post("/intl-transfer/consent", { version: INTL_TRANSFER_VERSION }),
      ]);
      updateUser(res.data);
      if (gmcRedirect) {
        // GMCAuto에서 시작된 가입 절차가 끝났으므로 Akademiya 메인이 아니라 GMCAuto로 복귀
        redirectToGmcAuto(gmcRedirect);
      } else {
        navigate("/");
      }
    } catch {
      setError(t("common.error"));
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
    <AuthLayout title={t("auth.completeProfile.title")}>
      {error && <div className={s.alertError}>{error}</div>}
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
        {t("auth.completeProfile.description")}
      </p>
      <form onSubmit={handleSubmit} noValidate>
        <div className={s.field}>
          <label className={s.label}>{t("auth.completeProfile.countryLabel")}</label>
          <select className={s.select} value={country} onChange={(e) => setCountry(e.target.value)}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{getLabel(c)}</option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.completeProfile.languageLabel")}</label>
          <select className={s.select} value={language} onChange={(e) => setLang(e.target.value as SupportedLang)}>
            {LANG_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.completeProfile.phoneLabel")}</label>
          <input className={s.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className={s.field}>
          <label className={rs.privacyLabel}>
            <input type="checkbox" className={rs.privacyCheckbox} checked={privacyAgreed} onChange={(e) => setPrivacyAgreed(e.target.checked)} />
            <span>
              {t("auth.register.privacyAgree")}{" "}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className={rs.privacyLink}>
                {t("auth.register.privacyLink")}
              </Link>
              {" "}{t("auth.register.privacyAgreeSuffix")}
            </span>
          </label>
        </div>
        <div className={s.field}>
          <label className={rs.privacyLabel}>
            <input type="checkbox" className={rs.privacyCheckbox} checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)} />
            <span>
              {t("auth.register.termsAgree")}{" "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className={rs.privacyLink}>
                {t("auth.register.termsLink")}
              </Link>
              {" "}{t("auth.register.termsAgreeSuffix")}
            </span>
          </label>
        </div>
        <div className={s.field}>
          <label className={rs.privacyLabel}>
            <input type="checkbox" className={rs.privacyCheckbox} checked={intlAgreed} onChange={(e) => setIntlAgreed(e.target.checked)} />
            <span>
              {t("auth.register.intlAgree", "(필수) 개인정보의 국외 이전(Google LLC, 미국 — 소셜 로그인 및 이메일 발송)에 동의합니다.")}
            </span>
          </label>
        </div>
        <button className={s.btn} type="submit" disabled={loading}>
          {loading ? t("common.loading") : t("auth.completeProfile.submitButton")}
        </button>
      </form>
    </AuthLayout>
  );
}
