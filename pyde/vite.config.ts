import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
      '/auth': { target: 'http://localhost:3002', changeOrigin: true },
    },
    // 개발 서버에서도 cross-origin isolation을 켜 둔다.
    // SharedArrayBuffer(동기 input() 구현)가 여기에 의존하므로, 프로덕션에서만
    // 켜면 "로컬에선 되는데 배포하면 안 되는" 반대 상황이 생긴다.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
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
