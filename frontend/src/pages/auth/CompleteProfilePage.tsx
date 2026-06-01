import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthLayout, { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";
import { sortedCountries } from "../../utils/countries";

export default function CompleteProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const updateUser = useAuthStore((s) => s.updateUser);
  const lang = i18n.language as "ko" | "en" | "ja" | "zh";

  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!country || !phone) { setError(t("common.required")); return; }
    setLoading(true);
    try {
      const res = await authApi.updateProfile({ country, phone });
      updateUser(res.data);
      navigate("/");
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
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
            <option value=""></option>
            {sortedCountries(lang).map((c) => (
              <option key={c.code} value={c.code}>{lang === "ko" ? c.ko : c.en}</option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.completeProfile.phoneLabel")}</label>
          <input className={s.input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <button className={s.btn} type="submit" disabled={loading}>
          {loading ? t("common.loading") : t("auth.completeProfile.submitButton")}
        </button>
      </form>
    </AuthLayout>
  );
}
