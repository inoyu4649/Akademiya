// ============================================================================
//  PyDe Web 서버
// ============================================================================
//  역할은 세 가지뿐이다.
//    1) Akademiya OpenOAuth 로그인 왕복 (토큰은 서버 밖으로 나가지 않는다)
//    2) Akademiya Cloud API 대리 호출 (브라우저에는 세션 쿠키만 준다)
//    3) 빌드된 SPA + D2Coding TTF 정적 서빙
//
//  ⚠️ 이 서버는 사용자 Python 코드를 절대 실행하지 않는다. Python 실행은 오로지
//     브라우저의 Web Worker 안 Pyodide에서만 일어난다. child_process/eval/vm 등
//     코드 실행 경로를 이 파일에 추가하지 말 것 — 설계상의 보안 경계다.
// ============================================================================
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cookieParser from 'cookie-parser'
import axios from 'axios'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  AKADEMIYA_API_URL,
  IS_PROD,
  OAUTH_STATE_COOKIE,
  PORT,
  PUBLIC_ORIGIN,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
} from './config.js'
import {
  OAUTH_STATE_TTL_MS,
  sealOAuthState,
  sealSession,
  unsealOAuthState,
  unsealSession,
  type SessionData,
} from './session.js'
import {
  authorizeUrl,
  createPkce,
  dropCachedToken,
  exchangeCode,
  fetchUserInfo,
  getAccessToken,
  SessionExpiredError,
} from './oauth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app: Express = express()

app.set('trust proxy', 1)
app.disable('x-powered-by')

// ── Content-Security-Policy ──────────────────────────────────────────────────
//  사용자가 작성한 Python이 브라우저에서 실행되는 앱이라 XSS 방어선이 특히 중요하다.
//  각 directive를 왜 이렇게 열었는지 근거를 남긴다(무심코 넓히지 않도록):
//
//   script-src 'wasm-unsafe-eval'
//     Pyodide는 WebAssembly를 컴파일해야 한다. 'unsafe-eval'까지 열면 XSS가 임의
//     JS를 실행할 수 있게 되므로 WASM 컴파일만 허용하는 이 토큰으로 좁힌다.
//   script-src https://cdn.jsdelivr.net
//     Pyodide 런타임(pyodide.mjs)을 CDN에서 ESM으로 가져온다.
//   worker-src 'self' blob:
//     Vite가 번들한 워커는 'self'지만 Monaco는 blob: 워커를 만든다.
//   style-src 'unsafe-inline'
//     Monaco가 토큰 색상을 <style> 태그로 주입한다. 제거하려면 Monaco를 포크해야 해서
//     현실적으로 열어둘 수밖에 없다(스타일 주입만으로 스크립트 실행은 불가).
//   img-src blob: data:
//     matplotlib 결과 PNG를 data: URL로 캔버스에 띄운다.
//   connect-src https://cdn.jsdelivr.net
//     휠·wasm·lock 파일을 fetch로 받는다.
//   img-src https://akademiya.kr
//     로그인 사용자의 Akademiya 프로필 사진과 브랜드 아이콘.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "img-src 'self' data: blob: https://akademiya.kr",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// ── 보안 헤더 ────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  // Cross-origin isolation. SharedArrayBuffer가 여기에 의존하고, 그게 있어야
  // Pyodide의 input()을 워커에서 "동기적으로" 구현할 수 있다.
  // credentialless를 쓰는 이유: require-corp와 달리 CDN(jsDelivr)이 CORP 헤더를
  // 주지 않아도 자격증명 없이 로드해 통과시킨다. Safari는 credentialless를
  // 지원하지 않아 crossOriginIsolated가 false가 되며, 그 경우 프론트가 비차단
  // 입력 UI로 폴백한다.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', CSP)
  next()
})

app.use(cookieParser())
// 파일 본문(최대 5MB)이 오가므로 기본 100KB로는 부족하다. Cloud API 한도(5MB)에 여유를 둔다.
app.use(express.json({ limit: '6mb' }))

// ── CSRF 방어 ────────────────────────────────────────────────────────────────
// 세션 쿠키가 SameSite=Lax라 교차 사이트 POST에는 쿠키가 실리지 않지만, 브라우저
// 구현 차이에 기대지 않도록 상태 변경 요청은 Origin까지 직접 확인한다.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next()
  const origin = req.get('origin')
  // 같은 오리진 요청은 Origin이 없을 수도 있다(구형 브라우저). 있으면 반드시 일치해야 한다.
  if (origin && origin !== PUBLIC_ORIGIN && !(!IS_PROD && origin.startsWith('http://localhost:'))) {
    res.status(403).json({ error: 'CSRF_ORIGIN_MISMATCH' })
    return
  }
  next()
})

// ── 세션 로딩 ────────────────────────────────────────────────────────────────
declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionData
  }
}

function setSessionCookie(res: Response, data: SessionData) {
  res.cookie(SESSION_COOKIE, sealSession(data), {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: SESSION_TTL_DAYS * 86_400_000,
    path: '/',
  })
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/' })
}

app.use((req: Request, _res: Response, next: NextFunction) => {
  req.session = unsealSession(req.cookies?.[SESSION_COOKIE]) ?? undefined
  next()
})

/**
 * 액세스 토큰을 확보한다. 리프레시로 토큰이 회전했으면 세션 쿠키를 다시 굽는다.
 * 세션이 죽었으면 쿠키를 지우고 null을 반환한다.
 */
async function accessTokenFor(req: Request, res: Response): Promise<string | null> {
  if (!req.session) return null
  try {
    const { accessToken, rotatedRefreshToken } = await getAccessToken(req.session)
    if (rotatedRefreshToken) {
      req.session = { ...req.session, refreshToken: rotatedRefreshToken }
      setSessionCookie(res, req.session)
    }
    return accessToken
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      clearSessionCookie(res)
      return null
    }
    throw err
  }
}

// ============================================================================
//  인증
// ============================================================================

// ── GET /auth/login — Akademiya 로그인 화면으로 보낸다 ───────────────────────
app.get('/auth/login', (req: Request, res: Response) => {
  const pkce = createPkce()
  // ⚠️ code_verifier는 브라우저 JS가 읽을 수 없는 봉인 쿠키에만 둔다.
  //    (사용자 Python 코드가 도는 앱이라 sessionStorage는 신뢰하지 않는다)
  res.cookie(
    OAUTH_STATE_COOKIE,
    sealOAuthState({ ...pkce, returnTo: safeReturnTo(req.query.returnTo) }),
    {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'lax',
      maxAge: OAUTH_STATE_TTL_MS, // 인가 코드 왕복에 10분이면 충분
      path: '/auth',
    }
  )
  res.redirect(authorizeUrl(pkce))
})

/** 오픈 리다이렉트 방지 — 자기 사이트 내부 경로만 허용한다 */
function safeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string') return '/'
  // '//evil.com'이나 'https://evil.com'은 전부 거른다
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}

// ── GET /auth/callback ───────────────────────────────────────────────────────
app.get('/auth/callback', async (req: Request, res: Response) => {
  const stored = unsealOAuthState(req.cookies?.[OAUTH_STATE_COOKIE])
  res.clearCookie(OAUTH_STATE_COOKIE, { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/auth' })

  const { code, state } = req.query as Record<string, string | undefined>
  if (!stored || !code || !state || state !== stored.state) {
    res.redirect('/?authError=state')
    return
  }

  try {
    const tokens = await exchangeCode(code, stored.codeVerifier)
    const info = await fetchUserInfo(tokens.access_token)
    const uid = Number(info.sub)
    if (!Number.isInteger(uid) || uid <= 0) {
      res.redirect('/?authError=userinfo')
      return
    }

    setSessionCookie(res, {
      uid,
      email: info.email ?? '',
      name: info.name || info.email?.split('@')[0] || '',
      picture: info.picture ?? null,
      refreshToken: tokens.refresh_token,
    })
    res.redirect(safeReturnTo(stored.returnTo))
  } catch (err) {
    // ⚠️ 토큰/코드는 절대 로그에 남기지 않는다 — 상태코드와 에러코드만 기록
    const upstream = axios.isAxiosError(err)
      ? (err.response?.data as { error?: string } | undefined)?.error
      : undefined
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    console.error('[PyDe] OAuth 콜백 실패:', `${status ?? '?'} ${upstream ?? (err as Error).message}`)
    res.redirect(`/?authError=${encodeURIComponent(mapAuthError(upstream))}`)
  }
})

/**
 * Akademiya OpenOAuth 오류 코드를 프론트 i18n 키로 매핑한다.
 * 코드 목록은 guides/akademiya-openoauth-guide.md "주요 오류 코드" 절 기준.
 * 사용자가 스스로 해결할 수 있는 것(자격 미달·차단)과 운영자가 고쳐야 하는 설정 오류
 * (Client ID·redirect_uri 미등록)를 구분해서 안내해야 원인 파악이 빠르다.
 */
function mapAuthError(code: string | undefined): string {
  switch (code) {
    case 'OAUTH_NOT_ELIGIBLE':
      return 'notEligible'
    case 'OAUTH_GOOGLE_ONLY':
      return 'googleOnly'
    case 'OAUTH_APP_BANNED':
      return 'banned'
    case 'INVALID_OR_EXPIRED_CODE':
    case 'INVALID_CODE_VERIFIER':
      return 'state'
    // 아래는 전부 PyDe 쪽 설정 실수 — 사용자가 재시도해도 절대 풀리지 않는다
    case 'INVALID_CLIENT':
    case 'REDIRECT_URI_NOT_WHITELISTED':
    case 'PKCE_REQUIRED':
      return 'config'
    default:
      return 'exchange'
  }
}

// ── GET /api/me ──────────────────────────────────────────────────────────────
app.get('/api/me', (req: Request, res: Response) => {
  if (!req.session) {
    res.json({ authenticated: false })
    return
  }
  const { uid, email, name, picture } = req.session
  res.json({ authenticated: true, user: { id: uid, email, name, picture } })
})

// ── POST /api/auth/logout ────────────────────────────────────────────────────
// 로컬 세션만 끊는다. Akademiya 쪽 인증 해제는 계정 센터의 '연결된 서비스'에서 한다.
app.post('/api/auth/logout', (req: Request, res: Response) => {
  if (req.session) dropCachedToken(req.session.uid)
  clearSessionCookie(res)
  res.json({ ok: true })
})

// ============================================================================
//  Akademiya Cloud 대리 호출
// ============================================================================
//  브라우저 → (세션 쿠키) → PyDe 서버 → (Bearer) → Akademiya /api/cloud
//  경로는 화이트리스트 정규식으로 좁혀 임의의 백엔드 라우트를 찌를 수 없게 한다.
const CLOUD_PATH_RE = /^\/(files(\/\d+(\/shares(\/\d+)?|\/link)?)?|orgs|usage)$/
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

app.use('/api/cloud', async (req: Request, res: Response) => {
  if (!ALLOWED_METHODS.has(req.method)) {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })
    return
  }
  if (!CLOUD_PATH_RE.test(req.path)) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }

  const accessToken = await accessTokenFor(req, res)
  if (!accessToken) {
    res.status(401).json({ error: 'NOT_AUTHENTICATED' })
    return
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  // 공유 링크로 들어온 사용자가 편집 권한을 얻으려면 토큰을 함께 넘겨야 한다
  const linkToken = req.get('x-cloud-link-token')
  if (linkToken) headers['X-Cloud-Link-Token'] = linkToken

  try {
    const upstream = await axios.request({
      method: req.method,
      url: `${AKADEMIYA_API_URL}/cloud${req.path}`,
      params: req.query,
      data: SAFE_METHODS.has(req.method) ? undefined : req.body,
      headers,
      timeout: 20_000,
      // 4xx는 예외가 아니라 그대로 전달한다(권한/충돌 응답을 프론트가 해석해야 함)
      validateStatus: () => true,
      maxBodyLength: 6 * 1024 * 1024,
      maxContentLength: 8 * 1024 * 1024,
    })
    res.status(upstream.status).json(upstream.data)
  } catch (err) {
    console.error('[PyDe] Cloud 대리 호출 실패:', (err as Error).message)
    res.status(502).json({ error: 'CLOUD_UNAVAILABLE' })
  }
})

// ── GET /api/share/:token — 링크 공개 파일 (로그인 불필요) ───────────────────
app.get('/api/share/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '')
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    res.status(404).json({ error: 'NOT_FOUND' })
    return
  }
  try {
    const upstream = await axios.get(`${AKADEMIYA_API_URL}/cloud/public/${token}`, {
      timeout: 20_000,
      validateStatus: () => true,
    })
    res.status(upstream.status).json(upstream.data)
  } catch (err) {
    console.error('[PyDe] 공유 링크 조회 실패:', (err as Error).message)
    res.status(502).json({ error: 'CLOUD_UNAVAILABLE' })
  }
})

// ── 헬스체크 ─────────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ============================================================================
//  정적 서빙
// ============================================================================
const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  // Vite 산출물은 파일명에 콘텐츠 해시가 있어 장기 불변 캐싱이 안전하다.
  app.use(
    '/assets',
    express.static(join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y',
    })
  )
  // D2Coding TTF(4MB)도 파일명에 버전이 박혀 있어 불변 캐싱 대상이다.
  // ⚠️ 폰트를 교체할 땐 반드시 파일명의 버전을 함께 올릴 것 — 같은 이름으로 덮어쓰면
  //    1년간 옛 파일이 그대로 쓰인다(Akademiya 로고 교체 때 실제로 겪은 함정).
  app.use('/fonts', express.static(join(distPath, 'fonts'), { immutable: true, maxAge: '1y' }))
  // 나머지 고정 파일명 자산은 항상 재검증(변경 없으면 ETag로 304)
  app.use(express.static(distPath, { maxAge: 0, etag: true }))

  // SPA fallback — /api, /auth를 제외한 모든 경로
  app.get(/^\/(?!api\/|auth\/).*/, (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(join(distPath, 'index.html'))
  })
}

// ── 전역 에러 핸들러 ─────────────────────────────────────────────────────────
// Express는 인수 4개짜리 함수만 에러 핸들러로 인식하므로 _next를 지우면 안 된다.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[PyDe] 처리되지 않은 오류:', (err as Error).message)
  if (!res.headersSent) res.status(500).json({ error: 'SERVER_ERROR' })
})

process.on('uncaughtException', (err) => console.error('[PyDe uncaughtException]', err))
process.on('unhandledRejection', (reason) => console.error('[PyDe unhandledRejection]', reason))

app.listen(PORT, () => {
  console.log(`PyDe Web server running on port ${PORT} [${IS_PROD ? 'production' : 'development'}]`)
})

export default app
