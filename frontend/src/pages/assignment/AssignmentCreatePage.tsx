import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { assignmentApi } from "../../api/assignment.api";
import styles from "./AssignmentCreatePage.module.css";

export default function AssignmentCreatePage() {
  const { t } = useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();

  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [dueAt, setDueAt]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError(t("assignment.create.titleRequired"));
      return;
    }

    setLoading(true);
    try {
      await assignmentApi.create({
        class_id: Number(classId),
        title:    title.trim(),
        description: desc.trim() || undefined,
        due_at:   dueAt || undefined,
      });
      navigate(`/classes/${classId}/assignments`);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg === "assignment.create.leaderOnly") setError(t("assignment.create.leaderOnly"));
      else setError(t("assignment.create.serverError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>
        ← {t("common.back")}
      </button>

      <div className={styles.card}>
        <h1 className={styles.title}>{t("assignment.create.title")}</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.errorBox}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>{t("assignment.create.titleLabel")}</label>
            <input
              className={styles.input}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("assignment.create.titlePlaceholder")}
              maxLength={300}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t("assignment.create.descLabel")}</label>
            <textarea
              className={styles.textarea}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("assignment.create.descPlaceholder")}
              rows={5}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t("assignment.create.dueLabel")}</label>
            <input
              className={styles.input}
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={loading}
            />
            <span className={styles.hint}>{t("assignment.create.dueHint")}</span>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={() => navigate(-1)}
              disabled={loading}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className={styles.btnSubmit}
              disabled={loading || !title.trim()}
            >
              {loading ? t("common.loading") : t("assignment.create.submitBtn")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
