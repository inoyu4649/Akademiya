import { useState } from "react";
import { useTranslation } from "react-i18next";
import { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";
import { sortedCountries } from "../../utils/countries";

type Step = "verify" | "edit";

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "ko" | "en" | "ja" | "zh";
  const { user, updateUser } = useAuthStore();
  const hasPassword = true; // Google-only accounts would set this false after /me fetch

  const [step, setStep] = useState<Step>(hasPassword ? "verify" : "edit");
  const [currentPassword, setCurrentPassword] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [form, setForm] = useState({
    displayName: user?.displayName ?? "",
    phone: user?.phone ?? "",
    country: user?.country ?? "",
    newPassword: "",
    confirmPassword: "",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const setField = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError(null);
    setVerifyLoading(true);
    try {
      // Verify by attempting a no-op profile update with the current password
      await authApi.updateProfile({ currentPassword, displayName: form.displayName });
      setStep("edit");
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "WRONG_PASSWORD") setVerifyError(t("auth.profile.wrongPassword"));
      else setVerifyError(t("common.error"));
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    if (form.newPassword && form.newPassword.length < 8) { setSaveError(t("auth.profile.passwordTooShort")); return; }
    if (form.newPassword && form.newPassword !== form.confirmPassword) { setSaveError(t("auth.profile.passwordMismatch")); return; }
    setSaveLoading(true);
    try {
      const payload: Parameters<typeof authApi.updateProfile>[0] = {
        currentPassword,
        displayName: form.displayName,
        country: form.country,
        phone: form.phone,
      };
      if (form.newPassword) payload.newPassword = form.newPassword;
      const res = await authApi.updateProfile(payload);
      updateUser(res.data);
      setSaveSuccess(true);
      setForm((prev) => ({ ...prev, newPassword: "", confirmPassword: "" }));
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "WRONG_PASSWORD") setSaveError(t("auth.profile.wrongPassword"));
      else setSaveError(t("common.error"));
    } finally {
      setSaveLoading(false);
    }
  };

  const pageStyle: React.CSSProperties = {
    padding: "40px",
    display: "flex",
    justifyContent: "center",
  };
  const cardStyle: React.CSSProperties = {
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    padding: "32px 36px",
    width: "100%",
    maxWidth: "440px",
  };
  const titleStyle: React.CSSProperties = {
    fontSize: "18px",
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: "20px",
  };

  if (step === "verify") {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>{t("auth.profile.verifyTitle")}</h1>
          {verifyError && <div className={s.alertError}>{verifyError}</div>}
          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>
            {t("auth.profile.verifyDescription")}
          </p>
          <form onSubmit={handleVerify} noValidate>
            <div className={s.field}>
              <label className={s.label}>{t("auth.profile.currentPasswordLabel")}</label>
              <input
                className={s.input}
                type="password"
                placeholder={t("auth.profile.currentPasswordPlaceholder")}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <button className={s.btn} type="submit" disabled={verifyLoading || !currentPassword}>
              {verifyLoading ? t("common.loading") : t("auth.profile.verifyButton")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>{t("auth.profile.title")}</h1>
        {saveError && <div className={s.alertError}>{saveError}</div>}
        {saveSuccess && <div className={s.alertSuccess}>{t("auth.profile.saveSuccess")}</div>}
      <form onSubmit={handleSave} noValidate>
        <div className={s.field}>
          <label className={s.label}>{t("auth.profile.displayNameLabel")}</label>
          <input className={s.input} type="text" value={form.displayName} onChange={setField("displayName")} />
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.profile.countryLabel")}</label>
          <select className={s.select} value={form.country} onChange={setField("country")}>
            {sortedCountries(lang).map((c) => (
              <option key={c.code} value={c.code}>{lang === "ko" ? c.ko : c.en}</option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.profile.phoneLabel")}</label>
          <input className={s.input} type="tel" value={form.phone} onChange={setField("phone")} />
        </div>

        <div style={{ borderTop: "1px solid var(--border)", margin: "24px 0 16px" }}>
          <p style={{ marginTop: 16, marginBottom: 14, color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 }}>
            {t("auth.profile.changePasswordTitle")}
          </p>
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.profile.newPasswordLabel")}</label>
          <input className={s.input} type="password" value={form.newPassword} onChange={setField("newPassword")} autoComplete="new-password" />
        </div>
        <div className={s.field}>
          <label className={s.label}>{t("auth.profile.confirmPasswordLabel")}</label>
          <input className={s.input} type="password" value={form.confirmPassword} onChange={setField("confirmPassword")} autoComplete="new-password" />
        </div>

        <button className={s.btn} type="submit" disabled={saveLoading}>
          {saveLoading ? t("common.loading") : t("auth.profile.saveButton")}
        </button>
      </form>
      </div>
    </div>
  );
}
