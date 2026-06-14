import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  akademiyaTermsOfUse,
  akademiyaTermsSummaries,
  TERMS_OF_USE_VERSION,
} from "../../pages/privacy/privacyContent";
import client from "../../api/client";
import s from "./PrivacyPolicyModal.module.css";

interface Props {
  /** 사용자가 마지막으로 동의한 약관 버전 (없으면 0) */
  consentedVersion: number;
  onConsented: () => void;
}

export default function TermsOfUseModal({ consentedVersion, onConsented }: Props) {
  const { t } = useTranslation();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const terms = akademiyaTermsOfUse;

  const newSummaries = akademiyaTermsSummaries.filter((s) => s.to > consentedVersion);

  const handleConsent = async () => {
    if (!agreed) return;
    setLoading(true);
    setError("");
    try {
      await client.post("/terms/consent", { version: TERMS_OF_USE_VERSION });
      onConsented();
    } catch {
      setError(t("terms.consentError", "동의 처리 중 오류가 발생했습니다. 다시 시도해 주세요."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <div className={s.header}>
          <h2 className={s.title}>{t("terms.modalTitle", "이용약관 동의")}</h2>
          <p className={s.subtitle}>
            {newSummaries.length > 0
              ? t("terms.modalReconsentSubtitle", "이용약관이 개정되었습니다. 변경사항을 확인하고 다시 동의해 주세요.")
              : t("terms.modalSubtitle", "서비스 이용을 위해 이용약관에 동의해 주세요.")}
          </p>
          <span className={s.version}>v{terms.version} · {terms.effectiveDate}</span>
        </div>

        <div className={s.content}>
          {newSummaries.length > 0 ? (
            <>
              <p className={s.summaryIntro}>
                {consentedVersion > 0
                  ? t("terms.summaryIntro", `회원님이 동의하신 v${consentedVersion} 이후 변경된 주요 내용입니다.`)
                  : t("terms.summaryIntroNew", "주요 변경 내용입니다.")}
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
            <>
              <div className={s.preamble}>{terms.preamble}</div>
              {terms.sections.map((sec) => (
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
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("terms.viewFull", "이용약관 전문 보기 ↗")}
          </a>
          <label className={s.checkLabel}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>{t("terms.agreeLabel", "(필수) 이용약관을 읽었으며, 이에 동의합니다.")}</span>
          </label>
          <button
            className={s.btn}
            onClick={handleConsent}
            disabled={!agreed || loading}
          >
            {loading
              ? t("common.loading", "처리 중...")
              : t("terms.agreeBtn", "동의하고 계속하기")}
          </button>
        </div>
      </div>
    </div>
  );
}
