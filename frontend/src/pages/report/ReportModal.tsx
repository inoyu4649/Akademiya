import { useState } from "react";
import { useTranslation } from "react-i18next";
import { reportApi } from "../../api/report.api";
import styles from "./ReportModal.module.css";

interface Props {
  reportedId: number;
  reportedName: string;
  classId?: number;
  orgId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReportModal({ reportedId, reportedName, classId, orgId, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!reason.trim()) {
      setError(t("report.reasonRequired"));
      return;
    }
    setLoading(true);
    try {
      await reportApi.submit({
        reported_id: reportedId,
        org_id: orgId,
        ...(classId ? { class_id: classId } : {}),
        reason: reason.trim(),
      });
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg === "report.cannotReportSelf") setError(t("report.cannotReportSelf"));
      else setError(t("report.serverError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t("report.modalTitle")}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.target}>
          {t("report.targetLabel")}: <strong>{reportedName}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>{t("report.reasonLabel")}</label>
            <textarea
              className={styles.textarea}
              placeholder={t("report.reasonPlaceholder")}
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
              {loading ? t("common.loading") : t("report.submitBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
