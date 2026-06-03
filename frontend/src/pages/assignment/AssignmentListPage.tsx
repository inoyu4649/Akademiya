import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { assignmentApi, type Assignment } from "../../api/assignment.api";
import { classApi } from "../../api/class.api";
import styles from "./AssignmentListPage.module.css";

function StatusBadge({ status }: { status: string | null | undefined }) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <span className={`${styles.badge} ${styles[`status_${status}`]}`}>
      {t(`assignment.status.${status}`)}
    </span>
  );
}

function isPast(due_at: string | null): boolean {
  if (!due_at) return false;
  return new Date(due_at) < new Date();
}

/** UTC due_at 을 조직 타임존으로 포맷 */
function formatDue(due_at: string, timezone: string): string {
  return new Date(due_at).toLocaleString(undefined, { timeZone: timezone });
}

export default function AssignmentListPage() {
  const { t } = useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [myPerm, setMyPerm]   = useState(0);
  const [className, setClassName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = Number(classId);
    if (!id) { navigate("/classes"); return; }

    Promise.all([assignmentApi.listByClass(id), classApi.detail(id)])
      .then(([asgRes, clsRes]) => {
        setAssignments(asgRes.data.assignments);
        setMyPerm(asgRes.data.myPermission);
        setTimezone(asgRes.data.timezone ?? "UTC");
        setClassName(clsRes.data.class.name);
      })
      .catch(() => navigate("/classes"))
      .finally(() => setLoading(false));
  }, [classId]);

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.back} onClick={() => navigate(`/classes/${classId}`)}>
          ← {t("common.back")}
        </button>
        <h1 className={styles.title}>{className} · {t("assignment.list.title")}</h1>
        {myPerm >= 1 && (
          <button
            className={styles.btnPrimary}
            onClick={() => navigate(`/classes/${classId}/assignments/create`)}
          >
            + {t("assignment.list.createBtn")}
          </button>
        )}
      </div>

      {assignments.length === 0 ? (
        <div className={styles.empty}>{t("assignment.list.empty")}</div>
      ) : (
        <div className={styles.list}>
          {assignments.map((a) => (
            <Link key={a.id} to={`/assignments/${a.id}`} className={`${styles.item} ${isPast(a.due_at) ? styles.past : ""}`}>
              <div className={styles.itemMain}>
                <span className={styles.itemTitle}>{a.title}</span>
                <StatusBadge status={a.my_status} />
              </div>
              <div className={styles.itemMeta}>
                {a.due_at ? (
                  <span className={`${styles.due} ${isPast(a.due_at) ? styles.duePast : ""}`}>
                    {t("assignment.list.dueAt")}: {formatDue(a.due_at, timezone)}
                  </span>
                ) : (
                  <span className={styles.noDue}>{t("assignment.detail.noDue")}</span>
                )}
                <span className={styles.creator}>{t("assignment.list.by")} {a.creator_name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
