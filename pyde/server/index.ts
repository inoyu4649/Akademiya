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
  // Pyodide의 input()과 실행 중지를 워커에서 "동기적으로" 구현할 수 있다.
  //
  // ⚠️ credentialless를 쓰면 안 된다. **Safari가 지원하지 않고 지원할 계획도 없어서**
  //    애플 기기에서는 값이 무시되고 crossOriginIsolated가 false가 된다 →
  //    SharedArrayBuffer가 없어 input()이 즉시 EOFError로 죽고 중지 버튼도 먹지 않았다
  //    (2026-08-20 실제 버그). 예전 주석은 "그 경우 프론트가 비차단 입력 UI로 폴백한다"고
  //    적혀 있었지만 그런 폴백은 구현된 적이 없다.
  //
  // require-corp는 모든 교차 출처 리소스가 CORP 헤더를 주도록 요구한다. 확인 결과:
  //   · jsDelivr(Pyodide·Monaco·xterm·D2Coding) — `cross-origin-resource-policy: cross-origin` 있음
  //   · akademiya.kr(프로필 사진·브랜드 아이콘) — 없었으므로 이번에 붙였다
  //     (backend/src/routes/avatar.ts, nginx/nginx.conf).
  // 교차 출처 자산을 새로 추가할 땐 그 응답에 CORP가 있는지 반드시 먼저 확인할 것.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', CSP)
  next()
})

app.use(cookieParser())

// ── 요청 본문 크기 ───────────────────────────────────────────────────────────
// ⚠️ 큰 한도를 전역에 걸면 안 된다. 파일 본문이 오가는 곳은 /api/cloud 하나뿐인데
//    전역으로 6MB를 열어두면 **로그인하지 않은 아무나** 아무 엔드포인트에나 6MB를
//    던져 서버에 파싱을 시킬 수 있다. 큰 본문은 그 경로에만 허용한다.
const CLOUD_BODY_LIMIT = '6mb' // Cloud API의 파일당 한도(5MB)에 여유를 둔 값
app.use('/api/cloud', express.json({ limit: CLOUD_BODY_LIMIT }))
app.use(express.json({ limit: '32kb' }))

// ── Rate limit (최소 구현) ───────────────────────────────────────────────────
//  왜 직접 짜나: PyDe 서버는 컨테이너 한 개짜리 단일 프로세스라 메모리 카운터로 충분하고,
//  이 하나 때문에 의존성을 늘리고 싶지 않다(번들이 아니라 서버 의존성이라 egress와는
//  무관하지만, 서버 코드는 작게 유지한다).
//
//  ⚠️ 상한을 넉넉히 잡는 이유: 학교는 교내 와이파이/NAT로 한 반(~35명)부터 전교생까지
//     같은 공인 IP를 쓴다. IP 기준 상한이 낮으면 정상 이용자가 무더기로 막힌다
//     (설문 공개응답 리미터를 10 → 300으로 올렸던 것과 같은 이유).
interface Bucket {
  count: number
  resetAt: number
}

function rateLimit(windowMs: number, max: number) {
  const buckets = new Map<string, Bucket>()
  return function (req: Request, res: Response, next: NextFunction): void {
    const now = Date.now()
    // 값이 없거나 신뢰할 수 없으면 하나의 버킷으로 몰아 넣는다(빈 키로 우회 불가)
    const key = req.ip ?? 'unknown'
    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
    } else if (++bucket.count > max) {
      res.status(429).json({ error: 'TOO_MANY_REQUESTS' })
      return
    }
    // 만료된 버킷 청소 — 요청이 뜸하면 맵이 자라기만 하는 것을 막는다
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    }
    next()
  }
}

// 공유 링크 열람은 **로그인 없이** 백엔드까지 도달하는 유일한 경로다.
// 백엔드 쪽 리미터는 PyDe 컨테이너 IP 하나로 보여 전 사용자가 한 버킷을 나눠 쓰므로,
// 진짜 클라이언트 IP를 볼 수 있는 여기서 거는 것이 실효가 있다.
const shareLimiter = rateLimit(15 * 60 * 1000, 300)
// 로그인 시작은 상태 쿠키를 굽고 리다이렉트만 하지만, 무제한이면 리다이렉트 증폭에 쓰인다
const loginLimiter = rateLimit(15 * 60 * 1000, 120)

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
app.get('/auth/login', loginLimiter, (req: Request, res: Response) => {
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
app.get('/api/share/:token', shareLimiter, async (req: Request, res: Response) => {
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
  // ── Pyodide 워커 전용 CSP ──────────────────────────────────────────────────
  //  이 앱의 핵심 보안 경계다. 사용자가 작성한 Python은 워커 안에서 돌고, Pyodide는
  //  설계상 `import js`로 워커의 JS 전역을 그대로 내준다. 워커는 같은 오리진이므로
  //  **`js.fetch('/api/cloud/files')` 한 줄로 세션 쿠키가 실린 요청이 나간다.**
  //  즉 악의적인 노트북을 공유받아 실행하면 그 사람의 클라우드 파일이 통째로
  //  읽히거나 지워질 수 있다(실제로 재현해 확인했다).
  //
  //  워커 스크립트 응답에 붙인 CSP는 그 워커의 전역 스코프에 적용된다(문서 정책에
  //  더해져 각각 강제된다). connect-src에서 'self'를 빼면 워커의 fetch/XHR/WebSocket이
  //  우리 오리진에 닿지 못한다 — 워커가 실제로 네트워크로 필요한 곳은 jsDelivr뿐이다.
  //  ⚠️ 그래서 워커 안에서 같은 오리진 자원(폰트 폴백)을 직접 받으면 안 된다.
  //     메인 스레드에 요청해 받아오도록 되어 있다(runtime/pyodide.worker.ts).
  //  ⚠️ connect-src만 좁힌다. default-src까지 잠그면 Pyodide가 내부적으로 쓰는 경로
  //     하나만 빠뜨려도 앱이 부팅조차 못 한다 — 실효는 connect-src에서 나온다.
  const WORKER_CSP = 'connect-src https://cdn.jsdelivr.net'
  app.use('/assets', (req: Request, res: Response, next: NextFunction) => {
    if (/^\/pyodide\.worker-[\w-]+\.js$/.test(req.path)) {
      res.setHeader('Content-Security-Policy', WORKER_CSP)
    }
    next()
  })

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
