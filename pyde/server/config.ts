import dotenv from 'dotenv'

dotenv.config()

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (!v) {
    // 기동 시점에 죽는 편이 낫다 — 런타임에 조용히 로그인만 실패하면 원인 파악이 오래 걸린다
    throw new Error(`[PyDe] 환경변수 ${name}이(가) 설정되지 않았습니다.`)
  }
  return v
}

export const PORT = Number(process.env.PORT ?? 3002)
export const IS_PROD = process.env.NODE_ENV === 'production'

/** 브라우저에서 본 PyDe의 오리진. CSRF 방어(Origin 검사)와 공유 링크 생성에 쓴다. */
export const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN ?? 'https://pyde.akademiya.kr'

/** Akademiya 백엔드 API. 도커 내부에서는 http://backend:3000/api */
export const AKADEMIYA_API_URL = process.env.AKADEMIYA_API_URL ?? 'https://akademiya.kr/api'

// ── Akademiya OpenOAuth ("Akademiya로 로그인") ────────────────────────────────
// Akademiya 개발자 도구에서 OAuth App을 만들고 값을 주입한다.
// 앱 설정에서 선택 scope 'cloud'를 반드시 켜야 파일 저장이 동작한다.
export const OAUTH_CLIENT_ID = required('AKADEMIYA_OAUTH_CLIENT_ID', IS_PROD ? undefined : 'dev-client-id')
export const OAUTH_CLIENT_SECRET = required('AKADEMIYA_OAUTH_CLIENT_SECRET', IS_PROD ? undefined : 'dev-secret')
export const OAUTH_AUTHORIZE_URL =
  process.env.AKADEMIYA_OAUTH_AUTHORIZE_URL ?? 'https://akademiya.kr/oauth/authorize'
export const OAUTH_REDIRECT_URI =
  process.env.AKADEMIYA_OAUTH_REDIRECT_URI ?? `${PUBLIC_ORIGIN}/auth/callback`
export const OAUTH_SCOPE = 'openid profile email cloud'

/**
 * 세션 쿠키 암호화 키(32바이트 hex = 64자). `openssl rand -hex 32`로 생성.
 * ⚠️ 이 값을 바꾸면 기존 세션이 전부 무효가 된다(재로그인 필요).
 */
export const SESSION_SECRET_HEX = required(
  'PYDE_SESSION_SECRET',
  IS_PROD ? undefined : '00'.repeat(32)
)

export const SESSION_COOKIE = 'pyde_session'
export const OAUTH_STATE_COOKIE = 'pyde_oauth'
export const SESSION_TTL_DAYS = 30
