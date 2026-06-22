import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../../store/chat.store";
import s from "./ChatMessages.module.css";

const ERROR_LABELS: Record<string, string> = {
  OUT_OF_MEMORY:       "메모리 부족으로 응답을 생성할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  OLLAMA_UNREACHABLE:  "Ollama에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.",
  INFERENCE_FAILED:    "응답 생성 중 오류가 발생했습니다.",
  NETWORK_ERROR:       "Local Server에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.",
  STREAM_ERROR:        "스트림 오류가 발생했습니다. 다시 시도해 주세요.",
  MODEL_NOT_FOUND:     "해당 모델을 찾을 수 없습니다.",
  QUEUE_FULL:          "서버가 바쁩니다. 잠시 후 다시 시도해 주세요.",
  CONTENT_TOO_LONG:    "메시지가 너무 깁니다. 8,000자 이하로 입력해 주세요.",
  TOO_MANY_REQUESTS:   "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

export default function ChatMessages() {
  const currentMessages  = useChatStore((c) => c.currentMessages);
  const isStreaming      = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamError      = useChatStore((s) => s.streamError);
  const messages         = currentMessages();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className={`${s.container} ${s.empty}`}>
        <p className={s.emptyTitle}>Akasha</p>
        <p className={s.emptyHint}>아래에 메시지를 입력해 대화를 시작하세요</p>
      </div>
    );
  }

  return (
    <div className={s.container}>
      {messages.map((msg, i) => (
        <div key={msg.id ?? i} className={`${s.row} ${msg.role === "user" ? s.rowUser : s.rowAssistant}`}>
          <div className={`${s.bubble} ${msg.role === "user" ? s.bubbleUser : s.bubbleAssistant}`}>
            {msg.role === "user" ? msg.content : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            )}
          </div>
        </div>
      ))}

      {isStreaming && (
        <div className={`${s.row} ${s.rowAssistant}`}>
          <div className={`${s.bubble} ${s.bubbleAssistant}`}>
            {streamingContent ? (
              <><ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown><span className={s.cursor} /></>
            ) : (
              <span className={s.cursor} />
            )}
          </div>
        </div>
      )}

      {streamError && !isStreaming && (
        <div className={s.errorRow}>
          <div className={s.errorBubble}>
            {ERROR_LABELS[streamError] ?? "오류가 발생했습니다."}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
