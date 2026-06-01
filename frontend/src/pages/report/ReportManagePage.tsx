import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportApi, type Report } from "../../api/report.api";
import { useAuthStore } from "../../store/auth.store";
import styles from "./ReportManagePage.module.css";

function StageBadge({ stage }: { stage: string }) {
  const { t } = useTranslation();
  const cls =
    stage === "class_leader" ? styles.stageClass
    : stage === "org_admin"  ? styles.stageOrg
    : styles.stageAkademiya;
  return <span className={`${styles.stageBadge} ${cls}`}>{t(`report.stage.${stage}`)}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cls =
    status === "pending"    ? styles.statusPending
    : status === "resolved" ? styles.statusResolved
    : styles.statusEscalated;
  return <span className={`${styles.statusBadge} ${cls}`}>{t(`report.status.${status}`)}</span>;
}

interface ActionModalProps {
  report: Report;
  onClose: () => void;
  onDone: (id: number) => void;
  isAdmin: boolean;
}

function ActionModal({ report, onClose, onDone, isAdmin }: ActionModalProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const canEscalate = report.stage !== "akademiya";

  async function act(action: "resolve" | "escalate" | "ban") {
    setLoading(true);
    try {
      if (action === "resolve")  await reportApi.resolve(report.id, note);
      if (action === "escalate") await reportApi.escalate(report.id, note);
      if (action === "ban")      await reportApi.ban(report.id, note);
      onDone(report.id);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.mHeader}>
          <h2>{t("report.handleModal.title")}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.mInfo}>
          <div><span className={styles.infoLabel}>{t("report.reportedLabel")}:</span> <strong>{report.reported_name}</strong></div>
          <div><span className={styles.infoLabel}>{t("report.reporterLabel")}:</span> {report.reporter_name}</div>
          {report.class_name && <div><span className={styles.infoLabel}>{t("report.classLabel")}:</span> {report.class_name}</div>}
          <div className={styles.reasonBox}>{report.reason}</div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t("report.handleModal.noteLabel")}</label>
          <textarea
            className={styles.textarea}
            placeholder={t("report.handleModal.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        <div className={styles.mActions}>
          <button className={styles.btnResolve} disabled={loading} onClick={() => act("resolve")}>
            {t("report.handleModal.resolve")}
          </button>
          {canEscalate && (
            <button className={styles.btnEscalate} disabled={loading} onClick={() => act("escalate")}>
              {t("report.handleModal.escalate")}
            </button>
          )}
          {isAdmin && (
            <button className={styles.btnBan} disabled={loading} onClick={() => act("ban")}>
              {t("report.handleModal.ban")}
            </button>
          )}
          <button className={styles.btnCancel} onClick={onClose}>{t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}

export default function ReportManagePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";

  const [reports, setReports] = useState<Report[]>([]);
  const [myReports, setMyReports] = useState<Report[]>([]);
  const [tab, setTab] = useState<"handle" | "mine">("handle");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Report | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    Promise.all([
      reportApi.handle(),
      reportApi.mine(),
    ]).then(([handleRes, mineRes]) => {
      setReports(handleRes.data.reports);
      setMyReports(mineRes.data.reports);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleDone(id: number) {
    setReports((prev) => prev.filter((r) => r.id !== id));
    setSelected(null);
    showToast(t("report.handled"));
  }

  const displayList = tab === "handle" ? reports : myReports;

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {selected && (
        <ActionModal
          report={selected}
          onClose={() => setSelected(null)}
          onDone={handleDone}
          isAdmin={isAdmin}
        />
      )}

      <h1 className={styles.title}>{t("report.page.title")}</h1>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "handle" ? styles.tabActive : ""}`}
          onClick={() => setTab("handle")}
        >
          {t("report.page.tabHandle")}
          {reports.length > 0 && <span className={styles.badge}>{reports.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${tab === "mine" ? styles.tabActive : ""}`}
          onClick={() => setTab("mine")}
        >
          {t("report.page.tabMine")}
        </button>
      </div>

      {displayList.length === 0 ? (
        <div className={styles.empty}>{t("report.page.empty")}</div>
      ) : (
        <div className={styles.list}>
          {displayList.map((r) => (
            <div
              key={r.id}
              className={styles.item}
              onClick={() => tab === "handle" && r.status === "pending" ? setSelected(r) : undefined}
              style={{ cursor: tab === "handle" && r.status === "pending" ? "pointer" : "default" }}
            >
              <div className={styles.itemTop}>
                <span className={styles.reportedName}>{r.reported_name}</span>
                <div className={styles.badges}>
                  <StageBadge stage={r.stage} />
                  <StatusBadge status={r.status} />
                </div>
              </div>
              <p className={styles.reason}>{r.reason.length > 100 ? r.reason.slice(0, 100) + "…" : r.reason}</p>
              <div className={styles.meta}>
                {r.class_name && <span>{r.class_name}</span>}
                {r.org_name   && <span>{r.org_name}</span>}
                <span>{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
