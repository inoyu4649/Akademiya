// LLM 모델 목록·추론 API — 백엔드 프록시 경유 (상대 경로, nginx 프록시)

export interface ModelInfo {
  modelId:     string;
  displayName: string;
  creditCost:  number;
  unlimited:   boolean;
}

// GET /api/ai/models?serverUrl=...
export async function fetchModels(token: string, serverUrl: string): Promise<ModelInfo[]> {
  if (!serverUrl) return [];
  const res = await fetch(
    `/api/ai/models?serverUrl=${encodeURIComponent(serverUrl)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { models?: Array<{ id: string; displayName: string; creditCost: number; unlimited: boolean }> };
  return (data.models ?? []).map((m) => ({
    modelId:     m.id,
    displayName: m.displayName,
    creditCost:  m.creditCost,
    unlimited:   m.unlimited,
  }));
}

// POST /api/ai/infer  →  SSE stream (백엔드가 LLM 서버로 프록시)
export async function streamInfer(
  token: string,
  serverUrl: string,
  params: { modelId: string; messages: Array<{ role: string; content: string }> },
  signal?: AbortSignal
): Promise<Response> {
  return fetch("/api/ai/infer", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ serverUrl, ...params }),
    signal,
  });
}
