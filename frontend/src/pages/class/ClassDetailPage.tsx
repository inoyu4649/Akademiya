import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { classApi, type ClassDetail, type ClassMember, type ClassJoinRequest } from "../../api/class.api";
import { notificationApi } from "../../api/notification.api";
import { surveyApi, type Survey } from "../../api/survey.api";
import ReportModal from "../report/ReportModal";
import styles from "./ClassDetailPage.module.css";

function RoleBadge({ perm }: { perm: number }) {
  const { t } = useTranslation();
  return (
    <span className={`${styles.roleBadge} ${perm >= 1 ? styles.leader : styles.student}`}>
      {t(perm >= 1 ? "class.detail.permLeader" : "class.detail.permStudent")}
    </span>
  );
}

export default function ClassDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const classId = Number(id);

  const [cls, setCls]         = useState<ClassDetail | null>(null);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [myPerm, setMyPerm]   = useState(0);
  const [requests, setRequests] = useState<ClassJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState("");
  const [permEdits, setPermEdits] = useState<Record<number, number>>({});
  const [reportTarget, setReportTarget] = useState<{ id: number; name: string } | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [bcTitle, setBcTitle]   = useState("");
  const [bcBody, setBcBody]     = useState("");
  const [bcLink, setBcLink]     = useState("");
  const [bcLoading, setBcLoading] = useState(false);

  useEffect(() => {
    if (!classId) { navigate("/classes"); return; }
    classApi
      .detail(classId)
      .then(async (res) => {
        setCls(res.data.class);
        setMembers(res.data.members);
        setMyPerm(res.data.myPermission);
        if (res.data.myPermission >= 1) {
          const reqRes = await classApi.joinRequests(classId);
          setRequests(reqRes.data.requests);
        }
      })
      .catch(() => navigate("/classes"))
      .finally(() => setLoading(false));
    // 반 설문 로드
    surveyApi.byClass(classId).then((d) => setSurveys(d.surveys)).catch(() => {});
  }, [classId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function handleApprove(reqId: number) {
    await classApi.approveRequest(classId, reqId);
    setRequests((prev) => prev.filter((r) => r.id !== reqId));
    const res = await classApi.detail(classId);
    setMembers(res.data.members);
    showToast(t("class.detail.approveSuccess"));
  }

  async function handleReject(reqId: number) {
    await classApi.rejectRequest(classId, reqId);
    setRequests((prev) => prev.filter((r) => r.id !== reqId));
    showToast(t("class.detail.rejectSuccess"));
  }

  async function handleSavePerm(userId: number) {
    const newPerm = permEdits[userId];
    if (newPerm === undefined) return;
    await classApi.updatePermission(classId, userId, newPerm);
    setMembers((prev) =>
      prev.map((m) => (m.id === userId ? { ...m, permission: newPerm } : m))
    );
    setPermEdits((prev) => { const n = { ...prev }; delete n[userId]; return n; });
    showToast(t("class.detail.permissionSaved"));
  }

  async function handleLeave() {
    setLeaveLoading(true);
    try {
      await classApi.leave(classId);
      navigate("/classes");
    } catch (err: unknown) {
      setLeaveConfirm(false);
      const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "";
      if (code === "class.leave.lastLeader") showToast(t("class.leave.lastLeader"));
      else showToast(t("class.leave.serverError"));
    } finally {
      setLeaveLoading(false);
    }
  }

  async function handleBroadcast() {
    if (!bcTitle.trim()) { showToast(t("notification.broadcast.missingFields")); return; }
    setBcLoading(true);
    try {
      await notificationApi.broadcast({ title: bcTitle.trim(), body: bcBody.trim() || undefined, link: bcLink.trim() || undefined, scope: "class", scope_id: classId });
      showToast(t("notification.broadcast.success"));
      setBroadcastOpen(false);
      setBcTitle(""); setBcBody(""); setBcLink("");
    } catch {
      showToast(t("notification.broadcast.serverError"));
    } finally {
      setBcLoading(false);
    }
  }

  if (loading) return <div className={styles.loading}>{t("common.loading")}</div>;
  if (!cls) return null;

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* 반 탈퇴 확인 모달 */}
      {leaveConfirm && (
        <div className={styles.modalOverlay} onClick={() => setLeaveConfirm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>⚠ {t("class.leave.title")}</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
              {t("class.leave.warning", { name: cls?.name })}
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setLeaveConfirm(false)}>
                {t("common.cancel")}
              </button>
              <button className={styles.btnDanger} onClick={handleLeave} disabled={leaveLoading}>
                {leaveLoading ? t("common.loading") : t("class.leave.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast modal */}
      {broadcastOpen && (
        <div className={styles.modalOverlay} onClick={() => setBroadcastOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{t("notification.broadcast.title")}</h3>
            <label className={styles.fieldLabel}>{t("notification.broadcast.titleLabel")}</label>
            <input
              className={styles.input}
              value={bcTitle}
              onChange={(e) => setBcTitle(e.target.value)}
              placeholder={t("notification.broadcast.titlePlaceholder")}
              maxLength={300}
            />
            <label className={styles.fieldLabel}>{t("notification.broadcast.bodyLabel")}</label>
            <textarea
              className={styles.textarea}
              value={bcBody}
              onChange={(e) => setBcBody(e.target.value)}
              placeholder={t("notification.broadcast.bodyPlaceholder")}
              rows={3}
            />
            <label className={styles.fieldLabel}>{t("notification.broadcast.linkLabel")}</label>
            <input
              className={styles.input}
              value={bcLink}
              onChange={(e) => setBcLink(e.target.value)}
              placeholder={t("notification.broadcast.linkPlaceholder")}
            />
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setBroadcastOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className={styles.btnConfirm} onClick={handleBroadcast} disabled={bcLoading}>
                {bcLoading ? t("common.loading") : t("notification.broadcast.submitBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportTarget && cls && (
        <ReportModal
          reportedId={reportTarget.id}
          reportedName={reportTarget.name}
          classId={classId}
          orgId={cls.org_id}
          onClose={() => setReportTarget(null)}
          onSuccess={() => { setReportTarget(null); showToast(t("report.submitSuccess")); }}
        />
      )}

      {/* Header */}
      <div className={styles.header}>
        <div>
          <div className={styles.compositeCode}>
            <span className={styles.orgCodePart}>{cls.org_code}</span>
            <span className={styles.classCodePart}>{cls.code}</span>
          </div>
          <h1 className={styles.className}>{cls.name}</h1>
          <div className={styles.orgLabel}>{cls.org_name}</div>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.btnAssignments}
            onClick={() => navigate(`/classes/${classId}/resources`)}
          >
            📁 {t("resource.nav")}
          </button>
          <button
            className={styles.btnAssignments}
            onClick={() => navigate(`/classes/${classId}/assignments`)}
          >
            📋 {t("assignment.list.title")}
          </button>
          {myPerm >= 1 && (
            <button
              className={styles.btnAssignments}
              onClick={() => navigate(`/classes/${classId}/stats`)}
            >
              📊 {t("stats.classTitle")}
            </button>
          )}
          {myPerm >= 1 && (
            <button
              className={styles.btnBroadcast}
              onClick={() => setBroadcastOpen(true)}
            >
              📢 {t("notification.broadcast.title")}
            </button>
          )}
          <RoleBadge perm={myPerm} />
          <button className={styles.btnLeave} onClick={() => setLeaveConfirm(true)}>
            {t("class.leave.btn")}
          </button>
        </div>
      </div>

      {/* Members */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t("class.detail.members")}
          <span className={styles.count}>
            {t("class.detail.membersCount", { count: members.length })}
          </span>
        </h2>
        <div className={styles.table}>
          <div className={`${styles.tableRow} ${styles.tableHeader}`}>
            <span>Name</span>
            <span>Email</span>
            <span>{t("class.detail.roleLabel")}</span>
            {myPerm >= 1 && <span></span>}
          </div>
          {members.map((m) => (
            <div key={m.id} className={styles.tableRow}>
              <span className={styles.memberName}>{m.display_name}</span>
              <span className={styles.memberEmail}>{m.email}</span>
              <span>
                {myPerm >= 1 && m.id !== currentUser?.id ? (
                  <span className={styles.permActions}>
                    <select
                      className={styles.permSelect}
                      value={permEdits[m.id] ?? m.permission}
                      onChange={(e) =>
                        setPermEdits((prev) => ({ ...prev, [m.id]: Number(e.target.value) }))
                      }
                    >
                      <option value={0}>{t("class.detail.permStudent")}</option>
                      <option value={1}>{t("class.detail.permLeader")}</option>
                    </select>
                    {permEdits[m.id] !== undefined && permEdits[m.id] !== m.permission && (
                      <button className={styles.saveBtn} onClick={() => handleSavePerm(m.id)}>
                        {t("common.save")}
                      </button>
                    )}
                  </span>
                ) : (
                  <RoleBadge perm={m.permission} />
                )}
              </span>
              {myPerm >= 1 && (
                <span>
                  {m.id !== currentUser?.id && (
                    <button
                      className={styles.reportBtn}
                      onClick={() => setReportTarget({ id: m.id, name: m.display_name })}
                    >
                      {t("report.reportBtn")}
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 진행 중인 설문 */}
      {surveys.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("survey.activeSurveys")}</h2>
          <div className={styles.surveyList}>
            {surveys.map((s) => (
              <div
                key={s.id}
                className={styles.surveyItem}
                onClick={() => navigate(`/surveys/${s.id}`)}
              >
                <span className={styles.surveyTitle}>{s.title}</span>
                {s.already_responded ? (
                  <span className={styles.surveyResponded}>{t("survey.responded")}</span>
                ) : (
                  <span className={styles.surveyPending}>{t("survey.notResponded")}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Join requests (leader only) */}
      {myPerm >= 1 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("class.detail.pendingRequests")}</h2>
          {requests.length === 0 ? (
            <p className={styles.empty}>{t("class.detail.noRequests")}</p>
          ) : (
            <div className={styles.table}>
              <div className={`${styles.tableRow} ${styles.tableHeader}`}>
                <span>Name</span>
                <span>Email</span>
                <span>{t("class.detail.requestedAt")}</span>
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
                    <button className={styles.btnApprove} onClick={() => handleApprove(r.id)}>
                      {t("class.detail.approve")}
                    </button>
                    <button className={styles.btnReject} onClick={() => handleReject(r.id)}>
                      {t("class.detail.reject")}
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
