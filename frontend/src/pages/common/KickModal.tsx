import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./KickModal.module.css";

interface Props {
  targetName: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export default function KickModal({ targetName, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!reason.trim()) {
      setError(t("kick.reasonRequired"));
      return;
    }
    setLoading(true);
    try {
      await onSubmit(reason.trim());
    } catch {
      setError(t("kick.serverError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("kick.modalTitle")}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.target}>
          {t("kick.targetLabel")}: <strong>{targetName}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>{t("kick.reasonLabel")}</label>
            <textarea
              className={styles.textarea}
              placeholder={t("kick.reasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              maxLength={1000}
            />
            <p className={styles.charCount}>{reason.length} / 1000</p>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={loading}>
              {loading ? t("common.loading") : t("kick.submitBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
