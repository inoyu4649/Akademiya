import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "../../store/chat.store";
import { useSettingsStore } from "../../store/settings.store";
import ModelPicker from "./ModelPicker";
import PricingBanner from "./PricingBanner";
import s from "./ChatInput.module.css";

const MAX_LEN  = 8000;
const WARN_LEN = 7000;

export default function ChatInput() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming     = useChatStore((c) => c.isStreaming);
  const sendMessage     = useChatStore((c) => c.sendMessage);
  const availableModels = useChatStore((c) => c.availableModels);
  const selectedModel   = useChatStore((c) => c.selectedModel);
  const setModel        = useChatStore((c) => c.setModel);
  const mode            = useSettingsStore((s) => s.mode);
  const apiProvider     = useSettingsStore((s) => s.apiProvider);

  const tooLong   = text.length > MAX_LEN;
  const nearLimit = text.length >= WARN_LEN;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  const handleSubmit = useCallback(() => {
    if (!text.trim() || isStreaming || tooLong) return;
    void sendMessage(text);
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, isStreaming, tooLong, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const selectedInfo = availableModels.find((m) => m.modelId === selectedModel);

  return (
    <div className={s.wrapper}>
      {/* 모델 선택 */}
      <div className={s.modelRow}>
        <span className={s.modelLabel}>모델</span>
        {mode === "api" ? (
          <>
            <ModelPicker
              provider={apiProvider}
              value={selectedModel}
              onChange={setModel}
              disabled={isStreaming}
            />
            <PricingBanner provider={apiProvider} modelId={selectedModel} />
          </>
        ) : (
          <>
            <select
              className={s.modelSelect}
              value={selectedModel}
              onChange={(e) => setModel(e.target.value)}
              disabled={isStreaming}
            >
              {availableModels.length === 0 && <option value="">서버에 연결 중...</option>}
              {availableModels.map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {m.displayName}{m.unlimited ? " (무제한)" : ""}
                </option>
              ))}
            </select>
            {selectedInfo && !selectedInfo.unlimited && (
              <span className={s.modelCost}>{selectedInfo.creditCost}cr</span>
            )}
          </>
        )}
      </div>

      {/* 입력 */}
      <div className={s.inputRow}>
        <textarea
          ref={textareaRef}
          className={`${s.textarea} ${tooLong ? s.textareaError : ""}`}
          placeholder="메시지를 입력하세요 (Shift+Enter로 줄바꿈)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={1}
        />
        <button
          className={s.submitBtn}
          onClick={handleSubmit}
          disabled={!text.trim() || isStreaming || tooLong}
          aria-label="전송"
        >
          {isStreaming ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="4" height="12" rx="1" /><rect x="14" y="6" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      <div className={s.hintRow}>
        <p className={s.hint}>Enter 전송 · Shift+Enter 줄바꿈</p>
        {nearLimit && (
          <span className={`${s.charCount} ${tooLong ? s.charCountError : s.charCountWarn}`}>
            {text.length} / {MAX_LEN}
          </span>
        )}
      </div>
    </div>
  );
}
