import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notificationApi, type Notification } from "../../api/notification.api";
import { pushApi } from "../../api/push.api";
import PwaInstallModal from "./PwaInstallModal";
import styles from "./NotificationBell.module.css";

// ── 상대 시간 포맷 ────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return "방금 전";
  if (min < 60)  return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr  < 24)  return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7)   return `${day}일 전`;
  return new Date(dateStr).toLocaleDateString();
}

// ── 알림 타입별 뱃지 아이콘 ───────────────────────────────────────────────────
function TypeBadge({ type }: { type: Notification["type"] }) {
  const { t } = useTranslation();
  const labelKey = `notification.type.${type}` as const;
  const classMap: Record<Notification["type"], string> = {
    new_assignment: styles.badgeNew,
    deadline_1d:    styles.badgeDeadline,
    deadline_3h:    styles.badgeDeadline,
    deadline_1h:    styles.badgeUrgent,
    deadline_10m:   styles.badgeUrgent,
    broadcast:      styles.badgeBroadcast,
    org_rejected:   styles.badgeSystem,
    class_rejected: styles.badgeSystem,
    new_survey:     styles.badgeNew,
    org_kicked:     styles.badgeUrgent,
    class_kicked:   styles.badgeUrgent,
  };
  return (
    <span className={`${styles.badge} ${classMap[type]}`}>
      {t(labelKey)}
    </span>
  );
}

// ── 종 아이콘 SVG ─────────────────────────────────────────────────────────────
function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ── NotificationBell 컴포넌트 ─────────────────────────────────────────────────
export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [open, setOpen]                   = useState(false);
  const [dropStyle, setDropStyle]         = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // 푸시 알림 상태
  const [isPwa, setIsPwa]         = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading]     = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // 알림 목록 조회
  const fetchNotifications = useCallback(async () => {
    try {
      const data = await notificationApi.list();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // 조용히 무시 (로그인 직후 토큰 준비 전일 수 있음)
    }
  }, []);

  // 마운트 시 + 60초 폴링
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // PWA 여부 + 푸시 지원 여부 + 현재 구독 상태 확인
  useEffect(() => {
    const pwa =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsPwa(pwa);

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // 인자 없이 호출해야 현재 페이지 scope로 등록된 SW를 올바르게 찾는다.
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    }).catch(() => { /* ignore */ });
  }, []);

  async function handleTogglePush() {
    if (pushLoading) return;
    // PWA가 아닌 경우: 설치 안내 모달 표시
    if (!isPwa) {
      setOpen(false);
      setShowInstallModal(true);
      return;
    }
    setPushLoading(true);
    try {
      if (pushEnabled) {
        // OFF: 구독 해제
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await pushApi.unsubscribe(sub.endpoint).catch(() => { /* ignore */ });
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        // ON: 권한 요청 → 구독 → 백엔드 저장
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const existing = await navigator.serviceWorker.getRegistration();
        if (!existing) {
          await navigator.serviceWorker.register("/sw.js");
        }
        // ready는 항상 active 상태의 registration을 반환한다.
        // register() 직후에는 installing 상태일 수 있으므로
        // ready 반환값으로 pushManager를 사용해야 subscribe가 정상 동작한다.
        const activeReg = await navigator.serviceWorker.ready;
        const publicKey = await pushApi.getVapidPublicKey();
        const sub = await activeReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });
        await pushApi.subscribe(sub.toJSON());
        setPushEnabled(true);
      }
    } catch {
      /* ignore — 사용자가 권한 거부하거나 서버 오류 */
    } finally {
      setPushLoading(false);
    }
  }

  // 드롭다운 열릴 때 읽음 처리 (mark-all) 대신, 드롭다운에서 직접 클릭 시만 읽음 처리

  // 드롭다운 열릴 때 position: fixed 좌표 계산 (sidebar overflow:hidden 우회)
  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropW = Math.min(320, window.innerWidth - 16);
      // 버튼 오른쪽 끝에 맞추되, 왼쪽이 8px 이상 남도록 clamp
      const left = Math.max(8, Math.min(rect.right - dropW, window.innerWidth - dropW - 8));
      setDropStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left,
        width: dropW,
      });
    }
  }, [open]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // 알림 클릭: 읽음 처리(fire & forget) + 링크 이동
  // - 외부 URL(http/https): 새 탭으로 열기
  // - 내부 경로: navigate()
  // - 링크 없음: 무반응
  function handleNotifClick(notif: Notification) {
    setOpen(false);

    // 읽음 처리 — navigation을 막지 않도록 fire & forget
    if (!notif.is_read) {
      notificationApi.markRead(notif.id)
        .then(() => {
          setNotifications(prev =>
            prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n)
          );
          setUnreadCount(prev => Math.max(0, prev - 1));
        })
        .catch(() => { /* ignore */ });
    }

    if (!notif.link) return;
    const isExternal = /^https?:\/\//.test(notif.link);
    if (isExternal) {
      window.open(notif.link, "_blank", "noopener,noreferrer");
    } else {
      navigate(notif.link);
    }
  }

  // 전체 읽음
  async function handleMarkAllRead() {
    try {
      await notificationApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }

  // 알림 단일 삭제
  function handleDeleteNotif(e: React.MouseEvent, id: number) {
    e.stopPropagation(); // 카드 클릭(navigate) 방지
    notificationApi.deleteOne(id)
      .then(() => {
        setNotifications(prev => {
          const removed = prev.find(n => n.id === id);
          if (removed && !removed.is_read) {
            setUnreadCount(c => Math.max(0, c - 1));
          }
          return prev.filter(n => n.id !== id);
        });
      })
      .catch(() => { /* ignore */ });
  }

  return (
    <div className={styles.container} ref={containerRef}>
      {/* 종 버튼 */}
      <button
        className={styles.bellBtn}
        onClick={() => setOpen(o => !o)}
        title={t("notification.title")}
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className={styles.badge2}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 — position:fixed로 sidebar overflow:hidden 우회 */}
      {open && (
        <div className={styles.dropdown} style={dropStyle}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>{t("notification.title")}</span>
            <div className={styles.headerRight}>
              {unreadCount > 0 && (
                <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                  {t("notification.markAllRead")}
                </button>
              )}
              <button
                className={`${styles.pushToggle} ${pushEnabled ? styles.pushToggleOn : ""}`}
                onClick={handleTogglePush}
                disabled={pushLoading}
              >
                {pushLoading
                  ? "..."
                  : pushEnabled
                  ? t("notification.pushOn")
                  : t("notification.pushOff")}
              </button>
            </div>
          </div>

          <div className={styles.list}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>{t("notification.empty")}</div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  className={`${styles.item} ${!notif.is_read ? styles.itemUnread : ""}`}
                  onClick={() => handleNotifClick(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && handleNotifClick(notif)}
                >
                  <div className={styles.itemTop}>
                    <TypeBadge type={notif.type} />
                    <span className={styles.itemTime}>{timeAgo(notif.created_at)}</span>
                    <button
                      className={styles.deleteBtn}
                      onClick={e => handleDeleteNotif(e, notif.id)}
                      title={t("notification.delete")}
                      aria-label={t("notification.delete")}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.itemTitle}>{notif.title}</div>
                  {notif.body && (
                    <div className={styles.itemBody}>{notif.body}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* PWA 설치 안내 모달 (비 PWA 모드에서 알림 버튼 클릭 시) */}
      {showInstallModal && (
        <PwaInstallModal onClose={() => setShowInstallModal(false)} />
      )}
    </div>
  );
}
