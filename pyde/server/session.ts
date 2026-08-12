// ============================================================================
//  봉인(sealed) 쿠키 — 서버에 세션 저장소를 두지 않는다
// ============================================================================
//  왜 이렇게 했나:
//   · GMCAuto는 세션을 서버 메모리 Map에 두고 sessionId를 쿼리스트링으로 주고받는데,
//     그 방식은 (1) 재배포마다 전원 로그아웃 (2) nginx/Express 액세스 로그에 세션 ID가
//     평문으로 남는 문제가 있다. PyDe는 자동 저장이 도는 IDE라 재배포 로그아웃이 특히 아프다.
//   · 그래서 내용을 AES-256-GCM으로 봉인해 HttpOnly 쿠키에 담는다. 서버는 무상태가
//     되어 재시작해도 세션이 살아있고, 쿠키는 JS에서 읽을 수 없다.
//   · 쿠키에 들어가는 민감값은 OpenOAuth 리프레시 토큰 하나뿐이며 항상 암호화된다.
//     액세스 토큰은 쿠키에 넣지 않고 서버 메모리에만 캐싱한다(oauth.ts).
// ============================================================================
import crypto from 'crypto'
import { SESSION_SECRET_HEX, SESSION_TTL_DAYS } from './config.js'

const KEY = Buffer.from(SESSION_SECRET_HEX, 'hex')
if (KEY.length !== 32) {
  throw new Error('[PyDe] PYDE_SESSION_SECRET은 32바이트 hex(64자)여야 합니다.')
}

/** 봉인된 값에는 항상 발급 시각이 붙는다 — GCM은 변조는 막지만 만료는 못 막는다 */
interface Sealed {
  iat: number
}

export function sealJson<T>(data: T): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const payload = JSON.stringify({ ...data, iat: Date.now() })
  const body = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${body.toString('base64url')}.${tag.toString('base64url')}`
}

export function unsealJson<T>(raw: string | undefined, maxAgeMs: number): (T & Sealed) | null {
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  try {
    const [iv, body, tag] = parts.map((p) => Buffer.from(p, 'base64url'))
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
    const data = JSON.parse(json) as T & Sealed
    if (typeof data.iat !== 'number' || Date.now() - data.iat > maxAgeMs) return null
    return data
  } catch {
    // 복호화/인증 실패 = 변조되었거나 PYDE_SESSION_SECRET이 바뀐 쿠키
    return null
  }
}

// ── 로그인 세션 ──────────────────────────────────────────────────────────────
export interface SessionData {
  /** Akademiya user id (userinfo의 sub) */
  uid: number
  email: string
  name: string
  picture: string | null
  /** OpenOAuth 리프레시 토큰 — 회전되므로 갱신될 때마다 쿠키를 다시 굽는다 */
  refreshToken: string
}

export function sealSession(data: SessionData): string {
  return sealJson(data)
}

export function unsealSession(raw: string | undefined): SessionData | null {
  const data = unsealJson<SessionData>(raw, SESSION_TTL_DAYS * 86_400_000)
  if (!data) return null
  if (typeof data.uid !== 'number' || typeof data.refreshToken !== 'string') return null
  return data
}

// ── OAuth 왕복 상태 (PKCE verifier + state) ──────────────────────────────────
export interface OAuthState {
  state: string
  codeVerifier: string
  returnTo: string
}

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export function sealOAuthState(data: OAuthState): string {
  return sealJson(data)
}

export function unsealOAuthState(raw: string | undefined): OAuthState | null {
  const data = unsealJson<OAuthState>(raw, OAUTH_STATE_TTL_MS)
  if (!data) return null
  if (typeof data.state !== 'string' || typeof data.codeVerifier !== 'string') return null
  return data
}
