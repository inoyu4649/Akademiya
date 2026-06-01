import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { assignmentApi, type Assignment, type Submission, type Comment } from "../../api/assignment.api";
import styles from "./AssignmentDetailPage.module.css";

// ── Return modal (반장용) ────────────────────────────────────────────────────
function ReturnModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (feedback: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState("");
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{t("assignment.detail.returnModalTitle")}</h3>
        <label className={styles.label}>{t("assignment.detail.returnFeedbackLabel")}</label>
        <textarea
          className={styles.textarea}
          rows={4}
          placeholder={t("assignment.detail.returnFeedbackPlaceholder")}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <div className={styles.modalActions}>
          <button className={styles.btnCancel} onClick={onClose}>{t("common.cancel")}</button>
          <button
            className={styles.btnDanger}
            onClick={() => onConfirm(feedback)}
          >
            {t("assignment.detail.confirmReturn")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Submit section (학생용) ──────────────────────────────────────────────────
function SubmitSection({
  assignmentId,
  submission,
  pastDue,
  onSuccess,
}: {
  assignmentId: number;
  submission: Submission | null;
  pastDue: boolean;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab]         = useState<"file" | "link">("file");
  const [file, setFile]       = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (tab === "file" && !file) { setError(t("assignment.detail.fileRequired")); return; }
    if (tab === "link" && !linkUrl.trim()) { setError(t("assignment.detail.linkRequired")); return; }

    const fd = new FormData();
    fd.append("assignment_id", String(assignmentId));
    if (tab === "file" && file) fd.append("file", file);
    else fd.append("link_url", linkUrl.trim());

    setLoading(true);
    try {
      await assignmentApi.submit(fd);
      setFile(null);
      setLinkUrl("");
      if (fileRef.current) fileRef.current.value = "";
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg === "submission.fileTooLarge")    setError(t("assignment.detail.fileTooLarge"));
      else if (msg === "submission.pastDue")    setError(t("assignment.detail.pastDue"));
      else if (msg === "submission.alreadyApproved") setError(t("assignment.detail.alreadyApproved"));
      else if (msg === "submission.noContent")  setError(t("assignment.detail.fileRequired"));
      else setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = !pastDue && submission?.status !== "approved";

  return (
    <div className={styles.submitSection}>
      <h2 className={styles.sectionTitle}>{t("assignment.detail.submitSection")}</h2>

      {/* 기존 제출 상태 */}
      {submission && (
        <div className={`${styles.submissionStatus} ${styles[`status_${submission.status}`]}`}>
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>
              {t(`assignment.status.${submission.status}`)}
            </span>
            <span className={styles.statusDate}>
              {new Date(submission.submitted_at).toLocaleString()}
            </span>
          </div>
          {submission.file_url && (
            <a className={styles.fileLink} href={submission.file_url} target="_blank" rel="noreferrer">
              📎 {t("assignment.detail.downloadFile")}
            </a>
          )}
          {submission.link_url && (
            <a className={styles.fileLink} href={submission.link_url} target="_blank" rel="noreferrer">
              🔗 {submission.link_url}
            </a>
          )}
          {submission.feedback && (
            <div className={styles.feedback}>
              <span className={styles.feedbackLabel}>{t("assignment.detail.feedback")}:</span>
              <span>{submission.feedback}</span>
            </div>
          )}
        </div>
      )}

      {/* 제출 폼 */}
      {canSubmit && (
        <form onSubmit={handleSubmit} className={styles.submitForm}>
          {/* 탭 */}
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === "file" ? styles.tabActive : ""}`}
              onClick={() => setTab("file")}
            >
              {t("assignment.detail.tabFile")}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === "link" ? styles.tabActive : ""}`}
              onClick={() => setTab("link")}
            >
              {t("assignment.detail.tabLink")}
            </button>
          </div>

          {tab === "file" ? (
            <div className={styles.fileArea}>
              <input
                ref={fileRef}
                type="file"
                className={styles.fileInput}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={loading}
              />
              <span className={styles.hint}>{t("assignment.detail.fileHint")}</span>
            </div>
          ) : (
            <input
              className={styles.linkInput}
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder={t("assignment.detail.linkPlaceholder")}
              disabled={loading}
            />
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button
            type="submit"
            className={styles.btnPrimary}
            disabled={loading}
          >
            {loading
              ? t("common.loading")
              : submission
              ? t("assignment.detail.resubmitBtn")
              : t("assignment.detail.submitBtn")}
          </button>
        </form>
      )}

      {pastDue && !submission && (
        <p className={styles.pastDueMsg}>{t("assignment.detail.pastDue")}</p>
      )}
    </div>
  );
}

// ── Leader: submission management ────────────────────────────────────────────
function SubmissionManagement({
  assignmentId,
  onToast,
}: {
  assignmentId: number;
  onToast: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [subs, setSubs]             = useState<Submission[]>([]);
  const [returnTarget, setReturnTarget] = useState<number | null>(null);

  useEffect(() => {
    assignmentApi.getSubmissions(assignmentId).then((r) => setSubs(r.data.submissions));
  }, [assignmentId]);

  async function handleApprove(subId: number) {
    await assignmentApi.approveSubmission(subId);
    setSubs((prev) =>
      prev.map((s) => (s.submission_id === subId ? { ...s, status: "approved" } : s))
    );
    onToast(t("assignment.detail.approveSuccess"));
  }

  async function handleReturn(subId: number, feedback: string) {
    await assignmentApi.returnSubmission(subId, feedback);
    setSubs((prev) =>
      prev.map((s) => (s.submission_id === subId ? { ...s, status: "returned", feedback } : s))
    );
    setReturnTarget(null);
    onToast(t("assignment.detail.returnSuccess"));
  }

  return (
    <div className={styles.submissionMgmt}>
      {returnTarget !== null && (
        <ReturnModal
          onConfirm={(fb) => handleReturn(returnTarget, fb)}
          onClose={() => setReturnTarget(null)}
        />
      )}

      <h2 className={styles.sectionTitle}>{t("assignment.detail.submissionsSection")}</h2>
      <div className={styles.subTable}>
        <div className={`${styles.subRow} ${styles.subHeader}`}>
          <span>Name</span>
          <span>{t("assignment.detail.submitSection")}</span>
          <span></span>
        </div>
        {subs.map((s) => (
          <div key={s.user_id} className={styles.subRow}>
            <span className={styles.subName}>{s.display_name}</span>
            <span>
              {s.submission_id ? (
                <span className={`${styles.badge} ${styles[`status_${s.status}`]}`}>
                  {t(`assignment.status.${s.status}`)}
                </span>
              ) : (
                <span className={styles.notSubmitted}>{t("assignment.detail.notSubmitted")}</span>
              )}
            </span>
            <span className={styles.subActions}>
              {s.submission_id && s.status !== "approved" && (
                <>
                  <button
                    className={styles.btnApprove}
                    onClick={() => handleApprove(s.submission_id!)}
                  >
                    {t("assignment.detail.approveBtn")}
                  </button>
                  <button
                    className={styles.btnReturn}
                    onClick={() => setReturnTarget(s.submission_id!)}
                  >
                    {t("assignment.detail.returnBtn")}
                  </button>
                </>
              )}
              {s.submission_id && (
                <span className={styles.subLinks}>
                  {s.file_url && (
                    <a href={s.file_url} target="_blank" rel="noreferrer" className={styles.fileLink}>
                      📎
                    </a>
                  )}
                  {s.link_url && (
                    <a href={s.link_url} target="_blank" rel="noreferrer" className={styles.fileLink}>
                      🔗
                    </a>
                  )}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Comments ─────────────────────────────────────────────────────────────────
function CommentsSection({
  assignmentId,
  currentUserId,
  myPerm,
}: {
  assignmentId: number;
  currentUserId: number;
  myPerm: number;
}) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft]       = useState("");
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    assignmentApi.getComments(assignmentId).then((r) => setComments(r.data.comments));
  }, [assignmentId]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setLoading(true);
    try {
      await assignmentApi.addComment({ assignment_id: assignmentId, content: draft.trim() });
      const r = await assignmentApi.getComments(assignmentId);
      setComments(r.data.comments);
      setDraft("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    await assignmentApi.deleteComment(id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className={styles.comments}>
      <h2 className={styles.sectionTitle}>{t("assignment.detail.commentsSection")}</h2>
      <div className={styles.commentList}>
        {comments.map((c) => (
          <div key={c.id} className={styles.commentItem}>
            <div className={styles.commentHeader}>
              <span className={styles.commentAuthor}>{c.display_name}</span>
              <span className={styles.commentDate}>
                {new Date(c.created_at).toLocaleString()}
              </span>
              {(c.user_id === currentUserId || myPerm >= 1) && (
                <button
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(c.id)}
                  title={t("assignment.detail.deleteComment")}
                >
                  ×
                </button>
              )}
            </div>
            <p className={styles.commentContent}>
              {c.content}
              {c.is_filtered === 1 && (
                <span className={styles.filteredNote}> {t("assignment.detail.commentFiltered")}</span>
              )}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handlePost} className={styles.commentForm}>
        <input
          className={styles.commentInput}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("assignment.detail.commentPlaceholder")}
          disabled={loading}
          maxLength={500}
        />
        <button
          type="submit"
          className={styles.btnPost}
          disabled={loading || !draft.trim()}
        >
          {t("assignment.detail.commentSubmit")}
        </button>
      </form>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssignmentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [myPerm, setMyPerm]         = useState(0);
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState("");

  const assignmentId = Number(id);

  function loadDetail() {
    assignmentApi
      .detail(assignmentId)
      .then((r) => {
        setAssignment(r.data.assignment);
        setMyPerm(r.data.myPermission);
        setMySubmission(r.data.mySubmission);
      })
      .catch(() => navigate("/classes"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { if (assignmentId) loadDetail(); }, [assignmentId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  const pastDue = assignment?.due_at ? new Date(assignment.due_at) < new Date() : false;

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;
  if (!assignment) return null;

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Header */}
      <div className={styles.header}>
        <button
          className={styles.back}
          onClick={() => navigate(`/classes/${assignment.class_id}/assignments`)}
        >
          ← {t("common.back")}
        </button>
        <div className={styles.meta}>
          <span className={styles.className}>{assignment.class_name}</span>
        </div>
        <h1 className={styles.title}>{assignment.title}</h1>
        <div className={styles.info}>
          <span>
            {assignment.due_at ? (
              <span className={pastDue ? styles.pastDue : styles.dueDate}>
                📅 {new Date(assignment.due_at).toLocaleString()}
                {pastDue && ` (${t("assignment.detail.pastDueLabel")})`}
              </span>
            ) : (
              <span className={styles.noDue}>{t("assignment.detail.noDue")}</span>
            )}
          </span>
          <span className={styles.creator}>by {assignment.creator_name}</span>
        </div>
        {assignment.description && (
          <div className={styles.description}>{assignment.description}</div>
        )}
      </div>

      {/* Submit section (학생) */}
      {myPerm === 0 && (
        <SubmitSection
          assignmentId={assignmentId}
          submission={mySubmission}
          pastDue={pastDue}
          onSuccess={() => {
            showToast(t("assignment.detail.submitSuccess"));
            loadDetail();
          }}
        />
      )}

      {/* Submission management (반장) */}
      {myPerm >= 1 && (
        <SubmissionManagement assignmentId={assignmentId} onToast={showToast} />
      )}

      {/* Comments */}
      {currentUser && (
        <CommentsSection
          assignmentId={assignmentId}
          currentUserId={currentUser.id}
          myPerm={myPerm}
        />
      )}
    </div>
  );
}
