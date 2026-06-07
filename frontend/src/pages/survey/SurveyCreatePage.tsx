import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surveyApi, type QType } from "../../api/survey.api";
import { classApi } from "../../api/class.api";
import { orgApi } from "../../api/org.api";
import styles from "./SurveyPage.module.css";

interface SubQuestionDraft {
  _key: string;
  type: QType;
  title: string;
  description: string;
  required: boolean;
  has_other: boolean;
  options: string[];
  triggerOptionIdx: number | null;
  triggerRating: string; // "always" | "1"~"5" | "1-2" | "1-3" | "3-5" | "4-5"
}

function serializeRatingTrigger(v: string): { min: number | null; max: number | null } {
  if (v === "always") return { min: null, max: null };
  if (v.includes("-")) {
    const [a, b] = v.split("-").map(Number);
    return { min: a, max: b };
  }
  const n = Number(v);
  return { min: n, max: n };
}

interface QuestionDraft {
  _key: string;
  type: QType;
  title: string;
  description: string;
  required: boolean;
  has_other: boolean;
  options: string[];
  children: SubQuestionDraft[];
}

let _keyCounter = 0;
const nextKey = () => String(++_keyCounter);

const defaultQuestion = (): QuestionDraft => ({
  _key: nextKey(),
  type: "single",
  title: "",
  description: "",
  required: false,
  has_other: false,
  options: ["", ""],
  children: [],
});

const defaultSubQuestion = (): SubQuestionDraft => ({
  _key: nextKey(),
  type: "text",
  title: "",
  description: "",
  required: false,
  has_other: false,
  options: ["", ""],
  triggerOptionIdx: null,
  triggerRating: "always",
});

export default function SurveyCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [scopeType, setScopeType]     = useState<"class" | "org" | "public">("class");
  const [scopeId, setScopeId]         = useState<number | null>(null);
  const [allowAnon,     setAllowAnon]     = useState(false);
  const [allowEdit,     setAllowEdit]     = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [expiresAt,     setExpiresAt]     = useState("");
  const [questions, setQuestions]     = useState<QuestionDraft[]>([defaultQuestion()]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

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

  useEffect(() => {
    if (scopeType === "class" && classes.length)    setScopeId(classes[0].id);
    else if (scopeType === "org" && orgs.length)    setScopeId(orgs[0].id);
    else if (scopeType === "public")                setScopeId(null);
  }, [scopeType, classes, orgs]);

  // ── 최상위 문항 조작 ─────────────────────────────────────────────────────

  function addQuestion() {
    setQuestions((prev) => [...prev, defaultQuestion()]);
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q._key !== key));
  }

  function updateQuestion(key: string, patch: Partial<Omit<QuestionDraft, "_key" | "children">>) {
    setQuestions((prev) => prev.map((q) =>
      q._key === key ? { ...q, ...patch } : q
    ));
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
      q._key === parentKey
        ? { ...q, children: [...q.children, defaultSubQuestion()] }
        : q
    ));
  }

  function removeSubQuestion(parentKey: string, subKey: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? { ...q, children: q.children.filter((s) => s._key !== subKey) }
        : q
    ));
  }

  function updateSubQuestion(parentKey: string, subKey: string, patch: Partial<Omit<SubQuestionDraft, "_key">>) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? {
            ...q,
            children: q.children.map((s) =>
              s._key === subKey ? { ...s, ...patch } : s
            ),
          }
        : q
    ));
  }

  function addSubOption(parentKey: string, subKey: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? {
            ...q,
            children: q.children.map((s) =>
              s._key === subKey ? { ...s, options: [...s.options, ""] } : s
            ),
          }
        : q
    ));
  }

  function removeSubOption(parentKey: string, subKey: string, oi: number) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? {
            ...q,
            children: q.children.map((s) =>
              s._key === subKey ? { ...s, options: s.options.filter((_, i) => i !== oi) } : s
            ),
          }
        : q
    ));
  }

  function updateSubOption(parentKey: string, subKey: string, oi: number, val: string) {
    setQuestions((prev) => prev.map((q) =>
      q._key === parentKey
        ? {
            ...q,
            children: q.children.map((s) =>
              s._key === subKey
                ? { ...s, options: s.options.map((o, i) => i === oi ? val : o) }
                : s
            ),
          }
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
        allow_anonymous: scopeType === "public" ? true : allowAnon,
        allow_edit: allowEdit,
        allow_multiple: allowMultiple,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        questions: questions.map((q) => ({
          type: q.type,
          title: q.title.trim(),
          description: q.description.trim() || undefined,
          required: q.required,
          has_other: ["single", "multiple"].includes(q.type) ? q.has_other : false,
          options: ["single", "multiple"].includes(q.type) ? q.options.filter((o) => o.trim()) : undefined,
          sub_questions: q.children.map((sq) => {
            const { min: rMin, max: rMax } = q.type === "rating"
              ? serializeRatingTrigger(sq.triggerRating)
              : { min: null, max: null };
            return {
              type: sq.type,
              title: sq.title.trim(),
              description: sq.description.trim() || undefined,
              required: sq.required,
              has_other: ["single", "multiple"].includes(sq.type) ? sq.has_other : false,
              options: ["single", "multiple"].includes(sq.type) ? sq.options.filter((o) => o.trim()) : undefined,
              trigger_option_idx: q.type !== "rating" ? sq.triggerOptionIdx : null,
              trigger_rating_min: rMin,
              trigger_rating_max: rMax,
            };
          }),
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

          <div className={styles.optionGroup}>
            {scopeType === "public" ? (
              <p className={styles.infoText}>🔒 {t("survey.publicAnonymousNote")}</p>
            ) : (
              <>
                <label className={styles.checkLabel}>
                  <input type="checkbox" checked={allowAnon} onChange={(e) => setAllowAnon(e.target.checked)} />
                  {t("survey.allowAnonymous")}
                </label>
                {!allowAnon && (
                  <p className={styles.hint}>{t("survey.namedResponseHint")}</p>
                )}
              </>
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
              {/* 문항 헤더 */}
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

                {/* 순서 변경 버튼 */}
                <div className={styles.moveButtons}>
                  <button
                    type="button"
                    className={styles.moveBtn}
                    onClick={() => moveQuestion(q._key, -1)}
                    disabled={qi === 0}
                    title={t("survey.moveUp")}
                  >▲</button>
                  <button
                    type="button"
                    className={styles.moveBtn}
                    onClick={() => moveQuestion(q._key, 1)}
                    disabled={qi === questions.length - 1}
                    title={t("survey.moveDown")}
                  >▼</button>
                </div>

                {questions.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeQBtn}
                    onClick={() => removeQuestion(q._key)}
                  >×</button>
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
                  <label className={styles.checkLabelSmall} style={{ marginTop: 6 }}>
                    <input
                      type="checkbox"
                      checked={q.has_other}
                      onChange={(e) => updateQuestion(q._key, { has_other: e.target.checked })}
                    />
                    {t("survey.addOtherOption")}
                  </label>
                </div>
              )}

              {q.type === "rating" && (
                <p className={styles.ratingHint}>{t("survey.ratingHint")}</p>
              )}

              {/* 부속 질문 영역 */}
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

                        {/* 조건 트리거 — 선택형 */}
                        {["single", "multiple"].includes(q.type) && q.options.some((o) => o.trim()) && (
                          <select
                            className={styles.typeSelect}
                            value={sq.triggerOptionIdx ?? "always"}
                            onChange={(e) => updateSubQuestion(q._key, sq._key, {
                              triggerOptionIdx: e.target.value === "always" ? null : Number(e.target.value),
                            })}
                            title={t("survey.subTriggerLabel")}
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
                        {/* 조건 트리거 — 평점형 */}
                        {q.type === "rating" && (
                          <select
                            className={styles.typeSelect}
                            value={sq.triggerRating}
                            onChange={(e) => updateSubQuestion(q._key, sq._key, { triggerRating: e.target.value })}
                            title={t("survey.subTriggerLabel")}
                          >
                            <option value="always">{t("survey.triggerAlways")}</option>
                            <option value="1">{t("survey.triggerRating_1")}</option>
                            <option value="2">{t("survey.triggerRating_2")}</option>
                            <option value="3">{t("survey.triggerRating_3")}</option>
                            <option value="4">{t("survey.triggerRating_4")}</option>
                            <option value="5">{t("survey.triggerRating_5")}</option>
                            <option value="1-2">{t("survey.triggerRatingLow")}</option>
                            <option value="1-3">{t("survey.triggerRatingMidLow")}</option>
                            <option value="3-5">{t("survey.triggerRatingMidHigh")}</option>
                            <option value="4-5">{t("survey.triggerRatingHigh")}</option>
                          </select>
                        )}

                        <button
                          type="button"
                          className={styles.removeQBtn}
                          onClick={() => removeSubQuestion(q._key, sq._key)}
                        >×</button>
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
                          <label className={styles.checkLabelSmall} style={{ marginTop: 6 }}>
                            <input
                              type="checkbox"
                              checked={sq.has_other}
                              onChange={(e) => updateSubQuestion(q._key, sq._key, { has_other: e.target.checked })}
                            />
                            {t("survey.addOtherOption")}
                          </label>
                        </div>
                      )}
                      {sq.type === "rating" && (
                        <p className={styles.ratingHint}>{t("survey.ratingHint")}</p>
                      )}
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
