import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { orgApi } from "../../api/org.api";
import CodeInput from "../../components/common/CodeInput";
import styles from "./OrgJoinPage.module.css";

export default function OrgJoinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 4) return;
    setError("");
    setLoading(true);

    try {
      const res = await orgApi.join(code);
      // 학교 이메일 도메인 일치 → 즉시 가입 / 아니면 관리자 승인 대기
      if (res.data?.message === "org.join.autoApproved") {
        setSuccess(t("org.join.autoApproved"));
      } else {
        setSuccess(t("org.join.success"));
      }
      setTimeout(() => navigate("/"), 2500);
    } catch (err: any) {
      const errCode = err?.response?.data?.error ?? "";
      if (errCode === "org.join.notFound") setError(t("org.join.notFound"));
      else if (errCode === "org.join.alreadyMember") setError(t("org.join.alreadyMember"));
      else if (errCode === "org.join.alreadyPending") setError(t("org.join.alreadyPending"));
      else setError(t("org.join.serverError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t("org.join.title")}</h1>
        <p className={styles.description}>{t("org.join.description")}</p>

        {success ? (
          <div className={styles.successBox}>{success}</div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.errorBox}>{error}</div>}

            <div className={styles.codeWrapper}>
              <CodeInput value={code} onChange={setCode} disabled={loading} length={4} alphaOnly />
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
                disabled={loading || code.length !== 4}
              >
                {loading ? t("common.loading") : t("org.join.submitBtn")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
