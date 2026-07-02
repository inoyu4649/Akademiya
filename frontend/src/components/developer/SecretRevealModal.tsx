import { useState } from "react";
import { useTranslation } from "react-i18next";
import s from "./SecretRevealModal.module.css";

interface Props {
  clientId: string;
  clientSecret: string;
  onClose: () => void;
}

/**
 * Client ID/Secret 최초(또는 재발급) 노출 모달 — Google Cloud Console과 동일한 UX.
 * Secret은 이 모달을 닫으면 다시 확인할 수 없고, 이후에는 재발급을 통해서만 새 값을 받을 수 있다.
 */
export default function SecretRevealModal({ clientId, clientSecret, onClose }: Props) {
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = useState<"id" | "secret" | null>(null);

  const copy = (field: "id" | "secret", value: string) => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <h2 className={s.title}>{t("developer.secretModal.title")}</h2>
        <p className={s.subtitle}>{t("developer.secretModal.warning")}</p>

        <div className={s.field}>
          <label className={s.label}>{t("developer.secretModal.clientIdLabel")}</label>
          <div className={s.valueRow}>
            <div className={s.value}>{clientId}</div>
            <button className={`${s.copyBtn} ${copiedField === "id" ? s.copied : ""}`} onClick={() => copy("id", clientId)}>
              {copiedField === "id" ? t("developer.secretModal.copied") : t("developer.secretModal.copy")}
            </button>
          </div>
        </div>

        <div className={s.field}>
          <label className={s.label}>{t("developer.secretModal.clientSecretLabel")}</label>
          <div className={s.valueRow}>
            <div className={s.value}>{clientSecret}</div>
            <button className={`${s.copyBtn} ${copiedField === "secret" ? s.copied : ""}`} onClick={() => copy("secret", clientSecret)}>
              {copiedField === "secret" ? t("developer.secretModal.copied") : t("developer.secretModal.copy")}
            </button>
          </div>
        </div>

        <button className={s.btn} onClick={onClose}>
          {t("developer.secretModal.closeBtn")}
        </button>
      </div>
    </div>
  );
}
