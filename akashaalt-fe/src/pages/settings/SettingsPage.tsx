import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSettingsStore } from "../../store/settings.store";
import { useAuthStore } from "../../store/auth.store";
import { useChatStore } from "../../store/chat.store";
import { useTheme } from "../../hooks/useTheme";

export default function SettingsPage() {
  const { serverUrl, setServerUrl } = useSettingsStore();
  const user      = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const init      = useChatStore((c) => c.init);
  const startNewChat = useChatStore((c) => c.startNewChat);
  const navigate  = useNavigate();
  const { theme, toggle } = useTheme();

  const [url,     setUrl]     = useState(serverUrl);
  const [status,  setStatus]  = useState<"idle" | "ok" | "error">("idle");
  const [testing, setTesting] = useState(false);

  const handleSave = () => {
    const trimmed = url.replace(/\/$/, "");
    setServerUrl(trimmed);
    startNewChat();
    void init();
    setStatus("idle");
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus("idle");
    try {
      const token = useAuthStore.getState().accessToken;
      const res = await fetch(
        `/api/ai/models?serverUrl=${encodeURIComponent(url.replace(/\/$/, ""))}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) }
      );
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    } finally {
      setTesting(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    startNewChat();
    navigate("/auth/login");
  };

  const card: React.CSSProperties = {
    background: "var(--bg-card)", border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 16,
  };

  return (
    <div style={{ height: "100vh", overflow: "auto", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
        borderBottom: "1px solid var(--border)", background: "var(--bg-sidebar)",
      }}>
        <Link to="/" style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
          background: "var(--bg-hover)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", color: "var(--text-secondary)",
          fontSize: 13, textDecoration: "none",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          채팅으로
        </Link>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
          설정
        </span>
        <button
          onClick={toggle}
          style={{
            padding: "6px 10px", background: "var(--bg-input)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", cursor: "pointer",
          }}
          aria-label="테마 전환"
        >
          {theme === "dark" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
      </div>

      <div style={{ maxWidth: 520, margin: "32px auto", padding: "0 20px" }}>

        {/* 계정 정보 */}
        {user && (
          <div style={card}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Akademiya 계정
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "var(--accent-dark)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, flexShrink: 0,
              }}>
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{user.displayName}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: "100%", padding: "8px 16px",
                background: "transparent", border: "1px solid var(--danger)",
                borderRadius: "var(--radius-sm)", color: "var(--danger)",
                fontSize: 13, cursor: "pointer",
              }}
            >
              로그아웃
            </button>
          </div>
        )}

        {/* LLM 서버 설정 */}
        <div style={card}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            LLM 서버 URL
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
            AkashaAlt Local Server 또는 호환 서버의 주소를 입력하세요.<br />
            예: <code style={{ background: "var(--bg-input)", padding: "1px 5px", borderRadius: 3 }}>http://192.168.1.100:11430</code>
          </p>

          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus("idle"); }}
            placeholder="http://서버IP:포트"
            style={{
              width: "100%", padding: "9px 12px", marginBottom: 12,
              background: "var(--bg-input)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13,
            }}
            spellCheck={false}
          />

          {status === "ok"    && <p style={{ fontSize: 12, color: "var(--accent)",  marginBottom: 10 }}>✓ 서버에 연결됐습니다</p>}
          {status === "error" && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>✗ 서버에 연결할 수 없습니다</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => void handleTest()}
              disabled={testing}
              style={{
                padding: "8px 16px", background: "var(--bg-input)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)", fontSize: 13, cursor: testing ? "wait" : "pointer",
              }}
            >
              {testing ? "연결 중..." : "연결 테스트"}
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "8px 20px", background: "var(--accent-dark)", color: "#fff",
                border: "none", borderRadius: "var(--radius-sm)", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent-dark)")}
            >
              저장
            </button>
          </div>
        </div>

        <div style={{
          ...card, background: "transparent",
          fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8,
        }}>
          <strong style={{ color: "var(--text-secondary)" }}>채팅 기록</strong><br />
          모든 대화는 Akademiya 서버 DB에 저장됩니다.<br />
          서버 URL은 이 기기의 브라우저에만 저장됩니다.
        </div>
      </div>
    </div>
  );
}
