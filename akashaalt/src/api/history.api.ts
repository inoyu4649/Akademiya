// 채팅 기록 API — Akademiya 백엔드 /api/ai/* 호출 (상대 경로, nginx 프록시)

export interface ConvSummary {
  id: number;
  title: string;
  server_url: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}

export interface BackendMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  model_id: string | null;
  created_at: string;
}

function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token), ...(init.headers as Record<string, string> ?? {}) },
  });
  if (res.status === 401) throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });
  return res;
}

export async function listConversations(token: string): Promise<ConvSummary[]> {
  const res = await apiFetch("/api/ai/conversations", token);
  if (!res.ok) throw new Error("FETCH_FAILED");
  const data = await res.json() as { conversations: ConvSummary[] };
  return data.conversations;
}

export async function createConversation(
  token: string, title: string, serverUrl: string, modelId: string
): Promise<ConvSummary> {
  const res = await apiFetch("/api/ai/conversations", token, {
    method: "POST",
    body: JSON.stringify({ title, serverUrl, modelId }),
  });
  if (!res.ok) throw new Error("CREATE_FAILED");
  return res.json() as Promise<ConvSummary>;
}

export async function deleteConversation(token: string, id: number): Promise<void> {
  await apiFetch(`/api/ai/conversations/${id}`, token, { method: "DELETE" });
}

export async function listMessages(token: string, convId: number): Promise<BackendMessage[]> {
  const res = await apiFetch(`/api/ai/conversations/${convId}/messages`, token);
  if (!res.ok) throw new Error("FETCH_FAILED");
  const data = await res.json() as { messages: BackendMessage[] };
  return data.messages;
}

export async function saveMessage(
  token: string, convId: number, role: "user" | "assistant", content: string, modelId?: string
): Promise<void> {
  await apiFetch(`/api/ai/conversations/${convId}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ role, content, modelId }),
  });
}
