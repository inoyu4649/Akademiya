import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resourceApi, type Resource } from "../../api/resource.api";
import { downloadFile } from "../../api/file.api";
import styles from "./ClassResourcesPage.module.css";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClassResourcesPage() {
  const { t }    = useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const classIdNum = Number(classId);

  const [resources, setResources] = useState<Resource[]>([]);
  const [isLeader, setIsLeader]   = useState(false);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState("");

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
            onClick={() => navigate(`/classes/${classIdNum}/resources/create`)}
          >
            + {t("resource.upload")}
          </button>
        )}
      </div>

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
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        void downloadFile(f.file_url, f.original_name).catch(() =>
                          setToast(t("resource.downloadFailed"))
                        )
                      }
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
