import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resourceApi, type Resource } from "../../api/resource.api";
import styles from "./ClassResourcesPage.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_SIZE_MB = 20;

export default function ClassResourcesPage() {
  const { t }    = useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const classIdNum = Number(classId);

  const [resources, setResources] = useState<Resource[]>([]);
  const [isLeader, setIsLeader]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState("");

  // 업로드 폼
  const [formOpen, setFormOpen]     = useState(false);
  const [tab, setTab]               = useState<"file" | "link">("file");
  const [titleVal, setTitleVal]     = useState("");
  const [descVal, setDescVal]       = useState("");
  const [linkVal, setLinkVal]       = useState("");
  const [files, setFiles]           = useState<File[]>([]);
  const [formError, setFormError]   = useState("");
  const [uploading, setUploading]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 삭제 확인
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  useEffect(() => {
    if (!classIdNum) { navigate("/classes"); return; }
    loadResources();
  }, [classIdNum]);

  async function loadResources() {
    try {
      const res = await resourceApi.list(classIdNum);
      setResources(res.data.resources);
      setIsLeader(res.data.isLeader);
    } catch {
      navigate("/classes");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const totalBytes = selected.reduce((s, f) => s + f.size, 0);
    if (totalBytes > MAX_SIZE_MB * 1024 * 1024) {
      setFormError(t("resource.fileTooLarge"));
      return;
    }
    setFormError("");
    setFiles(selected);
  }

  function resetForm() {
    setTitleVal("");
    setDescVal("");
    setLinkVal("");
    setFiles([]);
    setFormError("");
    setTab("file");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!titleVal.trim()) { setFormError(t("resource.titleRequired")); return; }
    if (tab === "file" && files.length === 0) { setFormError(t("resource.noContent")); return; }
    if (tab === "link" && !linkVal.trim())    { setFormError(t("resource.noContent")); return; }

    const fd = new FormData();
    fd.append("class_id", String(classIdNum));
    fd.append("title",    titleVal.trim());
    if (descVal.trim()) fd.append("description", descVal.trim());
    if (tab === "file") {
      for (const f of files) fd.append("files", f);
    } else {
      fd.append("link_url", linkVal.trim());
    }

    setUploading(true);
    try {
      await resourceApi.upload(fd);
      showToast(t("resource.uploadSuccess"));
      resetForm();
      setFormOpen(false);
      await loadResources();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (msg === "resource.totalTooLarge" || msg === "resource.fileTooLarge") {
        setFormError(t("resource.fileTooLargeServer"));
      } else if (err?.response?.status === 413) {
        setFormError(t("resource.fileTooLargeServer"));
      } else {
        setFormError(t("resource.serverError"));
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await resourceApi.remove(id);
      setResources((prev) => prev.filter((r) => r.id !== id));
      showToast(t("resource.deleteSuccess"));
    } catch {
      showToast(t("resource.serverError"));
    } finally {
      setDeleteTarget(null);
    }
  }

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* 삭제 확인 모달 */}
      {deleteTarget !== null && (
        <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{t("resource.deleteConfirm")}</h3>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setDeleteTarget(null)}>
                {t("common.cancel")}
              </button>
              <button className={styles.btnDanger} onClick={() => handleDelete(deleteTarget)}>
                {t("resource.deleteBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className={styles.header}>
        <div>
          <button className={styles.backBtn} onClick={() => navigate(`/classes/${classIdNum}`)}>
            ← {t("common.back")}
          </button>
          <h1 className={styles.title}>📁 {t("resource.title")}</h1>
        </div>
        {isLeader && (
          <button
            className={styles.btnUpload}
            onClick={() => { setFormOpen((o) => !o); if (formOpen) resetForm(); }}
          >
            {formOpen ? t("common.cancel") : `+ ${t("resource.upload")}`}
          </button>
        )}
      </div>

      {/* 업로드 폼 */}
      {formOpen && isLeader && (
        <div className={styles.uploadForm}>
          <h2 className={styles.formTitle}>{t("resource.upload")}</h2>
          <form onSubmit={handleUpload}>
            <label className={styles.fieldLabel}>{t("resource.titleLabel")}</label>
            <input
              className={styles.input}
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              placeholder={t("resource.titlePlaceholder")}
              maxLength={300}
            />
            <label className={styles.fieldLabel}>{t("resource.descLabel")}</label>
            <textarea
              className={styles.textarea}
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              placeholder={t("resource.descPlaceholder")}
              rows={3}
            />

            {/* 파일 / 링크 탭 */}
            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${tab === "file" ? styles.tabActive : ""}`}
                onClick={() => { setTab("file"); setFormError(""); }}
              >
                {t("resource.tabFile")}
              </button>
              <button
                type="button"
                className={`${styles.tab} ${tab === "link" ? styles.tabActive : ""}`}
                onClick={() => { setTab("link"); setFormError(""); }}
              >
                {t("resource.tabLink")}
              </button>
            </div>

            {tab === "file" ? (
              <div className={styles.fileArea}>
                <label className={styles.fieldLabel}>{t("resource.fileLabel")}</label>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className={styles.fileInput}
                  onChange={handleFileChange}
                />
                {files.length > 0 && (
                  <ul className={styles.filePreviewList}>
                    {files.map((f, i) => (
                      <li key={i} className={styles.filePreviewItem}>
                        <span className={styles.fileName}>{f.name}</span>
                        <span className={styles.fileSize}>{formatBytes(f.size)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div>
                <label className={styles.fieldLabel}>{t("resource.linkLabel")}</label>
                <input
                  className={styles.input}
                  value={linkVal}
                  onChange={(e) => setLinkVal(e.target.value)}
                  placeholder={t("resource.linkPlaceholder")}
                />
              </div>
            )}

            {formError && <p className={styles.formError}>{formError}</p>}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => { setFormOpen(false); resetForm(); }}
              >
                {t("common.cancel")}
              </button>
              <button type="submit" className={styles.btnConfirm} disabled={uploading}>
                {uploading ? t("common.loading") : t("resource.uploadBtn")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 자료 목록 */}
      {resources.length === 0 ? (
        <p className={styles.empty}>{t("resource.empty")}</p>
      ) : (
        <div className={styles.list}>
          {resources.map((r) => (
            <div key={r.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{r.title}</h3>
                {isLeader && (
                  <button
                    className={styles.btnDelete}
                    onClick={() => setDeleteTarget(r.id)}
                  >
                    {t("resource.deleteBtn")}
                  </button>
                )}
              </div>
              {r.description && (
                <p className={styles.cardDesc}>{r.description}</p>
              )}
              <div className={styles.cardMeta}>
                <span className={styles.metaBy}>{r.creator_name}</span>
                <span className={styles.metaDot}>·</span>
                <span className={styles.metaDate}>
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* 파일 목록 */}
              {r.files.length > 0 && (
                <div className={styles.fileList}>
                  <span className={styles.filesLabel}>{t("resource.files")}</span>
                  {r.files.map((f) => (
                    <a
                      key={f.id}
                      className={styles.fileLink}
                      href={`${import.meta.env.VITE_API_URL ?? ""}${f.file_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={f.original_name}
                    >
                      📎 {f.original_name}
                      <span className={styles.fileSizeBadge}>{formatBytes(f.file_size)}</span>
                    </a>
                  ))}
                </div>
              )}

              {/* 링크 */}
              {r.link_url && (
                <a
                  className={styles.externalLink}
                  href={r.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🔗 {t("resource.linkBtn")}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
