import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { classApi } from "../../api/class.api";
import { orgApi, type Org } from "../../api/org.api";
import styles from "./ClassApplyPage.module.css";

export default function ClassApplyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    orgApi.my().then((res) => setOrgs(res.data.orgs)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!orgId) { setError(t("class.apply.orgRequired")); return; }
    if (!name.trim()) { setError(t("class.apply.nameRequired")); return; }
    const cleanCode = code.trim();
    if (!/^[0-9]{4}$/.test(cleanCode)) {
      setError(t("class.apply.codeInvalid"));
      return;
    }

    setLoading(true);
    try {
      await classApi.apply({ org_id: Number(orgId), name: name.trim(), code: cleanCode });
      setSuccess(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg === "class.apply.codeDuplicate")    setError(t("class.apply.codeDuplicate"));
      else if (msg === "class.apply.notOrgMember") setError(t("class.apply.notOrgMember"));
      else setError(t("class.apply.serverError"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.successBox}>
          <p>{t("class.apply.success")}</p>
          <button className={styles.btnPrimary} onClick={() => navigate("/classes")}>
            {t("class.list.title")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>
        ← {t("common.back")}
      </button>

      <h1 className={styles.title}>{t("class.apply.title")}</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        {/* 조직 선택 */}
        <div className={styles.field}>
          <label className={styles.label}>{t("class.apply.orgLabel")}</label>
          {orgs.length === 0 ? (
            <p className={styles.hint}>{t("class.apply.noOrgs")}</p>
          ) : (
            <select
              className={styles.input}
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              <option value="">{t("class.apply.orgPlaceholder")}</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  [{o.code}] {o.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 반 이름 */}
        <div className={styles.field}>
          <label className={styles.label}>{t("class.apply.nameLabel")}</label>
          <input
            className={styles.input}
            type="text"
            placeholder={t("class.apply.namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* 4자리 코드 */}
        <div className={styles.field}>
          <label className={styles.label}>{t("class.apply.codeLabel")}</label>
          <input
            className={styles.input}
            type="text"
            placeholder={t("class.apply.codePlaceholder")}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            maxLength={4}
          />
          <p className={styles.hint}>{t("class.apply.codeHint")}</p>
          {orgId && code.trim().length === 4 && (
            <p className={styles.preview}>
              {t("class.apply.compositePreview")}:{" "}
              <span className={styles.previewCode}>
                {orgs.find((o) => o.id === Number(orgId))?.code ?? "????"}
                {code.trim().toUpperCase()}
              </span>
            </p>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={loading || orgs.length === 0}
        >
          {loading ? t("common.loading") : t("class.apply.submitBtn")}
        </button>
      </form>
    </div>
  );
}
