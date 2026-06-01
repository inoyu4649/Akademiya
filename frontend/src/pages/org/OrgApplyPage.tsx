import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { orgApi } from "../../api/org.api";
import styles from "./OrgApplyPage.module.css";

const TIMEZONES = [
  "Asia/Seoul", "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore",
  "Asia/Kolkata", "Asia/Dubai", "Asia/Bangkok", "Asia/Karachi",
  "Asia/Dhaka", "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Europe/Moscow", "Africa/Cairo", "America/New_York", "America/Chicago",
  "America/Denver", "America/Los_Angeles", "America/Toronto",
  "America/Sao_Paulo", "Pacific/Auckland", "Pacific/Sydney",
  "Pacific/Honolulu", "UTC",
];

export default function OrgApplyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [googleDomain, setGoogleDomain] = useState("");
  const [timezone, setTimezone] = useState("Asia/Seoul");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanCode = code.trim().toUpperCase();
    if (!name.trim()) {
      setError(t("org.apply.nameRequired"));
      return;
    }
    if (!/^[A-Z]{4}$/.test(cleanCode)) {
      setError(t("org.apply.codeInvalid"));
      return;
    }

    setLoading(true);
    try {
      await orgApi.apply({
        name: name.trim(),
        code: cleanCode,
        google_domain: googleDomain.trim() || undefined,
        timezone,
      });
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      const code = err?.response?.data?.error ?? "";
      if (code === "org.apply.codeDuplicate") setError(t("org.apply.codeDuplicate"));
      else if (code === "org.apply.alreadyPending") setError(t("org.apply.alreadyPending"));
      else if (code === "org.apply.codeInvalid") setError(t("org.apply.codeInvalid"));
      else setError(t("org.apply.serverError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t("org.apply.title")}</h1>

        {success ? (
          <div className={styles.successBox}>{t("org.apply.success")}</div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.field}>
              <label className={styles.label}>{t("org.apply.nameLabel")}</label>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("org.apply.namePlaceholder")}
                maxLength={200}
                disabled={loading}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t("org.apply.codeLabel")}</label>
              <input
                className={`${styles.input} ${styles.codeInput}`}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
                placeholder={t("org.apply.codePlaceholder")}
                maxLength={4}
                disabled={loading}
                spellCheck={false}
              />
              <span className={styles.hint}>{t("org.apply.codeHint")}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t("org.apply.domainLabel")}</label>
              <input
                className={styles.input}
                value={googleDomain}
                onChange={(e) => setGoogleDomain(e.target.value)}
                placeholder={t("org.apply.domainPlaceholder")}
                maxLength={255}
                disabled={loading}
              />
              <span className={styles.hint}>{t("org.apply.domainHint")}</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>{t("org.apply.timezoneLabel")}</label>
              <select
                className={styles.select}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={loading}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => navigate("/")}
                disabled={loading}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className={styles.btnSubmit}
                disabled={loading || code.length !== 4 || !name.trim()}
              >
                {loading ? t("common.loading") : t("org.apply.submitBtn")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
