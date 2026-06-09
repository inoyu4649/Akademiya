import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { useAuthStore } from "../../store/auth.store";
import { sortedCountries } from "../../utils/countries";

type Step = "verify" | "edit";

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "ko" | "en" | "ja" | "zh";
  const { user, updateUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();
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

  // ── 회원 탈퇴 상태 ─────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await authApi.deleteAccount(deletePassword || undefined);
      clearAuth();
      navigate("/auth/login", { replace: true });
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (code === "WRONG_PASSWORD")      setDeleteError(t("auth.deleteAccount.wrongPassword"));
      else if (code === "PASSWORD_REQUIRED") setDeleteError(t("auth.deleteAccount.passwordRequired"));
      else                                setDeleteError(t("common.error"));
    } finally {
      setDeleteLoading(false);
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
              <option key={c.code} value={c.code}>
                {lang === "ko" ? c.ko : lang === "ja" ? c.ja : lang === "zh" ? c.zh : c.en}
              </option>
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

      {/* ── 회원 탈퇴 (위험 구역) ── */}
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 28, paddingTop: 20 }}>
        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            style={{
              width: "100%",
              padding: "8px 16px",
              background: "transparent",
              border: "1px solid rgba(244,67,54,0.4)",
              borderRadius: "var(--radius-sm)",
              color: "var(--danger)",
              fontSize: 13,
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(244,67,54,0.07)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(244,67,54,0.7)"; }}
            onMouseOut={(e)  => { (e.currentTarget as HTMLButtonElement).style.background = "transparent";           (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(244,67,54,0.4)"; }}
          >
            {t("auth.deleteAccount.openBtn")}
          </button>
        ) : (
          <div style={{
            background: "rgba(244,67,54,0.06)",
            border: "1px solid rgba(244,67,54,0.35)",
            borderRadius: "var(--radius-sm)",
            padding: "16px",
          }}>
            <p style={{ color: "var(--danger)", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
              ⚠ {t("auth.deleteAccount.title")}
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
              {t("auth.deleteAccount.warning")}
            </p>
            {deleteError && <div className={s.alertError} style={{ marginBottom: 12 }}>{deleteError}</div>}
            <form onSubmit={handleDelete} noValidate>
              <div className={s.field}>
                <label className={s.label}>{t("auth.deleteAccount.passwordLabel")}</label>
                <input
                  className={s.input}
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder={t("auth.deleteAccount.passwordPlaceholder")}
                  autoComplete="current-password"
                />
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {t("auth.deleteAccount.googleHint")}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => { setDeleteOpen(false); setDeletePassword(""); setDeleteError(null); }}
                  style={{
                    flex: 1, padding: "9px",
                    background: "var(--bg-input)", color: "var(--text-secondary)",
                    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                    fontSize: 14, cursor: "pointer",
                  }}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={deleteLoading}
                  style={{
                    flex: 1, padding: "9px",
                    background: deleteLoading ? "rgba(244,67,54,0.4)" : "rgba(244,67,54,0.85)",
                    color: "#fff", border: "none",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 14, fontWeight: 600,
                    cursor: deleteLoading ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                  }}
                >
                  {deleteLoading ? t("common.loading") : t("auth.deleteAccount.confirmBtn")}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      </div>
    </div>
  );
}
