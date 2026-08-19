// ============================================================================
//  PyDe Web Service Worker
// ============================================================================
//  목적은 오프라인 완전 동작이 아니라 (1) 설치 가능한 PWA 자격과 (2) 재방문 시
//  앱 셸을 즉시 띄우는 것이다. Python 런타임(Pyodide, 약 50MB)은 여기서 캐시하지
//  않는다 — jsDelivr가 버전 경로를 immutable로 주므로 브라우저 HTTP 캐시가 이미
//  같은 일을 하고, Cache Storage에 50MB를 또 쌓으면 할당량만 잡아먹는다.
//
//  ⚠️ Chrome은 "빈 fetch 핸들러"를 설치 조건에서 무시한다. 그래서 이 핸들러는
//     실제로 캐시를 읽고 쓴다(형식만 갖춘 no-op을 두면 설치 배너가 뜨지 않는다).

const VERSION = 'pyde-v1'
const SHELL_CACHE = `${VERSION}-shell`

/** 앱 셸의 진입점. 해시가 붙은 /assets/*는 런타임에 자연스럽게 채워진다 */
const PRECACHE_URLS = ['/', '/pyde_logo.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // 하나라도 실패하면 addAll이 통째로 실패하므로 개별적으로 넣는다
      // (설치가 실패하면 SW가 아예 활성화되지 않는다)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

/**
 * ⚠️⚠️ 이 워커 스크립트만은 절대 캐시에서 돌려주지 않는다.
 *
 * 사용자 Python은 Pyodide 워커 안에서 돌고, Pyodide는 설계상 `import js`로 워커의 JS
 * 전역을 그대로 내준다. 그걸 막는 유일한 장치가 **서버가 이 응답에 붙이는
 * `Content-Security-Policy: connect-src https://cdn.jsdelivr.net`** 헤더다
 * (server/index.ts의 WORKER_CSP). Cache Storage는 헤더까지 보존하므로 지금 당장은
 * 캐시해도 CSP가 살아남지만, 서버에서 정책을 조이는 순간 캐시된 옛 응답이 그대로
 * 남아 **보안 경계가 조용히 낡는다.** 네트워크로만 받게 고정한다(9KB짜리 파일이라
 * 비용도 없고, HTTP 캐시는 어차피 동작한다).
 */
const PYODIDE_WORKER_RE = /^\/assets\/pyodide\.worker-[\w-]+\.js$/

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 교차 출처(jsDelivr 등)는 건드리지 않는다. COEP: require-corp 환경에서 캐시된
  // 응답을 되돌려주면 CORP 판정이 꼬일 수 있고, Pyodide 50MB를 떠안게 된다.
  if (url.origin !== self.location.origin) return

  // 인증·API는 항상 네트워크
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  // 위 주석 참고 — 보안 경계
  if (PYODIDE_WORKER_RE.test(url.pathname)) return

  // 문서 요청: 네트워크 우선(항상 최신 index.html), 실패하면 캐시된 셸로 오프라인 대응.
  // ⚠️ 캐시 우선으로 하면 안 된다 — index.html이 해시가 붙은 자산 이름을 담고 있고,
  //    cross-origin isolation을 켜는 COOP/COEP 헤더도 이 응답에 실려 온다.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined)
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error()))
    )
    return
  }

  // 해시가 박힌 빌드 산출물 — 이름이 곧 버전이라 캐시 우선이 안전하다
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            // 오류 응답이나 opaque 응답은 캐시하지 않는다
            if (response.ok && response.type === 'basic') {
              const copy = response.clone()
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
            }
            return response
          })
      )
    )
  }
})
