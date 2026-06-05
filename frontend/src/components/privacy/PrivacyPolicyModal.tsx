import { useState } from "react";
import { useTranslation } from "react-i18next";
import { akademiyaPrivacyPolicy, PRIVACY_POLICY_VERSION } from "../../pages/privacy/privacyContent";
import client from "../../api/client";
import s from "./PrivacyPolicyModal.module.css";

interface Props {
  onConsented: () => void;
}

export default function PrivacyPolicyModal({ onConsented }: Props) {
  const { t } = useTranslation();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const policy = akademiyaPrivacyPolicy;

  const handleConsent = async () => {
    if (!agreed) return;
    setLoading(true);
    setError("");
    try {
      await client.post("/privacy/consent", { version: PRIVACY_POLICY_VERSION });
      onConsented();
    } catch {
      setError(t("privacy.consentError", "동의 처리 중 오류가 발생했습니다. 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.header}>
          <h2 className={s.title}>{t("privacy.modalTitle", "개인정보 처리방침 동의")}</h2>
          <p className={s.subtitle}>
            {t("privacy.modalSubtitle", "서비스 이용을 위해 개인정보 처리방침에 동의해 주세요.")}
          </p>
          <span className={s.version}>v{policy.version} · {policy.effectiveDate}</span>
        </div>

        <div className={s.content}>
          <div className={s.preamble}>{policy.preamble}</div>
          {policy.sections.map((sec) => (
            <div key={sec.id} className={s.section}>
              <h3 className={s.sectionTitle}>{sec.title}</h3>
              <div className={s.sectionBody}>
                {sec.content.split("\n").map((line, i) => (
                  <p key={i} className={line === "" ? s.blank : s.line}>{line}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={s.footer}>
          {error && <p className={s.error}>{error}</p>}
          <label className={s.checkLabel}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              {t("privacy.agreeLabel", "개인정보 처리방침을 읽었으며, 이에 동의합니다.")}
            </span>
          </label>
          <button
            className={s.btn}
            onClick={handleConsent}
            disabled={!agreed || loading}
          >
            {loading
              ? t("common.loading", "처리 중...")
              : t("privacy.agreeBtn", "동의하고 계속하기")}
          </button>
        </div>
      </div>
    </div>
  );
}
