import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 개발 서버에서도 Pyodide 워커에 전용 CSP를 붙인다.
 * 프로덕션에서는 Express가 같은 헤더를 붙인다(server/index.ts의 WORKER_CSP 주석 참고).
 * 개발에서만 빠져 있으면 "로컬에선 되는데 배포하면 막히는" 반대 상황이 생기고,
 * 무엇보다 이 경계가 깨졌는지 개발 중에 확인할 수 없게 된다.
 */
function pyodideWorkerCsp() {
  return {
    name: 'pyde-pyodide-worker-csp',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.includes('/runtime/pyodide.worker')) {
          res.setHeader('Content-Security-Policy', 'connect-src https://cdn.jsdelivr.net')
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), pyodideWorkerCsp()],
  server: {
    port: 5175,
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
      '/auth': { target: 'http://localhost:3002', changeOrigin: true },
    },
    // 개발 서버에서도 cross-origin isolation을 켜 둔다.
    // SharedArrayBuffer(동기 input() 구현)가 여기에 의존하므로, 프로덕션에서만
    // 켜면 "로컬에선 되는데 배포하면 안 되는" 반대 상황이 생긴다.
    // ⚠️ 값은 프로덕션(server/index.ts)과 반드시 같아야 한다 — credentialless는
    //    Safari가 지원하지 않아 애플 기기에서만 조용히 깨진다(그쪽 주석 참고).
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    // Monaco는 번들하지 않고 CDN(AMD 로더)에서 불러온다 — 서버 egress 절약.
    // 자세한 근거는 src/components/editor/monacoLoader.ts 참고.
  },
})
