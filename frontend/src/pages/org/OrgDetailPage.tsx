import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { orgApi, type Org, type OrgMember, type OrgJoinRequest } from "../../api/org.api";
import { classApi, type ClassRequest } from "../../api/class.api";
import styles from "./OrgDetailPage.module.css";

function PermissionBadge({ perm }: { perm: number }) {
  const { t } = useTranslation();
  const labels = ["permission0", "permission1", "permission2", "permission3"] as const;
  const classes = [styles.perm0, styles.perm1, styles.perm2, styles.perm3];
  return (
    <span className={`${styles.permBadge} ${classes[perm] ?? styles.perm0}`}>
      {t(`org.detail.${labels[perm] ?? "permission0"}`)}
    </span>
  );
}

export default function OrgDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orgId = Number(id);

  const [org, setOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [myPerm, setMyPerm] = useState(0);
  const [requests, setRequests] = useState<OrgJoinRequest[]>([]);
  const [classRequests, setClassRequests] = useState<ClassRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // permission edit state: { userId → pending permission value }
  const [permEdits, setPermEdits] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!orgId) { navigate("/"); return; }
    Promise.all([
      orgApi.detail(orgId),
      (myPerm === undefined || true) ? Promise.resolve(null) : Promise.resolve(null),
    ])
      .then(async ([detailRes]) => {
        setOrg(detailRes.data.org);
        setMembers(detailRes.data.members);
        setMyPerm(detailRes.data.myPermission);
        if (detailRes.data.myPermission >= 3) {
          const [reqRes, clsReqRes] = await Promise.all([
            orgApi.joinRequests(orgId),
            classApi.orgClassRequests(orgId),
          ]);
          setRequests(reqRes.data.requests);
          setClassRequests(clsReqRes.data.requests);
        }
      })
      .catch(() => navigate("/"))
      .finally(() => setLoading(false));
  }, [orgId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleApprove(requestId: number) {
    await orgApi.approveRequest(orgId, requestId);
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    const detailRes = await orgApi.detail(orgId);
    setMembers(detailRes.data.members);
    showToast(t("org.detail.approveSuccess"));
  }

  async function handleReject(requestId: number) {
    await orgApi.rejectRequest(orgId, requestId);
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    showToast(t("org.detail.rejectSuccess"));
  }

  async function handleClassApprove(classId: number) {
    await classApi.approveClassRequest(orgId, classId);
    setClassRequests((prev) => prev.filter((r) => r.id !== classId));
    showToast(t("org.detail.classApproveSuccess"));
  }

  async function handleClassReject(classId: number) {
    await classApi.rejectClassRequest(orgId, classId);
    setClassRequests((prev) => prev.filter((r) => r.id !== classId));
    showToast(t("org.detail.classRejectSuccess"));
  }

  async function handleSavePerm(userId: number) {
    const newPerm = permEdits[userId];
    if (newPerm === undefined) return;
    await orgApi.updatePermission(orgId, userId, newPerm);
    setMembers((prev) =>
      prev.map((m) => (m.id === userId ? { ...m, permission: newPerm } : m))
    );
    setPermEdits((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    showToast(t("org.detail.permissionSaved"));
  }

  if (loading) {
    return <div className={styles.loading}>{t("common.loading")}</div>;
  }
  if (!org) return null;

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Org header */}
      <div className={styles.orgHeader}>
        <div>
          <div className={styles.orgCode}>{org.code}</div>
          <h1 className={styles.orgName}>{org.name}</h1>
          <div className={styles.orgMeta}>{org.timezone}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <PermissionBadge perm={myPerm} />
          {myPerm >= 1 && (
            <button
              style={{
                padding: "7px 14px",
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                cursor: "pointer",
              }}
              onClick={() => navigate(`/org/${orgId}/stats`)}
            >
              📊 {t("stats.orgTitle")}
            </button>
          )}
        </div>
      </div>

      {/* Members section */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("org.detail.members")}
          <span className={styles.count}>
            {t("org.detail.membersCount", { count: members.length })}
          </span>
        </h2>
        <div className={styles.table}>
          <div className={`${styles.tableRow} ${styles.tableHeader}`}>
            <span>Name</span>
            <span>Email</span>
            <span>{t("org.detail.permissionLabel")}</span>
            {myPerm >= 3 && <span>{t("org.detail.changePermission")}</span>}
          </div>
          {members.map((m) => (
            <div key={m.id} className={styles.tableRow}>
              <span className={styles.memberName}>{m.display_name}</span>
              <span className={styles.memberEmail}>{m.email}</span>
              <span>
                <PermissionBadge perm={m.permission} />
              </span>
              {myPerm >= 3 && (
                <span className={styles.permActions}>
                  <select
                    className={styles.permSelect}
                    value={permEdits[m.id] ?? m.permission}
                    onChange={(e) =>
                      setPermEdits((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))
                    }
                  >
                    {[0, 1, 2, 3].map((p) => (
                      <option key={p} value={p}>{t(`org.detail.permission${p}`)}</option>
                    ))}
                  </select>
                  {permEdits[m.id] !== undefined && permEdits[m.id] !== m.permission && (
                    <button
                      className={styles.savePerm}
                      onClick={() => handleSavePerm(m.id)}
                    >
                      {t("org.detail.save")}
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Join requests (admin only) */}
      {myPerm >= 3 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("org.detail.pendingRequests")}</h2>
          {requests.length === 0 ? (
            <p className={styles.empty}>{t("org.detail.noRequests")}</p>
          ) : (
            <div className={styles.table}>
              <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                <span>Name</span>
                <span>Email</span>
                <span>{t("org.detail.requestedAt")}</span>
                <span></span>
              </div>
              {requests.map((r) => (
                <div key={r.id} className={styles.tableRow}>
                  <span className={styles.memberName}>{r.display_name}</span>
                  <span className={styles.memberEmail}>{r.email}</span>
                  <span className={styles.date}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  <span className={styles.reqActions}>
                    <button
                      className={styles.btnApprove}
                      onClick={() => handleApprove(r.id)}
                    >
                      {t("org.detail.approve")}
                    </button>
                    <button
                      className={styles.btnReject}
                      onClick={() => handleReject(r.id)}
                    >
                      {t("org.detail.reject")}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Class creation requests (admin only) */}
      {myPerm >= 3 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("org.detail.classRequests")}</h2>
          {classRequests.length === 0 ? (
            <p className={styles.empty}>{t("org.detail.noClassRequests")}</p>
          ) : (
            <div className={styles.table}>
              <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                <span>{t("org.detail.className")}</span>
                <span>{t("org.detail.classCode")}</span>
                <span>{t("org.detail.classOwner")}</span>
                <span></span>
              </div>
              {classRequests.map((r) => (
                <div key={r.id} className={styles.tableRow}>
                  <span className={styles.memberName}>{r.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent)" }}>
                    {org?.code}{r.code}
                  </span>
                  <span className={styles.memberEmail}>{r.owner_name}</span>
                  <span className={styles.reqActions}>
                    <button
                      className={styles.btnApprove}
                      onClick={() => handleClassApprove(r.id)}
                    >
                      {t("org.detail.approve")}
                    </button>
                    <button
                      className={styles.btnReject}
                      onClick={() => handleClassReject(r.id)}
                    >
                      {t("org.detail.reject")}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
