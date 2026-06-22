import { useState } from "react";
import { Link } from "react-router-dom";
import { useSettingsStore } from "../../store/settings.store";
import { useChatStore } from "../../store/chat.store";
import { useTheme } from "../../hooks/useTheme";

export default function SettingsPage() {
  const { serverUrl, setServerUrl } = useSettingsStore();
  const init        = useChatStore((c) => c.init);
  const startNewChat = useChatStore((c) => c.startNewChat);
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
      const res = await fetch(`${url.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(5_000) });
      setStatus(res.ok ? "ok" : "error");
    } catch {
      setStatus("error");
    } finally {
      setTesting(false);
    }
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
          서버 설정
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
        <div style={card}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            Akasha Local Server URL
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
            AkashaAlt 설치 스크립트로 설치된 로컬 서버 주소를 입력하세요.<br />
            같은 PC라면 기본값(localhost:11430)을 그대로 사용하세요.
          </p>

          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus("idle"); }}
            placeholder="비워두면 현재 서버 주소 사용 (기본값) · 외부 서버: http://192.168.x.x:11430"
            style={{
              width: "100%", padding: "9px 12px", marginBottom: 12,
              background: "var(--bg-input)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13,
            }}
            spellCheck={false}
          />

          {status === "ok" && (
            <p style={{ fontSize: 12, color: "var(--accent)", marginBottom: 10 }}>✓ 서버에 연결됐습니다</p>
          )}
          {status === "error" && (
            <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>✗ 서버에 연결할 수 없습니다</p>
          )}

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
          <strong style={{ color: "var(--text-secondary)" }}>Local Server 설치 방법</strong><br />
          Windows: <code style={{ background: "var(--bg-input)", padding: "1px 5px", borderRadius: 3 }}>install.ps1</code> 실행<br />
          macOS/Linux: <code style={{ background: "var(--bg-input)", padding: "1px 5px", borderRadius: 3 }}>install.sh</code> 실행<br />
          <br />
          <strong style={{ color: "var(--text-secondary)" }}>같은 LAN의 다른 PC에서 접속하려면</strong><br />
          서버 PC의 IP 주소 + 포트를 입력하세요 (예: http://192.168.1.5:11430)
        </div>
      </div>
    </div>
  );
}
