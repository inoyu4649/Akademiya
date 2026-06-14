import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  akademiyaPrivacyPolicy,
  akademiyaPrivacySummaries,
  PRIVACY_POLICY_VERSION,
  INTL_TRANSFER_VERSION,
} from "../../pages/privacy/privacyContent";
import client from "../../api/client";
import s from "./PrivacyPolicyModal.module.css";

interface Props {
  /** 사용자가 마지막으로 동의한 처리방침 버전 (없으면 0) */
  consentedVersion: number;
  onConsented: () => void;
}

export default function PrivacyPolicyModal({ consentedVersion, onConsented }: Props) {
  const { t } = useTranslation();
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [intlAgreed, setIntlAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const policy = akademiyaPrivacyPolicy;

  // 마지막 동의 버전 이후의 변경 요약만 누적 표시 (예: v1 동의자 → v1→v2, v2→v3 ...)
  const newSummaries = akademiyaPrivacySummaries.filter((s) => s.to > consentedVersion);

  const handleConsent = async () => {
    if (!privacyAgreed || !intlAgreed) return;
    setLoading(true);
    setError("");
    try {
      await Promise.all([
        client.post("/privacy/consent", { version: PRIVACY_POLICY_VERSION }),
        client.post("/intl-transfer/consent", { version: INTL_TRANSFER_VERSION }),
      ]);
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
            {newSummaries.length > 0
              ? t("privacy.modalReconsentSubtitle", "개인정보 처리방침이 개정되었습니다. 변경사항을 확인하고 다시 동의해 주세요.")
              : t("privacy.modalSubtitle", "서비스 이용을 위해 개인정보 처리방침에 동의해 주세요.")}
          </p>
          <span className={s.version}>v{policy.version} · {policy.effectiveDate}</span>
        </div>

        <div className={s.content}>
          {newSummaries.length > 0 ? (
            <>
              <p className={s.summaryIntro}>
                {consentedVersion > 0
                  ? t("privacy.summaryIntro", `회원님이 동의하신 v${consentedVersion} 이후 변경된 주요 내용입니다.`)
                  : t("privacy.summaryIntroNew", "주요 변경 내용입니다.")}
              </p>
              {newSummaries.map((sum) => (
                <div key={sum.to} className={s.section}>
                  <h3 className={s.sectionTitle}>
                    v{sum.to - 1} → v{sum.to} 변경사항 ({sum.effectiveDate})
                  </h3>
                  <ul className={s.changeList}>
                    {sum.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          ) : (
            // 변경 요약이 없으면(최초 동의 등) 전문 표시 (폴백)
            <>
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
            </>
          )}
        </div>

        <div className={s.footer}>
          {error && <p className={s.error}>{error}</p>}
          <a
            className={s.fullLink}
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("privacy.viewFull", "개인정보 처리방침 전문 보기 ↗")}
          </a>
          <div className={s.checkGroup}>
            <label className={s.checkLabel}>
              <input
                type="checkbox"
                className={s.checkbox}
                checked={privacyAgreed}
                onChange={(e) => setPrivacyAgreed(e.target.checked)}
              />
              <span>{t("privacy.agreeLabel", "(필수) 개인정보 처리방침을 읽었으며, 이에 동의합니다.")}</span>
            </label>
            <label className={s.checkLabel}>
              <input
                type="checkbox"
                className={s.checkbox}
                checked={intlAgreed}
                onChange={(e) => setIntlAgreed(e.target.checked)}
              />
              <span>{t("privacy.intlAgreeLabel", "(필수) 개인정보의 국외 이전(Google LLC, 미국)에 동의합니다.")}</span>
            </label>
          </div>
          <button
            className={s.btn}
            onClick={handleConsent}
            disabled={!privacyAgreed || !intlAgreed || loading}
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
