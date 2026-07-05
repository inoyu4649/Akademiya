import { useEffect, useRef, type ComponentPropsWithoutRef, type ReactElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../../store/chat.store";
import CollapsibleBlock from "./CollapsibleBlock";
import s from "./ChatMessages.module.css";

// <think>...</think> 추론 블록을 일반 텍스트와 분리 — 스트리밍 중 아직 닫히지 않은 태그도 처리
interface ContentPart { type: "text" | "think"; content: string }

function parseThinkBlocks(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const closed = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = closed.exec(content))) {
    if (match.index > lastIndex) parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    parts.push({ type: "think", content: match[1] });
    lastIndex = closed.lastIndex;
  }
  const rest = content.slice(lastIndex);
  const openIdx = rest.indexOf("<think>");
  if (openIdx !== -1) {
    if (openIdx > 0) parts.push({ type: "text", content: rest.slice(0, openIdx) });
    parts.push({ type: "think", content: rest.slice(openIdx + "<think>".length) });
  } else if (rest) {
    parts.push({ type: "text", content: rest });
  }
  return parts;
}

// 펜스 코드 블록(<pre><code>...)을 접었다 펼 수 있는 블록으로 감싸는 ReactMarkdown 컴포넌트 오버라이드
function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const codeEl = Array.isArray(children) ? children[0] : children;
  const lang = (codeEl as ReactElement<{ className?: string }>)?.props?.className?.replace("language-", "");
  return (
    <CollapsibleBlock title={`💻 ${lang || "코드"}`} defaultOpen>
      <pre {...props} style={{ margin: 0, overflowX: "auto" }}>{children}</pre>
    </CollapsibleBlock>
  );
}

function MarkdownWithThink({ content }: { content: string }) {
  return (
    <>
      {parseThinkBlocks(content).map((part, i) =>
        part.type === "think" ? (
          <CollapsibleBlock key={i} title="💭 생각 과정">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
          </CollapsibleBlock>
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{ pre: CodeBlock }}>
            {part.content}
          </ReactMarkdown>
        )
      )}
    </>
  );
}

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
  SERVER_URL_MISSING:  "Local Server 주소가 설정되지 않았습니다. 설정에서 입력해 주세요.",
  VAULT_LOCKED:        "API 볼트가 잠겨 있습니다. 설정에서 비밀번호로 잠금을 해제해 주세요.",
  PROVIDER_KEY_NOT_SET: "선택한 Provider의 API Key가 등록되지 않았습니다. 설정에서 등록해 주세요.",
  PROVIDER_ERROR:      "AI Provider 호출 중 오류가 발생했습니다. API Key와 모델을 확인해 주세요.",
  KEY_DECRYPTION_FAILED: "API Key 복호화에 실패했습니다. 다시 로그인 후 시도해 주세요.",
};

export default function ChatMessages() {
  const messages         = useChatStore((s) => s.loadedMessages);
  const isStreaming      = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const streamError      = useChatStore((s) => s.streamError);

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
            {msg.role === "user" ? msg.content : <MarkdownWithThink content={msg.content} />}
          </div>
        </div>
      ))}

      {isStreaming && (
        <div className={`${s.row} ${s.rowAssistant}`}>
          <div className={`${s.bubble} ${s.bubbleAssistant}`}>
            {streamingContent ? (
              <><MarkdownWithThink content={streamingContent} /><span className={s.cursor} /></>
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
