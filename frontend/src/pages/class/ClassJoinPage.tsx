import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { classApi } from "../../api/class.api";
import styles from "./ClassJoinPage.module.css";

// 8칸 복합 코드 입력 (ORGCODE 4자리 영문 + CLASSCODE 4자리 숫자)
function CompositeCodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = value.padEnd(8, "").split("").slice(0, 8);

  // i < 4: 영문, i >= 4: 숫자
  function isValid(i: number, char: string) {
    return i < 4 ? /^[A-Z]$/.test(char) : /^[0-9]$/.test(char);
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (cells[i]) {
        const next = [...cells];
        next[i] = "";
        onChange(next.join(""));
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        const next = [...cells];
        next[i - 1] = "";
        onChange(next.join(""));
      }
      e.preventDefault();
    }
  }

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const char = e.target.value.slice(-1).toUpperCase();
    if (!isValid(i, char)) return;
    const next = [...cells];
    next[i] = char;
    onChange(next.join(""));
    if (i < 7) refs.current[i + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const raw = e.clipboardData.getData("text").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    // 붙여넣기: 앞 4자는 영문만, 뒤 4자는 숫자만 필터
    const orgPart   = raw.slice(0, 8).replace(/[^A-Z]/g, "").slice(0, 4);
    const classPart = raw.slice(0, 8).replace(/[^0-9]/g, "").slice(0, 4);
    const merged = (orgPart + classPart).padEnd(8, "").slice(0, 8);
    onChange(merged);
    refs.current[Math.min(orgPart.length + classPart.length, 7)]?.focus();
    e.preventDefault();
  }

  return (
    <div className={styles.codeWrap}>
      {/* Org code (4 cells, 영문) */}
      <div className={styles.codeGroup}>
        {Array.from({ length: 4 }).map((_, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            className={styles.codeCell}
            type="text"
            maxLength={1}
            value={cells[i] || ""}
            onChange={(e) => handleChange(i, e)}
            onKeyDown={(e) => handleKey(i, e)}
            onPaste={handlePaste}
          />
        ))}
      </div>
      <span className={styles.codeDivider}>·</span>
      {/* Class code (4 cells, 숫자) */}
      <div className={styles.codeGroup}>
        {Array.from({ length: 4 }).map((_, j) => {
          const i = 4 + j;
          return (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              className={styles.codeCell}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={cells[i] || ""}
              onChange={(e) => handleChange(i, e)}
              onKeyDown={(e) => handleKey(i, e)}
              onPaste={handlePaste}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function ClassJoinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const clean = code.replace(/\s/g, "");
    if (clean.length !== 8) {
      setError(t("class.join.codeInvalid"));
      return;
    }

    setLoading(true);
    try {
      const res = await classApi.join(clean);
      setSuccess(res.data.className);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg === "class.join.orgNotFound")   setError(t("class.join.orgNotFound"));
      else if (msg === "class.join.notFound") setError(t("class.join.notFound"));
      else if (msg === "class.join.alreadyMember") setError(t("class.join.alreadyMember"));
      else if (msg === "class.join.alreadyPending") setError(t("class.join.alreadyPending"));
      else if (msg === "class.join.notOrgMember") setError(t("class.join.notOrgMember"));
      else setError(t("class.join.serverError"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.successBox}>
          <p>{t("class.join.success", { className: success })}</p>
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

      <h1 className={styles.title}>{t("class.join.title")}</h1>
      <p className={styles.desc}>{t("class.join.description")}</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <CompositeCodeInput value={code} onChange={setCode} />
        {error && <p className={styles.error}>{error}</p>}
        <button
          type="submit"
          className={styles.btnPrimary}
          disabled={loading || code.replace(/\s/g, "").length !== 8}
        >
          {loading ? t("common.loading") : t("class.join.submitBtn")}
        </button>
      </form>
    </div>
  );
}
