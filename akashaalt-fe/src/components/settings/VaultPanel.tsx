import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/auth.store";
import { useSettingsStore, type AiProvider } from "../../store/settings.store";
import { useChatStore } from "../../store/chat.store";
import {
  getVaultStatus, setupVault, unlockVault, lockVault,
  saveProviderKey, deleteProviderKey, requestVaultCode,
  changeVaultPassword, resetVault, type VaultStatus,
} from "../../api/vault.api";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openrouter: "OpenRouter",
  openai:     "OpenAI (GPT)",
  gemini:     "Google Gemini",
  anthropic:  "Anthropic (Claude)",
};

const ERROR_LABELS: Record<string, string> = {
  PASSWORD_TOO_SHORT:      "비밀번호는 8자 이상이어야 합니다.",
  VAULT_ALREADY_EXISTS:    "이미 API 비밀번호가 설정되어 있습니다.",
  VAULT_NOT_SETUP:         "먼저 API 비밀번호를 설정해 주세요.",
  WRONG_PASSWORD:          "비밀번호가 올바르지 않습니다.",
  INVALID_OR_EXPIRED_CODE: "인증코드가 올바르지 않거나 만료되었습니다.",
  MISSING_FIELDS:          "모든 항목을 입력해 주세요.",
  DECRYPTION_FAILED:       "기존 API Key 복호화에 실패했습니다.",
};

function errMsg(e: unknown): string {
  const code = e instanceof Error ? e.message : "SERVER_ERROR";
  return ERROR_LABELS[code] ?? `오류가 발생했습니다 (${code})`;
}

const card: React.CSSProperties = {
  background: "var(--bg-card)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)", padding: 24, marginBottom: 16,
};
const input: React.CSSProperties = {
  width: "100%", padding: "9px 12px", marginBottom: 10,
  background: "var(--bg-input)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: 13,
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", background: "var(--accent-dark)", color: "#fff",
  border: "none", borderRadius: "var(--radius-sm)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "8px 16px", background: "var(--bg-input)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  padding: "6px 12px", background: "transparent", border: "1px solid var(--danger)",
  borderRadius: "var(--radius-sm)", color: "var(--danger)", fontSize: 12, cursor: "pointer",
};
const errText: React.CSSProperties = { fontSize: 12, color: "var(--danger)", marginBottom: 10 };
const okText: React.CSSProperties = { fontSize: 12, color: "var(--accent)", marginBottom: 10 };

export default function VaultPanel() {
  const token = useAuthStore((s) => s.accessToken);
  const apiProvider = useSettingsStore((s) => s.apiProvider);
  const setApiProvider = useSettingsStore((s) => s.setApiProvider);
  const chatInit = useChatStore((c) => c.init);

  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [unlockPw, setUnlockPw] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");

  const [showChangePw, setShowChangePw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [code, setCode] = useState("");

  const refresh = async () => {
    if (!token) return;
    try {
      setStatus(await getVaultStatus(token));
    } catch (e) {
      setError(errMsg(e));
    }
  };

  useEffect(() => { void refresh(); }, [token]);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setOkMsg(null);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSetup = () => wrap(async () => {
    if (!token) return;
    if (pw1.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (pw1 !== pw2) { setError("비밀번호가 일치하지 않습니다."); return; }
    await setupVault(token, pw1);
    setPw1(""); setPw2("");
    setOkMsg("AkashaAlt API 비밀번호가 설정되었습니다.");
    await refresh();
  });

  const handleUnlock = () => wrap(async () => {
    if (!token) return;
    await unlockVault(token, unlockPw);
    setUnlockPw("");
    setOkMsg("잠금이 해제되었습니다.");
    await refresh();
  });

  const handleLock = () => wrap(async () => {
    if (!token) return;
    await lockVault(token);
    await refresh();
  });

  const handleSaveKey = () => wrap(async () => {
    if (!token || !apiKeyInput.trim()) return;
    await saveProviderKey(token, apiProvider, apiKeyInput.trim());
    setApiKeyInput("");
    setOkMsg(`${PROVIDER_LABELS[apiProvider]} API Key가 저장되었습니다.`);
    await refresh();
    void chatInit();
  });

  const handleDeleteKey = (provider: AiProvider) => wrap(async () => {
    if (!token) return;
    await deleteProviderKey(token, provider);
    setOkMsg(`${PROVIDER_LABELS[provider]} API Key가 삭제되었습니다.`);
    await refresh();
  });

  const handleRequestCode = () => wrap(async () => {
    if (!token) return;
    await requestVaultCode(token);
    setCodeSent(true);
    setOkMsg("인증코드를 이메일로 발송했습니다.");
  });

  const handleChangePassword = () => wrap(async () => {
    if (!token) return;
    if (newPw.length < 8) { setError("새 비밀번호는 8자 이상이어야 합니다."); return; }
    await changeVaultPassword(token, curPw, newPw, code);
    setCurPw(""); setNewPw(""); setCode(""); setCodeSent(false); setShowChangePw(false);
    setOkMsg("비밀번호가 변경되었습니다. 기존 API Key는 그대로 유지됩니다.");
    await refresh();
  });

  const handleReset = () => wrap(async () => {
    if (!token) return;
    if (newPw.length < 8) { setError("새 비밀번호는 8자 이상이어야 합니다."); return; }
    await resetVault(token, newPw, code);
    setNewPw(""); setCode(""); setCodeSent(false); setShowForgot(false);
    setOkMsg("비밀번호가 초기화되었습니다. 기존에 등록된 API Key는 모두 삭제되어 다시 등록해야 합니다.");
    await refresh();
  });

  if (!status) return null;

  return (
    <>
      {/* Provider 선택 */}
      <div style={card}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
          AI Provider
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>
          사용할 AI 서비스를 선택하세요. API Key는 아래에서 암호화하여 등록합니다.
        </p>
        <select
          value={apiProvider}
          onChange={(e) => { setApiProvider(e.target.value as AiProvider); setOkMsg(null); setError(null); }}
          style={{ ...input, marginBottom: 0 }}
        >
          {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]} {status.providers.includes(p) ? "✓ 등록됨" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* 볼트 상태별 UI */}
      <div style={card}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
          AkashaAlt API 비밀번호
        </p>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
          Akademiya 로그인 비밀번호와는 <strong>다른, 별도의 비밀번호</strong>입니다.<br />
          이 비밀번호로 API Key를 암호화하며, 서버는 평문 API Key와 이 비밀번호를 영구 저장하지 않습니다.<br />
          <strong>비밀번호를 잊으면 기존에 등록한 API Key는 복구할 수 없습니다</strong> (다시 등록 필요).
        </p>

        {error && <p style={errText}>{error}</p>}
        {okMsg && <p style={okText}>{okMsg}</p>}

        {!status.hasVault && (
          <>
            <input type="password" placeholder="새 API 비밀번호 (8자 이상)" value={pw1}
              onChange={(e) => setPw1(e.target.value)} style={input} />
            <input type="password" placeholder="비밀번호 확인" value={pw2}
              onChange={(e) => setPw2(e.target.value)} style={input} />
            <button style={btnPrimary} disabled={busy} onClick={() => void handleSetup()}>
              비밀번호 설정
            </button>
          </>
        )}

        {status.hasVault && !status.unlocked && (
          <>
            <input type="password" placeholder="API 비밀번호 입력" value={unlockPw}
              onChange={(e) => setUnlockPw(e.target.value)} style={input} />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button style={btnPrimary} disabled={busy || !unlockPw} onClick={() => void handleUnlock()}>
                잠금 해제
              </button>
              <button style={btnGhost} onClick={() => { setShowForgot(!showForgot); setShowChangePw(false); }}>
                비밀번호를 잊으셨나요?
              </button>
            </div>
          </>
        )}

        {status.hasVault && status.unlocked && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btnGhost} disabled={busy} onClick={() => void handleLock()}>잠그기</button>
            <button style={btnGhost} onClick={() => { setShowChangePw(!showChangePw); setShowForgot(false); }}>
              비밀번호 변경
            </button>
          </div>
        )}

        {/* 비밀번호 변경 (현재 비밀번호를 아는 경우, 이메일 인증코드 필요) */}
        {showChangePw && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
              이메일로 받은 인증코드와 현재 비밀번호로 변경합니다. 기존 API Key는 유지됩니다.
            </p>
            <button style={btnGhost} disabled={busy} onClick={() => void handleRequestCode()}>
              {codeSent ? "인증코드 재발송" : "인증코드 발송"}
            </button>
            <input type="password" placeholder="현재 비밀번호" value={curPw}
              onChange={(e) => setCurPw(e.target.value)} style={{ ...input, marginTop: 10 }} />
            <input type="password" placeholder="새 비밀번호 (8자 이상)" value={newPw}
              onChange={(e) => setNewPw(e.target.value)} style={input} />
            <input type="text" placeholder="이메일 인증코드" value={code}
              onChange={(e) => setCode(e.target.value)} style={input} />
            <button style={btnPrimary} disabled={busy || !curPw || !newPw || !code}
              onClick={() => void handleChangePassword()}>
              비밀번호 변경 적용
            </button>
          </div>
        )}

        {/* 비밀번호 찾기 (복구 아님 — 초기화, 기존 키 삭제됨) */}
        {showForgot && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 13, color: "var(--danger)", marginBottom: 10 }}>
              ⚠️ 이메일 인증만으로 초기화하면 기존에 암호화 저장된 API Key는 복구 불가능하며 전부 삭제됩니다.
            </p>
            <button style={btnGhost} disabled={busy} onClick={() => void handleRequestCode()}>
              {codeSent ? "인증코드 재발송" : "인증코드 발송"}
            </button>
            <input type="password" placeholder="새 비밀번호 (8자 이상)" value={newPw}
              onChange={(e) => setNewPw(e.target.value)} style={{ ...input, marginTop: 10 }} />
            <input type="text" placeholder="이메일 인증코드" value={code}
              onChange={(e) => setCode(e.target.value)} style={input} />
            <button style={btnPrimary} disabled={busy || !newPw || !code} onClick={() => void handleReset()}>
              비밀번호 초기화 (기존 키 삭제됨)
            </button>
          </div>
        )}
      </div>

      {/* API Key 등록 (언락 상태에서만) */}
      {status.hasVault && status.unlocked && (
        <div style={card}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            {PROVIDER_LABELS[apiProvider]} API Key
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
            {status.providers.includes(apiProvider)
              ? "이미 등록되어 있습니다. 새 값을 입력하면 교체됩니다."
              : "API Key를 입력하면 암호화하여 저장합니다."}
          </p>
          <input type="password" placeholder="API Key 붙여넣기" value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)} style={input} spellCheck={false} />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnPrimary} disabled={busy || !apiKeyInput.trim()} onClick={() => void handleSaveKey()}>
              저장
            </button>
            {status.providers.includes(apiProvider) && (
              <button style={btnDanger} disabled={busy} onClick={() => void handleDeleteKey(apiProvider)}>
                이 Provider 키 삭제
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
