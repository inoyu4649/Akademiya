import { useState } from "react";
import { Link } from "react-router-dom";
import { useChatStore } from "../../store/chat.store";
import { useSettingsStore } from "../../store/settings.store";
import { useAuthStore } from "../../store/auth.store";
import { unlockVault } from "../../api/vault.api";

// API 모드 채팅 중 볼트가 잠겨 있으면(streamError === VAULT_LOCKED) 비밀번호 입력 모달을 띄운다.
export default function UnlockPasswordModal() {
  const streamError = useChatStore((s) => s.streamError);
  const mode = useSettingsStore((s) => s.mode);
  const token = useAuthStore((s) => s.accessToken);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSetup, setNotSetup] = useState(false);

  const open = mode === "api" && streamError === "VAULT_LOCKED";
  if (!open) return null;

  const close = () => {
    useChatStore.setState({ streamError: null });
    setPassword(""); setError(null); setNotSetup(false);
  };

  const handleUnlock = async () => {
    if (!token || !password) return;
    setBusy(true); setError(null);
    try {
      await unlockVault(token, password);
      setPassword("");
      useChatStore.setState({ streamError: null });
    } catch (e) {
      const code = e instanceof Error ? e.message : "SERVER_ERROR";
      if (code === "VAULT_NOT_SETUP") {
        setNotSetup(true);
      } else if (code === "WRONG_PASSWORD") {
        setError("비밀번호가 올바르지 않습니다.");
      } else {
        setError("잠금 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        width: 380, maxWidth: "100%", background: "var(--bg-card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 24,
      }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 10 }}>
          🔒 API 비밀번호 필요
        </p>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 18, lineHeight: 1.6 }}>
          AkashaAlt는 사용자의 보안을 최우선시해서 번거롭지만 비밀번호를 입력 바랍니다.
        </p>

        {notSetup ? (
          <>
            <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 16 }}>
              아직 AkashaAlt API 비밀번호가 설정되지 않았습니다. 설정에서 먼저 등록해 주세요.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={close} style={btnGhost}>닫기</button>
              <Link to="/settings" onClick={close} style={{ ...btnPrimary, flex: 1, textAlign: "center", textDecoration: "none", display: "inline-block" }}>
                설정으로 이동
              </Link>
            </div>
          </>
        ) : (
          <>
            {error && <p style={{ fontSize: 12, color: "var(--danger)", marginBottom: 10 }}>{error}</p>}
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleUnlock(); }}
              placeholder="AkashaAlt API 비밀번호"
              style={{
                width: "100%", padding: "9px 12px", marginBottom: 14,
                background: "var(--bg-input)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13,
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={close} style={btnGhost}>취소</button>
              <button onClick={() => void handleUnlock()} disabled={busy || !password} style={btnPrimary}>
                {busy ? "확인 중..." : "잠금 해제"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  flex: 1, padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  flex: 1, padding: "8px 12px", background: "var(--accent-dark)", color: "#fff", border: "none",
  borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
