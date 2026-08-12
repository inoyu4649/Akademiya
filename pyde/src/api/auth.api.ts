import { api } from './client'

export interface PydeUser {
  id: number
  email: string
  name: string
  picture: string | null
}

export type MeResponse = { authenticated: false } | { authenticated: true; user: PydeUser }

export function fetchMe(): Promise<MeResponse> {
  return api<MeResponse>('/api/me')
}

export function logout(): Promise<{ ok: true }> {
  return api<{ ok: true }>('/api/auth/logout', { method: 'POST' })
}

/**
 * 로그인은 XHR이 아니라 최상위 리디렉션이다 — 서버가 PKCE를 만들고 Akademiya로 보낸다.
 * 로그인 후 돌아올 경로를 returnTo로 넘긴다(서버가 내부 경로인지 검증한다).
 */
export function startLogin(returnTo: string = window.location.pathname + window.location.search): void {
  window.location.href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
}
