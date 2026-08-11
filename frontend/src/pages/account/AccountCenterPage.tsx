import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { css as s } from "../../components/layout/AuthLayout";
import { authApi } from "../../api/auth.api";
import { orgApi, type Org, type OrgPendingJoin } from "../../api/org.api";
import { openoauthApi, type OAuthConnection } from "../../api/openoauth.api";
import { useAuthStore } from "../../store/auth.store";
import { sortedCountries } from "../../utils/countries";
import rs from "../auth/RegisterPage.module.css";
import styles from "./AccountCenterPage.module.css";

type Step = "verify" | "edit";

export default function AccountCenterPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as "ko" | "en" | "ja" | "zh";
  const { user, updateUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  // Google 전용 계정은 확인할 비밀번호 자체가 없으므로 확인 단계를 건너뛴다.
  const hasPassword = user?.hasPassword ?? true;

  const [step, setStep] = useState<Step>(hasPassword ? "verify" : "edit");
  const [currentPassword, setCurrentPassword] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // 세션 복원 이후 hasPassword가 늦게 채워지는 경우를 대비해 동기화
  useEffect(() => {
    if (!hasPassword) setStep("edit");
  }, [hasPassword]);

  const [form, setForm] = useState({
    displayName: user?.displayName ?? "",
    phone: user?.phone ?? "",
    country: user?.country ?? "KR",
    newPassword: "",
    confirmPassword: "",
  });
  const [developerMode, setDeveloperMode] = useState(user?.developerMode ?? false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // ── 프로필 사진 ────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ── 조직 ───────────────────────────────────────────────────────
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [pendingJoins, setPendingJoins] = useState<OrgPendingJoin[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // ── 연결된 서비스 (OpenOAuth) ──────────────────────────────────
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [connLoading, setConnLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  // ── 회원 탈퇴 ──────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  function loadOrgs() {
    orgApi.my()
      .then((res) => {
        setOrgs(res.data.orgs);
        setPendingJoins(res.data.pendingJoins ?? []);
      })
      .catch(() => { /* 무시 */ });
  }

  useEffect(() => {
    if (step !== "edit") return;
    loadOrgs();
    openoauthApi.listConnections()
      .then((res) => setConnections(res.data.connections))
      .catch(() => { /* 무시 */ })
      .finally(() => setConnLoading(false));
  }, [step]);

  const setField = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    setAvatarLoading(true);
    try {
      const res = await authApi.uploadAvatar(file);
      setAvatarUrl(res.data.avatarUrl);
      updateUser({ avatarUrl: res.data.avatarUrl });
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setAvatarError(
        code === "INVALID_FILE_TYPE" || code === "INVALID_FILE"
          ? t("auth.profile.avatarInvalidType")
          : t("common.error")
      );
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarError(null);
    setAvatarLoading(true);
    try {
      await authApi.removeAvatar();
      setAvatarUrl(null);
      updateUser({ avatarUrl: null });
    } catch {
      setAvatarError(t("common.error"));
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError(null);
    setVerifyLoading(true);
    try {
      // 현재 비밀번호로 no-op 프로필 업데이트를 시도해 검증한다
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
        displayName: form.displayName,
        country: form.country,
        phone: form.phone,
        developerMode,
      };
      // Google 전용 계정은 보낼 현재 비밀번호가 없다 (백엔드도 요구하지 않음)
      if (hasPassword) payload.currentPassword = currentPassword;
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

  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoinLoading(true);
    setJoinMsg(null);
    try {
      const res = await orgApi.join(code);
      setJoinCode("");
      setJoinMsg({
        type: "ok",
        text: res.data.message === "org.join.autoApproved"
          ? t("account.org.joinedAuto", { name: res.data.orgName })
          : t("account.org.joinRequested", { name: res.data.orgName }),
      });
      loadOrgs();
    } catch (err: unknown) {
      const code2 = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const map: Record<string, string> = {
        "org.join.notFound":      t("account.org.errNotFound"),
        "org.join.alreadyMember": t("account.org.errAlreadyMember"),
        "org.join.alreadyPending": t("account.org.errAlreadyPending"),
      };
      setJoinMsg({ type: "err", text: map[code2 ?? ""] ?? t("common.error") });
    } finally {
      setJoinLoading(false);
    }
  };

  const handleLeaveOrg = async (org: Org) => {
    if (!confirm(t("account.org.leaveConfirm", { name: org.name }))) return;
    try {
      await orgApi.leave(org.id);
      loadOrgs();
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(code === "org.leave.lastAdmin" ? t("account.org.errLastAdmin") : t("common.error"));
    }
  };

  const handleRevoke = async (conn: OAuthConnection) => {
    if (!confirm(t("account.connections.revokeConfirm", { name: conn.displayName }))) return;
    setRevokingId(conn.appId);
    try {
      await openoauthApi.revokeConnection(conn.appId);
      setConnections((prev) => prev.filter((c) => c.appId !== conn.appId));
    } catch {
      alert(t("common.error"));
    } finally {
      setRevokingId(null);
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
      if (code === "WRONG_PASSWORD")         setDeleteError(t("auth.deleteAccount.wrongPassword"));
      else if (code === "PASSWORD_REQUIRED") setDeleteError(t("auth.deleteAccount.passwordRequired"));
      else                                   setDeleteError(t("common.error"));
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── 비밀번호 확인 단계 ────────────────────────────────────────────────────
  if (step === "verify") {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.card}>
            <h1 className={styles.cardTitle}>{t("auth.profile.verifyTitle")}</h1>
            <p className={styles.cardHint}>{t("auth.profile.verifyDescription")}</p>
            {verifyError && <div className={s.alertError}>{verifyError}</div>}
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
      </div>
    );
  }

  // ── 계정 센터 ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t("account.title")}</h1>
          <p className={styles.pageSubtitle}>{t("account.subtitle")}</p>
        </header>

        {/* ── 프로필 ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t("account.profile.title")}</h2>
          <p className={styles.cardHint}>{t("account.profile.hint")}</p>

          {saveError && <div className={s.alertError}>{saveError}</div>}
          {saveSuccess && <div className={s.alertSuccess}>{t("auth.profile.saveSuccess")}</div>}

          <div className={styles.avatarRow}>
            <img src={avatarUrl ?? "/default-avatar.svg"} alt="" className={styles.avatarImg} />
            <div className={styles.avatarActions}>
              {avatarError && <span className={styles.errorText}>{avatarError}</span>}
              <div className={styles.avatarBtnRow}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarLoading}
                >
                  {avatarLoading ? t("common.loading") : t("auth.profile.avatarChangeBtn")}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    className={styles.btnQuiet}
                    onClick={handleAvatarRemove}
                    disabled={avatarLoading}
                  >
                    {t("auth.profile.avatarRemoveBtn")}
                  </button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarSelect}
                style={{ display: "none" }}
              />
              <p className={styles.hint}>{t("auth.profile.avatarHint")}</p>
            </div>
          </div>

          <form onSubmit={handleSave} noValidate>
            <div className={s.field}>
              <label className={s.label}>{t("auth.profile.displayNameLabel")}</label>
              <input className={s.input} type="text" value={form.displayName} onChange={setField("displayName")} />
            </div>
            <div className={s.field}>
              <label className={s.label}>{t("auth.profile.countryLabel")}</label>
              <select className={s.select} value={form.country} onChange={setField("country")}>
                {/* 거주 국가는 대한민국(KR)만 선택 가능 (GDPR 등 국외 규제 이슈 방지) */}
                {sortedCountries(lang).filter((c) => c.code === "KR").map((c) => (
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

            <div className={s.field}>
              <label className={rs.privacyLabel}>
                <input
                  type="checkbox"
                  className={rs.privacyCheckbox}
                  checked={developerMode}
                  onChange={(e) => setDeveloperMode(e.target.checked)}
                />
                <span>{t("auth.profile.developerModeLabel")}</span>
              </label>
              <p className={styles.hint} style={{ marginTop: 4, marginLeft: 23 }}>
                {t("auth.profile.developerModeHint")}
              </p>
            </div>

            {/* 비밀번호 변경 — Google 전용 계정에는 표시하지 않는다 */}
            {hasPassword && (
              <>
                <div className={styles.sectionDivider}>
                  <p className={styles.sectionLabel}>{t("auth.profile.changePasswordTitle")}</p>
                </div>
                <div className={s.field}>
                  <label className={s.label}>{t("auth.profile.newPasswordLabel")}</label>
                  <input className={s.input} type="password" value={form.newPassword} onChange={setField("newPassword")} autoComplete="new-password" />
                </div>
                <div className={s.field}>
                  <label className={s.label}>{t("auth.profile.confirmPasswordLabel")}</label>
                  <input className={s.input} type="password" value={form.confirmPassword} onChange={setField("confirmPassword")} autoComplete="new-password" />
                </div>
              </>
            )}

            <button className={s.btn} type="submit" disabled={saveLoading}>
              {saveLoading ? t("common.loading") : t("auth.profile.saveButton")}
            </button>
          </form>
        </section>

        {/* ── 연결된 서비스 ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t("account.connections.title")}</h2>
          <p className={styles.cardHint}>{t("account.connections.hint")}</p>

          {connLoading ? (
            <p className={styles.emptyText}>{t("common.loading")}</p>
          ) : connections.length === 0 ? (
            <p className={styles.emptyText}>{t("account.connections.empty")}</p>
          ) : (
            <ul className={styles.connList}>
              {connections.map((c) => (
                <li key={c.appId} className={styles.connItem}>
                  <div className={styles.connBody}>
                    <span className={styles.connName}>{c.displayName}</span>
                    <span className={styles.connUrl}>{c.mainSiteUrl}</span>
                    <div className={styles.connScopes}>
                      {c.scopes.map((sc) => (
                        <span key={sc} className={styles.scopeChip}>
                          {t(`account.connections.scope.${sc}`, sc)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className={styles.btnRevoke}
                    onClick={() => handleRevoke(c)}
                    disabled={revokingId === c.appId}
                  >
                    {revokingId === c.appId ? t("common.loading") : t("account.connections.revokeBtn")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 조직 ── */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>{t("account.org.title")}</h2>
          <p className={styles.cardHint}>{t("account.org.hint")}</p>

          {orgs.length === 0 && pendingJoins.length === 0 ? (
            <p className={styles.emptyText}>{t("account.org.empty")}</p>
          ) : (
            <ul className={styles.orgList}>
              {orgs.map((org) => (
                <li key={org.id} className={styles.orgItem}>
                  <span className={styles.orgCode}>{org.code}</span>
                  <span className={styles.orgName}>{org.name}</span>
                  <button className={styles.btnQuiet} onClick={() => handleLeaveOrg(org)}>
                    {t("account.org.leaveBtn")}
                  </button>
                </li>
              ))}
              {pendingJoins.map((p) => (
                <li key={`p${p.id}`} className={styles.orgItem}>
                  <span className={styles.orgCode}>{p.code}</span>
                  <span className={styles.orgName}>{p.name}</span>
                  <span className={styles.orgBadge}>{t("account.org.pendingBadge")}</span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleJoinOrg} className={styles.joinRow}>
            <input
              className={styles.joinInput}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t("account.org.codePlaceholder")}
              maxLength={4}
              aria-label={t("account.org.codePlaceholder")}
            />
            <button className={styles.btnPrimary} type="submit" disabled={joinLoading || !joinCode.trim()}>
              {joinLoading ? t("common.loading") : t("account.org.joinBtn")}
            </button>
          </form>
          {joinMsg && (
            <p className={joinMsg.type === "ok" ? styles.msgSuccess : styles.msgError}>{joinMsg.text}</p>
          )}
        </section>

        {/* ── 회원 탈퇴 ── */}
        <section className={styles.card}>
          {!deleteOpen ? (
            <button type="button" className={styles.dangerBtn} onClick={() => setDeleteOpen(true)}>
              {t("auth.deleteAccount.openBtn")}
            </button>
          ) : (
            <div className={styles.dangerBox}>
              <p className={styles.dangerTitle}>⚠ {t("auth.deleteAccount.title")}</p>
              <p className={styles.dangerText}>{t("auth.deleteAccount.warning")}</p>
              {deleteError && <div className={s.alertError} style={{ marginBottom: 12 }}>{deleteError}</div>}
              <form onSubmit={handleDelete} noValidate>
                {hasPassword && (
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
                  </div>
                )}
                <div className={styles.dangerActions}>
                  <button
                    type="button"
                    className={styles.btnCancelWide}
                    onClick={() => { setDeleteOpen(false); setDeletePassword(""); setDeleteError(null); }}
                  >
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className={styles.btnDangerWide} disabled={deleteLoading}>
                    {deleteLoading ? t("common.loading") : t("auth.deleteAccount.confirmBtn")}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
