import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi, type QType, type SurveyQuestion } from "../../api/survey.api";
import styles from "./SurveyPage.module.css";

interface SubQuestionDraft {
  _key: string;
  type: QType;
  title: string;
  description: string;
  required: boolean;
  options: string[];
  triggerOptionIdx: number | null;
}

interface QuestionDraft {
  _key: string;
  type: QType;
  title: string;
  description: string;
  required: boolean;
  options: string[];
  children: SubQuestionDraft[];
}

let _keyCounter = 0;
const nextKey = () => String(++_keyCounter);

const defaultSubQuestion = (): SubQuestionDraft => ({
  _key: nextKey(), type: "text", title: "", description: "", required: false,
  options: ["", ""], triggerOptionIdx: null,
});

/** 서버에서 받은 SurveyQuestion 트리를 편집용 draft 형식으로 변환 */
function questionsToDrafts(serverQuestions: SurveyQuestion[]): QuestionDraft[] {
  return serverQuestions.map((q) => {
    const parentOptions = q.options?.map((o) => o.label) ?? [];
    return {
      _key: nextKey(),
      type: q.type,
      title: q.title,
      description: q.description ?? "",
      required: !!q.required,
      options: parentOptions.length >= 2 ? parentOptions : ["", ""],
      children: (q.children ?? []).map((sq) => {
        const triggerIdx =
          sq.trigger_option_id != null
            ? (q.options ?? []).findIndex((o) => o.id === sq.trigger_option_id)
            : null;
        return {
          _key: nextKey(),
          type: sq.type,
          title: sq.title,
          description: sq.description ?? "",
          required: !!sq.required,
          options:
            sq.options && sq.options.length >= 2
              ? sq.options.map((o) => o.label)
              : ["", ""],
          triggerOptionIdx: triggerIdx === -1 ? null : triggerIdx,
        };
      }),
    };
  });
}

export default function SurveyEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const surveyId = Number(id);

  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [allowAnon,     setAllowAnon]     = useState(false);
  const [allowEdit,     setAllowEdit]     = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [expiresAt,     setExpiresAt]     = useState("");
  const [questions, setQuestions]     = useState<QuestionDraft[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [responseCount, setResponseCount] = useState(0);
  const [scopeType, setScopeType]     = useState<"class" | "org" | "public">("class");

  useEffect(() => {
    surveyApi.detail(surveyId)
      .then(({ survey: s, questions: qs, isCreator, responseCount: rc }) => {
        if (!isCreator) { navigate(`/surveys/${surveyId}`); return; }
        setTitle(s.title);
        setDescription(s.description ?? "");
        setAllowAnon(!!s.allow_anonymous);
        setAllowEdit(!!s.allow_edit);
        setAllowMultiple(!!s.allow_multiple);
        setExpiresAt(s.expires_at ? s.expires_at.slice(0, 16) : "");
        setScopeType(s.scope_type);
        setQuestions(questionsToDrafts(qs));
        setResponseCount(rc ?? 0);
      })
      .catch(() => navigate("/surveys"))
      .finally(() => setLoading(false));
  }, [surveyId]);

  // ── 최상위 문항 조작 ─────────────────────────────────────────────────────

  function addQuestion() {
    setQuestions((prev) => [...prev, {
      _key: nextKey(), type: "single", title: "", description: "",
      required: false, options: ["", ""], children: [],
    }]);
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q._key !== key));
  }

  function updateQuestion(key: string, patch: Partial<Omit<QuestionDraft, "_key" | "children">>) {
    setQuestions((prev) => prev.map((q) => q._key === key ? { ...q, ...patch } : q));
  }

  function moveQuestion(key: string, dir: -1 | 1) {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q._key === key);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  function addOption(key: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === key ? { ...q, options: [...q.options, ""] } : q
    ));
  }
  function removeOption(key: string, oi: number) {
    setQuestions((prev) => prev.map((q) =>
      q._key === key ? { ...q, options: q.options.filter((_, i) => i !== oi) } : q
    ));
  }
  function updateOption(key: string, oi: number, val: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === key ? { ...q, options: q.options.map((o, i) => i === oi ? val : o) } : q
    ));
  }

  // ── 부속 질문 조작 ────────────────────────────────────────────────────────

  function addSubQuestion(parentKey: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey ? { ...q, children: [...q.children, defaultSubQuestion()] } : q
    ));
  }
  function removeSubQuestion(parentKey: string, subKey: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey ? { ...q, children: q.children.filter((s) => s._key !== subKey) } : q
    ));
  }
  function updateSubQuestion(parentKey: string, subKey: string, patch: Partial<Omit<SubQuestionDraft, "_key">>) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? { ...q, children: q.children.map((s) => s._key === subKey ? { ...s, ...patch } : s) }
        : q
    ));
  }
  function addSubOption(parentKey: string, subKey: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? { ...q, children: q.children.map((s) => s._key === subKey ? { ...s, options: [...s.options, ""] } : s) }
        : q
    ));
  }
  function removeSubOption(parentKey: string, subKey: string, oi: number) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? { ...q, children: q.children.map((s) => s._key === subKey ? { ...s, options: s.options.filter((_, i) => i !== oi) } : s) }
        : q
    ));
  }
  function updateSubOption(parentKey: string, subKey: string, oi: number, val: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? { ...q, children: q.children.map((s) => s._key === subKey ? { ...s, options: s.options.map((o, i) => i === oi ? val : o) } : s) }
        : q
    ));
  }

  // ── 제출 ─────────────────────────────────────────────────────────────────

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
      for (const sq of q.children) {
        if (!sq.title.trim()) { setError(t("survey.questionTitleRequired")); return; }
        if (["single", "multiple"].includes(sq.type) && sq.options.filter((o) => o.trim()).length < 2) {
          setError(t("survey.optionsRequired")); return;
        }
      }
    }

    if (responseCount > 0) {
      if (!confirm(t("survey.editWillDeleteResponses", { count: responseCount }))) return;
    }

    setSaving(true);
    try {
      await surveyApi.updateFull(surveyId, {
        title: title.trim(),
        description: description.trim() || undefined,
        allow_anonymous: scopeType === "public" ? true : allowAnon,
        allow_edit: allowEdit,
        allow_multiple: allowMultiple,
        expires_at: expiresAt || null,
        questions: questions.map((q) => ({
          type: q.type,
          title: q.title.trim(),
          description: q.description.trim() || undefined,
          required: q.required,
          options: ["single", "multiple"].includes(q.type) ? q.options.filter((o) => o.trim()) : undefined,
          sub_questions: q.children.map((sq) => ({
            type: sq.type,
            title: sq.title.trim(),
            description: sq.description.trim() || undefined,
            required: sq.required,
            options: ["single", "multiple"].includes(sq.type) ? sq.options.filter((o) => o.trim()) : undefined,
            trigger_option_idx: sq.triggerOptionIdx,
          })),
        })),
      });
      navigate(`/surveys/${surveyId}`);
    } catch {
      setError(t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={styles.page}><p className={styles.empty}>{t("common.loading")}</p></div>;

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate(`/surveys/${surveyId}`)}>
        ← {t("common.back")}
      </button>
      <h1 className={styles.pageTitle}>{t("survey.editTitle")}</h1>

      {responseCount > 0 && (
        <div className={styles.editWarning}>
          ⚠️ {t("survey.editHasResponses", { count: responseCount })}
        </div>
      )}

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

          <div className={styles.optionGroup}>
            {scopeType === "public" ? (
              <p className={styles.infoText}>🔒 {t("survey.publicAnonymousNote")}</p>
            ) : (
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={allowAnon} onChange={(e) => setAllowAnon(e.target.checked)} />
                {t("survey.allowAnonymous")}
              </label>
            )}
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={allowEdit} onChange={(e) => setAllowEdit(e.target.checked)} />
              {t("survey.allowEdit")}
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
              {t("survey.allowMultiple")}
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
            <div key={q._key} className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <span className={styles.questionNum}>{qi + 1}</span>
                <select
                  className={styles.typeSelect}
                  value={q.type}
                  onChange={(e) => updateQuestion(q._key, { type: e.target.value as QType })}
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
                    onChange={(e) => updateQuestion(q._key, { required: e.target.checked })}
                  />
                  {t("survey.required")}
                </label>

                <div className={styles.moveButtons}>
                  <button type="button" className={styles.moveBtn} onClick={() => moveQuestion(q._key, -1)} disabled={qi === 0} title={t("survey.moveUp")}>▲</button>
                  <button type="button" className={styles.moveBtn} onClick={() => moveQuestion(q._key, 1)} disabled={qi === questions.length - 1} title={t("survey.moveDown")}>▼</button>
                </div>

                {questions.length > 1 && (
                  <button type="button" className={styles.removeQBtn} onClick={() => removeQuestion(q._key)}>×</button>
                )}
              </div>

              <input
                className={styles.input}
                value={q.title}
                onChange={(e) => updateQuestion(q._key, { title: e.target.value })}
                placeholder={t("survey.questionTitlePlaceholder")}
                maxLength={500}
              />
              <textarea
                className={styles.textarea}
                rows={2}
                value={q.description}
                onChange={(e) => updateQuestion(q._key, { description: e.target.value })}
                placeholder={t("survey.questionDescPlaceholder")}
              />

              {["single", "multiple"].includes(q.type) && (
                <div className={styles.options}>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className={styles.optionRow2}>
                      <input
                        className={`${styles.input} ${styles.optionInput}`}
                        value={opt}
                        onChange={(e) => updateOption(q._key, oi, e.target.value)}
                        placeholder={`${t("survey.option")} ${oi + 1}`}
                        maxLength={300}
                      />
                      {q.options.length > 2 && (
                        <button type="button" className={styles.removeOptBtn} onClick={() => removeOption(q._key, oi)}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className={styles.addOptBtn} onClick={() => addOption(q._key)}>
                    + {t("survey.addOption")}
                  </button>
                </div>
              )}
              {q.type === "rating" && <p className={styles.ratingHint}>{t("survey.ratingHint")}</p>}

              {/* 부속 질문 */}
              {q.children.length > 0 && (
                <div className={styles.subQuestions}>
                  {q.children.map((sq, sqi) => (
                    <div key={sq._key} className={styles.subQuestionCard}>
                      <div className={styles.questionHeader}>
                        <span className={styles.subQuestionNum}>{qi + 1}-{sqi + 1}</span>
                        <select
                          className={styles.typeSelect}
                          value={sq.type}
                          onChange={(e) => updateSubQuestion(q._key, sq._key, { type: e.target.value as QType })}
                        >
                          <option value="single">{t("survey.typeSingle")}</option>
                          <option value="multiple">{t("survey.typeMultiple")}</option>
                          <option value="text">{t("survey.typeText")}</option>
                          <option value="rating">{t("survey.typeRating")}</option>
                        </select>
                        <label className={styles.checkLabelSmall}>
                          <input
                            type="checkbox"
                            checked={sq.required}
                            onChange={(e) => updateSubQuestion(q._key, sq._key, { required: e.target.checked })}
                          />
                          {t("survey.required")}
                        </label>
                        {["single", "multiple"].includes(q.type) && q.options.some((o) => o.trim()) && (
                          <select
                            className={styles.typeSelect}
                            value={sq.triggerOptionIdx ?? "always"}
                            onChange={(e) => updateSubQuestion(q._key, sq._key, {
                              triggerOptionIdx: e.target.value === "always" ? null : Number(e.target.value),
                            })}
                          >
                            <option value="always">{t("survey.triggerAlways")}</option>
                            {q.options.map((opt, oi) =>
                              opt.trim() ? (
                                <option key={oi} value={oi}>
                                  {t("survey.triggerWhen", { option: opt.trim() })}
                                </option>
                              ) : null
                            )}
                          </select>
                        )}
                        <button type="button" className={styles.removeQBtn} onClick={() => removeSubQuestion(q._key, sq._key)}>×</button>
                      </div>

                      <input
                        className={styles.input}
                        value={sq.title}
                        onChange={(e) => updateSubQuestion(q._key, sq._key, { title: e.target.value })}
                        placeholder={t("survey.questionTitlePlaceholder")}
                        maxLength={500}
                      />
                      <textarea
                        className={styles.textarea}
                        rows={2}
                        value={sq.description}
                        onChange={(e) => updateSubQuestion(q._key, sq._key, { description: e.target.value })}
                        placeholder={t("survey.questionDescPlaceholder")}
                      />

                      {["single", "multiple"].includes(sq.type) && (
                        <div className={styles.options}>
                          {sq.options.map((opt, oi) => (
                            <div key={oi} className={styles.optionRow2}>
                              <input
                                className={`${styles.input} ${styles.optionInput}`}
                                value={opt}
                                onChange={(e) => updateSubOption(q._key, sq._key, oi, e.target.value)}
                                placeholder={`${t("survey.option")} ${oi + 1}`}
                                maxLength={300}
                              />
                              {sq.options.length > 2 && (
                                <button type="button" className={styles.removeOptBtn} onClick={() => removeSubOption(q._key, sq._key, oi)}>×</button>
                              )}
                            </div>
                          ))}
                          <button type="button" className={styles.addOptBtn} onClick={() => addSubOption(q._key, sq._key)}>
                            + {t("survey.addOption")}
                          </button>
                        </div>
                      )}
                      {sq.type === "rating" && <p className={styles.ratingHint}>{t("survey.ratingHint")}</p>}
                    </div>
                  ))}
                </div>
              )}

              <button type="button" className={styles.addSubQBtn} onClick={() => addSubQuestion(q._key)}>
                + {t("survey.addSubQuestion")}
              </button>
            </div>
          ))}

          <button type="button" className={styles.addQBtn} onClick={addQuestion}>
            + {t("survey.addQuestion")}
          </button>
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}

        <div className={styles.formActions}>
          <button type="button" className={styles.cancelBtn} onClick={() => navigate(`/surveys/${surveyId}`)}>
            {t("common.cancel")}
          </button>
          <button type="submit" className={styles.submitBtn} disabled={saving}>
            {saving ? t("common.loading") : t("survey.saveEdit")}
          </button>
        </div>
      </form>
    </div>
  );
}
