import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resourceApi } from "../../api/resource.api";
import client from "../../api/client";
import styles from "./ClassResourceCreatePage.module.css";

// ── 한도 확장 요청 섹션 ────────────────────────────────────────────────────────
function LimitRequestSection({
  classId,
  maxFiles,
  maxSizeMb,
  onToast,
}: {
  classId: number;
  maxFiles: number;
  maxSizeMb: number;
  onToast: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen]         = useState(false);
  const [reqFiles, setReqFiles] = useState(maxFiles);
  const [reqMb, setReqMb]       = useState(maxSizeMb);
  const [reason, setReason]     = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleRequest() {
    setLoading(true);
    try {
      await client.post("/resources/limit-request", {
        class_id:             classId,
        requested_max_files:   reqFiles,
        requested_max_size_mb: reqMb,
        reason:                reason.trim() || null,
      });
      onToast(t("resource.create.limitRequested"));
      setOpen(false);
      setReason("");
    } catch {
      onToast(t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.limitSection}>
      <p className={styles.limitSectionTitle}>{t("resource.create.limitSectionTitle")}</p>
      <div className={styles.limitInfo}>
        <span className={styles.hint}>
          {t("resource.create.currentLimits", { files: maxFiles, mb: maxSizeMb })}
        </span>
        <button className={styles.btnSecondary} onClick={() => setOpen((o) => !o)}>
          {t("resource.create.requestLimitExpand")}
        </button>
      </div>
      {open && (
        <div className={styles.limitForm}>
          <div className={styles.limitRow}>
            <label className={styles.limitLabel}>{t("resource.create.reqMaxFiles")}</label>
            <input
              className={styles.limitInput}
              type="number"
              min={maxFiles}
              value={reqFiles}
              onChange={(e) => setReqFiles(Number(e.target.value))}
            />
          </div>
          <div className={styles.limitRow}>
            <label className={styles.limitLabel}>{t("resource.create.reqMaxSizeMb")}</label>
            <input
              className={styles.limitInput}
              type="number"
              min={maxSizeMb}
              value={reqMb}
              onChange={(e) => setReqMb(Number(e.target.value))}
            />
          </div>
          <div className={styles.limitRow}>
            <label className={styles.limitLabel}>{t("resource.create.reqReason")}</label>
            <input
              className={styles.limitInput}
              placeholder={t("resource.create.reqReasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button className={styles.btnPrimary} onClick={handleRequest} disabled={loading}>
            {loading ? t("common.loading") : t("resource.create.submitRequest")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────────────────────────
export default function ClassResourceCreatePage() {
  const { t }      = useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const navigate   = useNavigate();
  const classIdNum = Number(classId);

  const [tab, setTab]           = useState<"file" | "link">("file");
  const [title, setTitle]       = useState("");
  const [desc, setDesc]         = useState("");
  const [linkUrl, setLinkUrl]   = useState("");
  const [files, setFiles]       = useState<File[]>([]);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [toast, setToast]       = useState("");

  // 반의 현재 한도
  const [maxFiles, setMaxFiles]   = useState(20);
  const [maxSizeMb, setMaxSizeMb] = useState(20);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!classIdNum) { navigate("/classes"); return; }
    resourceApi.getLimits(classIdNum)
      .then((res) => {
        setMaxFiles(res.data.maxFiles);
        setMaxSizeMb(res.data.maxSizeMb);
      })
      .catch(() => navigate(`/classes/${classIdNum}/resources`));
  }, [classIdNum]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > maxFiles) {
      setError(t("assignment.detail.tooManyFiles", { max: maxFiles }));
      return;
    }
    const totalBytes = selected.reduce((s, f) => s + f.size, 0);
    if (totalBytes > maxSizeMb * 1024 * 1024) {
      setError(t("assignment.detail.totalTooLarge", { mb: maxSizeMb }));
      return;
    }
    setError("");
    setFiles(selected);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) { setError(t("resource.titleRequired")); return; }
    if (tab === "file" && files.length === 0) { setError(t("resource.noContent")); return; }
    if (tab === "link" && !linkUrl.trim())    { setError(t("resource.noContent")); return; }

    const fd = new FormData();
    fd.append("class_id", String(classIdNum));
    fd.append("title",    title.trim());
    if (desc.trim()) fd.append("description", desc.trim());
    if (tab === "file") {
      for (const f of files) fd.append("files", f);
    } else {
      fd.append("link_url", linkUrl.trim());
    }

    setLoading(true);
    try {
      await resourceApi.upload(fd);
      navigate(`/classes/${classIdNum}/resources`);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg === "resource.totalTooLarge") {
        setError(t("assignment.detail.totalTooLarge", { mb: err?.response?.data?.maxSizeMb ?? maxSizeMb }));
      } else if (msg === "resource.tooManyFiles") {
        setError(t("assignment.detail.tooManyFiles", { max: err?.response?.data?.maxFiles ?? maxFiles }));
      } else if (msg === "resource.fileTooLarge" || err?.response?.status === 413) {
        setError(t("resource.fileTooLargeServer"));
      } else if (msg === "resource.leaderOnly") {
        setError(t("resource.leaderOnly"));
      } else {
        setError(t("resource.serverError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24,
          background: "var(--bg-panel)", border: "1px solid var(--accent)",
          color: "var(--accent)", padding: "10px 18px",
          borderRadius: "var(--radius-sm)", fontSize: 13,
          zIndex: 100, boxShadow: "var(--shadow-md)",
        }}>
          {toast}
        </div>
      )}

      <button className={styles.back} onClick={() => navigate(`/classes/${classIdNum}/resources`)}>
        ← {t("common.back")}
      </button>

      {/* 업로드 폼 카드 */}
      <div className={styles.card}>
        <h1 className={styles.title}>{t("resource.create.title")}</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.errorBox}>{error}</div>}

          {/* 제목 */}
          <div className={styles.field}>
            <label className={styles.label}>{t("resource.titleLabel")}</label>
            <input
              className={styles.input}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("resource.titlePlaceholder")}
              maxLength={300}
              disabled={loading}
            />
          </div>

          {/* 설명 */}
          <div className={styles.field}>
            <label className={styles.label}>{t("resource.descLabel")}</label>
            <textarea
              className={styles.textarea}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder={t("resource.descPlaceholder")}
              rows={4}
              disabled={loading}
            />
          </div>

          {/* 파일 / 링크 탭 */}
          <div className={styles.field}>
            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${tab === "file" ? styles.tabActive : ""}`}
                onClick={() => { setTab("file"); setError(""); }}
                disabled={loading}
              >
                {t("resource.tabFile")}
              </button>
              <button
                type="button"
                className={`${styles.tab} ${tab === "link" ? styles.tabActive : ""}`}
                onClick={() => { setTab("link"); setError(""); }}
                disabled={loading}
              >
                {t("resource.tabLink")}
              </button>
            </div>

            {tab === "file" ? (
              <div className={styles.fileArea}>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className={styles.fileInput}
                  onChange={handleFileChange}
                  disabled={loading}
                />
                <span className={styles.hint}>
                  {t("resource.create.fileHint", { files: maxFiles, mb: maxSizeMb })}
                </span>
                {files.length > 0 && (
                  <div className={styles.selectedFiles}>
                    {files.map((f, i) => (
                      <div key={i} className={styles.selectedFile}>
                        <span>📎 {f.name} ({Math.round(f.size / 1024)}KB)</span>
                        <button
                          type="button"
                          className={styles.removeFileBtn}
                          onClick={() => removeFile(i)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input
                className={styles.linkInput}
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={t("resource.linkPlaceholder")}
                disabled={loading}
              />
            )}
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={() => navigate(`/classes/${classIdNum}/resources`)}
              disabled={loading}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className={styles.btnSubmit}
              disabled={loading || !title.trim()}
            >
              {loading ? t("common.loading") : t("resource.uploadBtn")}
            </button>
          </div>
        </form>
      </div>

      {/* 한도 확장 요청 카드 */}
      <div className={styles.card}>
        <LimitRequestSection
          classId={classIdNum}
          maxFiles={maxFiles}
          maxSizeMb={maxSizeMb}
          onToast={showToast}
        />
      </div>
    </div>
  );
}
