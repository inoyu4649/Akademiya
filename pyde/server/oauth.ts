// ============================================================================
//  Akademiya OpenOAuth 클라이언트 (Authorization Code + PKCE S256)
// ============================================================================
//  ⚠️ GMCAuto(gmc/src/utils/akademiyaOAuth.ts)는 code_verifier를 브라우저
//     sessionStorage에 두지만, PyDe는 **서버가 전 과정을 주도**한다.
//     이유: PyDe는 사용자가 작성한 Python 코드가 같은 오리진에서 실행되는 앱이라
//     브라우저 저장소에 인증 재료를 두는 것 자체가 위험 표면이다.
//     verifier/state는 봉인 쿠키에, 액세스 토큰은 서버 메모리에만 존재한다.
// ============================================================================
import crypto from 'crypto'
import axios from 'axios'
import {
  AKADEMIYA_API_URL,
  OAUTH_AUTHORIZE_URL,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPE,
} from './config.js'
import type { SessionData } from './session.js'

export interface PkcePair {
  state: string
  codeVerifier: string
}

export function createPkce(): PkcePair {
  return {
    state: crypto.randomBytes(16).toString('base64url'),
    codeVerifier: crypto.randomBytes(64).toString('base64url'),
  }
}

export function authorizeUrl(pkce: PkcePair): string {
  const challenge = crypto.createHash('sha256').update(pkce.codeVerifier).digest('base64url')
  const url = new URL(OAUTH_AUTHORIZE_URL)
  url.searchParams.set('client_id', OAUTH_CLIENT_ID)
  url.searchParams.set('redirect_uri', OAUTH_REDIRECT_URI)
  url.searchParams.set('scope', OAUTH_SCOPE)
  url.searchParams.set('state', pkce.state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
}

export interface UserInfo {
  sub: string
  name?: string
  email?: string
  picture?: string
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenResponse> {
  // ⚠️ 표준 폼 인코딩이 아니라 JSON body + camelCase 필드명이다(Akademiya 특이 스펙).
  const res = await axios.post<TokenResponse>(
    `${AKADEMIYA_API_URL}/openoauth/token`,
    {
      grantType: 'authorization_code',
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      code,
      redirectUri: OAUTH_REDIRECT_URI,
      codeVerifier,
    },
    { timeout: 10_000 }
  )
  return res.data
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const res = await axios.get<UserInfo>(`${AKADEMIYA_API_URL}/openoauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10_000,
  })
  return res.data
}

// ── 액세스 토큰 캐시 + 리프레시 ──────────────────────────────────────────────
// 액세스 토큰 TTL은 1시간이라 실제 리프레시는 사용자당 시간에 한 번꼴이다.
// 서버가 재시작하면 캐시가 비지만 쿠키의 리프레시 토큰으로 곧바로 복구된다.
interface CachedToken {
  accessToken: string
  expiresAt: number
}
const accessTokenCache = new Map<number, CachedToken>()

// ⚠️ 리프레시 토큰은 1회용(회전)이다. 같은 사용자의 요청 두 개가 동시에 갱신을
//    시도하면 하나는 반드시 401을 받는다(Akademiya 본체에서 실제로 겪었던 TOCTOU
//    경합과 같은 종류). 사용자별로 진행 중인 갱신 Promise를 공유해 직렬화한다.
const refreshInFlight = new Map<number, Promise<{ accessToken: string; refreshToken: string }>>()

export class SessionExpiredError extends Error {
  constructor() {
    super('SESSION_EXPIRED')
  }
}

async function refresh(session: SessionData) {
  const existing = refreshInFlight.get(session.uid)
  if (existing) return existing

  const task = (async () => {
    try {
      const res = await axios.post<TokenResponse>(
        `${AKADEMIYA_API_URL}/openoauth/token`,
        {
          grantType: 'refresh_token',
          clientId: OAUTH_CLIENT_ID,
          clientSecret: OAUTH_CLIENT_SECRET,
          refreshToken: session.refreshToken,
        },
        { timeout: 10_000 }
      )
      accessTokenCache.set(session.uid, {
        accessToken: res.data.access_token,
        // 만료 30초 전에는 미리 갱신해 경계에서 401이 나지 않게 한다
        expiresAt: Date.now() + (res.data.expires_in - 30) * 1000,
      })
      return { accessToken: res.data.access_token, refreshToken: res.data.refresh_token }
    } catch (err) {
      accessTokenCache.delete(session.uid)
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
        // 리프레시 토큰이 폐기됨 — 계정 센터에서 연결 해제했거나 BAN된 경우
        throw new SessionExpiredError()
      }
      throw err
    } finally {
      refreshInFlight.delete(session.uid)
    }
  })()

  refreshInFlight.set(session.uid, task)
  return task
}

/**
 * 유효한 액세스 토큰을 돌려준다. 갱신이 일어나 리프레시 토큰이 회전했다면
 * rotatedRefreshToken을 함께 반환하므로, 호출자는 세션 쿠키를 다시 구워야 한다.
 */
export async function getAccessToken(
  session: SessionData
): Promise<{ accessToken: string; rotatedRefreshToken?: string }> {
  const cached = accessTokenCache.get(session.uid)
  if (cached && cached.expiresAt > Date.now()) {
    return { accessToken: cached.accessToken }
  }
  const fresh = await refresh(session)
  return { accessToken: fresh.accessToken, rotatedRefreshToken: fresh.refreshToken }
}

export function dropCachedToken(uid: number): void {
  accessTokenCache.delete(uid)
}
