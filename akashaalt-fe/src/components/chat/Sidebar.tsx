import { Link } from "react-router-dom";
import { useChatStore } from "../../store/chat.store";
import s from "./Sidebar.module.css";

function formatDate(iso: string) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7)   return d.toLocaleDateString("ko-KR", { weekday: "short" });
  return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function Sidebar() {
  const conversations    = useChatStore((c) => c.conversations);
  const currentConvId    = useChatStore((c) => c.currentConvId);
  const loadConversation = useChatStore((c) => c.loadConversation);
  const startNewChat     = useChatStore((c) => c.startNewChat);
  const deleteConv       = useChatStore((c) => c.deleteConversation);
  const setSidebarOpen   = useChatStore((c) => c.setSidebarOpen);

  // 사이드바는 모바일(≤768px)에서만 오버레이로 열고 닫힘 — PC/태블릿에서는 항상 펼쳐진 고정 컬럼이므로
  // 대화 진입 시 접으면 안 됨(AppLayout.module.css의 768px 브레이크포인트와 동일하게 유지)
  const isMobileViewport = () => window.matchMedia("(max-width: 768px)").matches;

  const handleLoad = (id: number) => {
    void loadConversation(id);
    if (isMobileViewport()) setSidebarOpen(false);
  };
  const handleDel  = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("대화를 삭제할까요?")) void deleteConv(id);
  };

  return (
    <div className={s.sidebar}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.logo}>Akasha</div>
        <button className={s.newChatBtn} onClick={() => { startNewChat(); if (isMobileViewport()) setSidebarOpen(false); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          새 대화
        </button>
      </div>

      {/* 대화 목록 */}
      <div className={s.list}>
        {conversations.length === 0 ? (
          <p className={s.listEmpty}>대화 내역이 없습니다</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`${s.convItem} ${conv.id === currentConvId ? s.convItemActive : ""}`}
              onClick={() => handleLoad(conv.id)}
            >
              <span className={s.convTitle}>{conv.title}</span>
              <span className={s.convDate}>{formatDate(conv.updated_at)}</span>
              <button className={s.deleteBtn} onClick={(e) => handleDel(e, conv.id)} aria-label="삭제">×</button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className={s.footer}>
        <Link
          to="/settings"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 10px", marginBottom: 4,
            background: "var(--bg-hover)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--text-secondary)",
            fontSize: 12, textDecoration: "none",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          서버 설정
        </Link>
        <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          대화 내역이 서버에 저장됩니다
        </p>
      </div>
    </div>
  );
}
