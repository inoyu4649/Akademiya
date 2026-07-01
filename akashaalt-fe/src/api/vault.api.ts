// AkashaAlt API Key Zero-Knowledge Vault API — 백엔드 /api/ai/vault/* 호출

export type AiProvider = "openrouter" | "openai" | "gemini" | "anthropic";

export interface VaultStatus {
  hasVault: boolean;
  unlocked: boolean;
  providers: AiProvider[];
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

async function errCode(res: Response): Promise<string> {
  try {
    const body = await res.json() as { error?: string };
    return body.error ?? `HTTP_${res.status}`;
  } catch {
    return `HTTP_${res.status}`;
  }
}

export async function getVaultStatus(token: string): Promise<VaultStatus> {
  const res = await apiFetch("/api/ai/vault/status", token);
  if (!res.ok) throw new Error(await errCode(res));
  return res.json() as Promise<VaultStatus>;
}

export async function setupVault(token: string, password: string): Promise<void> {
  const res = await apiFetch("/api/ai/vault/setup", token, {
    method: "POST", body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await errCode(res));
}

export async function unlockVault(token: string, password: string): Promise<void> {
  const res = await apiFetch("/api/ai/vault/unlock", token, {
    method: "POST", body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(await errCode(res));
}

export async function lockVault(token: string): Promise<void> {
  await apiFetch("/api/ai/vault/lock", token, { method: "POST" });
}

export async function saveProviderKey(token: string, provider: AiProvider, apiKey: string): Promise<void> {
  const res = await apiFetch("/api/ai/vault/keys", token, {
    method: "POST", body: JSON.stringify({ provider, apiKey }),
  });
  if (!res.ok) throw new Error(await errCode(res));
}

export async function deleteProviderKey(token: string, provider: AiProvider): Promise<void> {
  const res = await apiFetch(`/api/ai/vault/keys/${provider}`, token, { method: "DELETE" });
  if (!res.ok) throw new Error(await errCode(res));
}

export async function requestVaultCode(token: string): Promise<void> {
  await apiFetch("/api/ai/vault/request-code", token, { method: "POST" });
}

export async function changeVaultPassword(
  token: string, currentPassword: string, newPassword: string, code: string
): Promise<void> {
  const res = await apiFetch("/api/ai/vault/change-password", token, {
    method: "POST", body: JSON.stringify({ currentPassword, newPassword, code }),
  });
  if (!res.ok) throw new Error(await errCode(res));
}

export async function resetVault(token: string, newPassword: string, code: string): Promise<void> {
  const res = await apiFetch("/api/ai/vault/reset", token, {
    method: "POST", body: JSON.stringify({ newPassword, code }),
  });
  if (!res.ok) throw new Error(await errCode(res));
}
