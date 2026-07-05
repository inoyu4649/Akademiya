// AI Provider 어댑터 — OpenRouter / OpenAI / Gemini(Claude 포함) 스트리밍 채팅 프록시.
// 어떤 provider든 API Key 원문을 로그·에러 메시지에 절대 포함하지 않는다.

export type AiProvider = "openrouter" | "openai" | "gemini" | "anthropic";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

/** SSE 바이트 스트림에서 "data: ..." 라인을 하나씩 뽑아주는 제너레이터 */
async function* sseLines(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}

class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

// ── OpenAI 호환(OpenAI / OpenRouter) ────────────────────────────────────────
async function* streamOpenAiCompatible(
  endpoint: string,
  apiKey: string,
  modelId: string,
  messages: ChatMsg[],
  extraHeaders: Record<string, string>,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(`PROVIDER_HTTP_${response.status}`);
  }

  for await (const raw of sseLines(response.body, signal)) {
    if (raw === "[DONE]") return;
    let parsed: { choices?: Array<{ delta?: { content?: string } }> };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      continue;
    }
    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Google Gemini ────────────────────────────────────────────────────────────
async function* streamGemini(
  apiKey: string,
  modelId: string,
  messages: ChatMsg[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ contents }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(`PROVIDER_HTTP_${response.status}`);
  }

  for await (const raw of sseLines(response.body, signal)) {
    let parsed: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      continue;
    }
    const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (text) yield text;
  }
}

// ── Anthropic Claude ─────────────────────────────────────────────────────────
async function* streamAnthropic(
  apiKey: string,
  modelId: string,
  messages: ChatMsg[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new ProviderError(`PROVIDER_HTTP_${response.status}`);
  }

  for await (const raw of sseLines(response.body, signal)) {
    let parsed: { type?: string; delta?: { type?: string; text?: string } };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      continue;
    }
    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && parsed.delta.text) {
      yield parsed.delta.text;
    }
    if (parsed.type === "message_stop") return;
  }
}

/** provider별 스트리밍 채팅 완성 — 텍스트 조각을 순차적으로 yield */
export function streamChat(
  provider: AiProvider,
  apiKey: string,
  modelId: string,
  messages: ChatMsg[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  switch (provider) {
    case "openai":
      return streamOpenAiCompatible("https://api.openai.com/v1/chat/completions", apiKey, modelId, messages, {}, signal);
    case "openrouter":
      return streamOpenAiCompatible(
        "https://openrouter.ai/api/v1/chat/completions",
        apiKey,
        modelId,
        messages,
        { "HTTP-Referer": "https://ai.akademiya.kr", "X-Title": "AkashaAlt" },
        signal
      );
    case "gemini":
      return streamGemini(apiKey, modelId, messages, signal);
    case "anthropic":
      return streamAnthropic(apiKey, modelId, messages, signal);
  }
}
