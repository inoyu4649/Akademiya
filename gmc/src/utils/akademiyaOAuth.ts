// Akademiya OpenOAuth("Akademiya로 로그인") 클라이언트 — Authorization Code + PKCE(S256)
// 스펙: https://akademiya.kr/developer/oauth/guide 참고

const STATE_KEY = 'akademiya_oauth_state'
const VERIFIER_KEY = 'akademiya_code_verifier'

interface OAuthConfig {
  clientId: string
  authorizeUrl: string
  redirectUri: string
  scope: string
}

function base64url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Akademiya 로그인 화면으로 최상위 리디렉션 (PKCE + state를 sessionStorage에 저장) */
export async function startAkademiyaLogin(): Promise<void> {
  const configRes = await fetch('/api/akademiya/oauth-config')
  const config = await configRes.json() as OAuthConfig

  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(64)))
  const challengeBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  const codeChallenge = base64url(new Uint8Array(challengeBuf))
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)))

  sessionStorage.setItem(VERIFIER_KEY, codeVerifier)
  sessionStorage.setItem(STATE_KEY, state)

  const url = new URL(config.authorizeUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  window.location.href = url.toString()
}

/** 콜백에서 돌아온 state를 검증하고, 저장된 code_verifier를 꺼낸다 (1회용 — 즉시 삭제) */
export function consumeAkademiyaOAuthState(returnedState: string | null): string | null {
  const savedState = sessionStorage.getItem(STATE_KEY)
  const codeVerifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  if (!codeVerifier || !returnedState || returnedState !== savedState) return null
  return codeVerifier
}
