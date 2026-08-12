// PyDe 서버(같은 오리진)와만 통신하는 얇은 fetch 래퍼.
// ⚠️ 브라우저는 OAuth 토큰을 보지 않는다 — 인증은 HttpOnly 세션 쿠키로만 이뤄지고,
//    실제 Akademiya Cloud 호출은 PyDe 서버가 대신한다.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown
  ) {
    super(`${status} ${code}`)
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** 공유 링크로 접근할 때만 실어 보낸다 (쿼리스트링에 담지 않는다 — 로그 유출 방지) */
  linkToken?: string | null
  signal?: AbortSignal
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, linkToken, signal } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (linkToken) headers['X-Cloud-Link-Token'] = linkToken

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    signal,
  })

  let payload: unknown = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!res.ok) {
    const code =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : 'REQUEST_FAILED'
    throw new ApiError(res.status, code, payload)
  }

  return payload as T
}
