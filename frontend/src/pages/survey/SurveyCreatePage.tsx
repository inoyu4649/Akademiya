import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi } from "../../api/survey.api";
import { classApi } from "../../api/class.api";
import { orgApi } from "../../api/org.api";
import styles from "./SurveyPage.module.css";

type QType = "single" | "multiple" | "text" | "rating";

interface QuestionDraft {
  type: QType;
  title: string;
  required: boolean;
  options: string[];
}

const defaultQuestion = (): QuestionDraft => ({
  type: "single",
  title: "",
  required: false,
  options: ["", ""],
});

export default function SurveyCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [scopeType, setScopeType]     = useState<"class" | "org" | "public">("class");
  const [scopeId, setScopeId]         = useState<number | null>(null);
  const [allowAnon, setAllowAnon]     = useState(false);
  const [expiresAt, setExpiresAt]     = useState("");
  const [questions, setQuestions]     = useState<QuestionDraft[]>([defaultQuestion()]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // 반/조직 선택지
  const [classes, setClasses] = useState<Array<{ id: number; name: string; permission: number }>>([]);
  const [orgs,    setOrgs]    = useState<Array<{ id: number; name: string; permission: number }>>([]);

  useEffect(() => {
    classApi.my().then((r) => {
      const leaders = r.data.classes.filter((c) => (c.permission ?? 0) >= 1);
      setClasses(leaders.map((c) => ({ id: c.id, name: c.name, permission: c.permission ?? 0 })));
    }).catch(() => {});
    orgApi.my().then((r) => {
      const admins = r.data.orgs.filter((o: any) => (o.permission ?? 0) >= 3);
      setOrgs(admins.map((o: any) => ({ id: o.id, name: o.name, permission: o.permission })));
    }).catch(() => {});
  }, []);

  // scopeType 변경 시 첫 번째 항목으로 초기화
  useEffect(() => {
    if (scopeType === "class" && classes.length)    setScopeId(classes[0].id);
    else if (scopeType === "org" && orgs.length)    setScopeId(orgs[0].id);
    else if (scopeType === "public")                setScopeId(null);
  }, [scopeType, classes, orgs]);

  function addQuestion() {
    setQuestions((prev) => [...prev, defaultQuestion()]);
  }

  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateQuestion(i: number, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  }

  function addOption(qi: number) {
    setQuestions((prev) => prev.map((q, idx) =>
      idx === qi ? { ...q, options: [...q.options, ""] } : q
    ));
  }

  function removeOption(qi: number, oi: number) {
    setQuestions((prev) => prev.map((q, idx) =>
      idx === qi ? { ...q, options: q.options.filter((_, i) => i !== oi) } : q
    ));
  }

  function updateOption(qi: number, oi: number, val: string) {
    setQuestions((prev) => prev.map((q, idx) =>
      idx === qi
        ? { ...q, options: q.options.map((o, i) => i === oi ? val : o) }
        : q
    ));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) { setError(t("survey.titleRequired")); return; }
    if (questions.length === 0) { setError(t("survey.questionsRequired")); return; }
    for (const q of questions) {
      if (!q.title.trim()) { setError(t("survey.questionTitleRequired")); return; }
      if (["single", "multiple"].includes(q.type) && q.options.filter((o) => o.trim()).length < 2) {
        setError(t("survey.optionsRequired")); return;
      }
    }
    if ((scopeType === "class" || scopeType === "org") && !scopeId) {
      setError(t("survey.scopeRequired")); return;
    }

    setLoading(true);
    try {
      const res = await surveyApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        scope_type: scopeType,
        scope_id: scopeId,
        allow_anonymous: allowAnon,
        expires_at: expiresAt || null,
        questions: questions.map((q) => ({
          type: q.type,
          title: q.title.trim(),
          required: q.required,
          options: ["single", "multiple"].includes(q.type)
            ? q.options.filter((o) => o.trim())
            : undefined,
        })),
      });
      navigate(`/surveys/${res.data.surveyId}`);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  const scopeOptions = scopeType === "class" ? classes : scopeType === "org" ? orgs : [];

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate("/surveys")}>
        ← {t("common.back")}
      </button>
      <h1 className={styles.pageTitle}>{t("survey.createTitle")}</h1>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* 기본 정보 */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("survey.basicInfo")}</h2>
          <label className={styles.label}>{t("survey.titleLabel")}</label>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("survey.titlePlaceholder")}
            maxLength={300}
          />

          <label className={styles.label}>{t("survey.descLabel")}</label>
          <textarea
            className={styles.textarea}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("survey.descPlaceholder")}
          />

          {/* 배포 대상 */}
          <label className={styles.label}>{t("survey.scopeLabel")}</label>
          <div className={styles.scopeRow}>
            {(["class", "org", "public"] as const).map((st) => (
              <label key={st} className={styles.radioLabel}>
                <input
                  type="radio"
                  value={st}
                  checked={scopeType === st}
                  onChange={() => setScopeType(st)}
                />
                {t(`survey.scope_${st}`)}
              </label>
            ))}
          </div>

          {scopeType !== "public" && (
            <>
              <label className={styles.label}>
                {scopeType === "class" ? t("survey.selectClass") : t("survey.selectOrg")}
              </label>
              {scopeOptions.length === 0 ? (
                <p className={styles.infoText}>
                  {scopeType === "class" ? t("survey.noLeaderClass") : t("survey.noAdminOrg")}
                </p>
              ) : (
                <select
                  className={styles.input}
                  value={scopeId ?? ""}
                  onChange={(e) => setScopeId(Number(e.target.value))}
                >
                  {scopeOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </>
          )}

          {/* 옵션 */}
          <div className={styles.optionRow}>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={allowAnon}
                onChange={(e) => setAllowAnon(e.target.checked)}
              />
              {t("survey.allowAnonymous")}
            </label>
          </div>

          <label className={styles.label}>{t("survey.expiresAt")}</label>
          <input
            className={styles.input}
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <p className={styles.hint}>{t("survey.expiresAtHint")}</p>
        </div>

        {/* 문항 */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("survey.questions")}</h2>
          {questions.map((q, qi) => (
            <div key={qi} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <span className={styles.questionNum}>{qi + 1}</span>
                <select
                  className={styles.typeSelect}
                  value={q.type}
                  onChange={(e) => updateQuestion(qi, { type: e.target.value as QType })}
                >
                  <option value="single">{t("survey.typeSingle")}</option>
                  <option value="multiple">{t("survey.typeMultiple")}</option>
                  <option value="text">{t("survey.typeText")}</option>
                  <option value="rating">{t("survey.typeRating")}</option>
                </select>
                <label className={styles.checkLabelSmall}>
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(qi, { required: e.target.checked })}
                  />
                  {t("survey.required")}
                </label>
                {questions.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeQBtn}
                    onClick={() => removeQuestion(qi)}
                  >
                    ×
                  </button>
                )}
              </div>

              <input
                className={styles.input}
                value={q.title}
                onChange={(e) => updateQuestion(qi, { title: e.target.value })}
                placeholder={t("survey.questionTitlePlaceholder")}
                maxLength={500}
              />

              {["single", "multiple"].includes(q.type) && (
                <div className={styles.options}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className={styles.optionRow2}>
                      <input
                        className={`${styles.input} ${styles.optionInput}`}
                        value={opt}
                        onChange={(e) => updateOption(qi, oi, e.target.value)}
                        placeholder={`${t("survey.option")} ${oi + 1}`}
                        maxLength={300}
                      />
                      {q.options.length > 2 && (
                        <button
                          type="button"
                          className={styles.removeOptBtn}
                          onClick={() => removeOption(qi, oi)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.addOptBtn}
                    onClick={() => addOption(qi)}
                  >
                    + {t("survey.addOption")}
                  </button>
                </div>
              )}

              {q.type === "rating" && (
                <p className={styles.ratingHint}>{t("survey.ratingHint")}</p>
              )}
            </div>
          ))}

          <button type="button" className={styles.addQBtn} onClick={addQuestion}>
            + {t("survey.addQuestion")}
          </button>
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.formActions}>
          <button type="button" className={styles.cancelBtn} onClick={() => navigate("/surveys")}>
            {t("common.cancel")}
          </button>
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? t("common.loading") : t("survey.submitCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}
