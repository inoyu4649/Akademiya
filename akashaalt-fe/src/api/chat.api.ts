export interface ModelInfo {
  modelId:     string;
  displayName: string;
  creditCost:  number;
  unlimited:   boolean;
}

// serverUrl이 빈 문자열이면 상대 경로 (Local Server에서 직접 서빙)
function base(serverUrl: string) {
  return serverUrl.replace(/\/$/, "");
}

// GET /api/models
export async function fetchModels(serverUrl: string): Promise<ModelInfo[]> {
  const res = await fetch(`${base(serverUrl)}/api/models`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { models: Array<{ id: string; displayName: string; creditCost: number; unlimited: boolean }> };
  return data.models.map((m) => ({
    modelId:     m.id,
    displayName: m.displayName,
    creditCost:  m.creditCost,
    unlimited:   m.unlimited,
  }));
}

// POST /api/infer  →  SSE stream
export async function streamInfer(
  serverUrl: string,
  params: { modelId: string; messages: Array<{ role: string; content: string }> },
  signal?: AbortSignal
): Promise<Response> {
  return fetch(`${base(serverUrl)}/api/infer`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
    signal,
  });
}
