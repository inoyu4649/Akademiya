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
    rollupOptions: {
      output: {
        // Monaco는 통째로 300KB+라 앱 청크와 분리해야 초기 로딩이 빨라진다.
        // ⚠️ Vite 8(rolldown)은 객체 형태 manualChunks를 받지 않는다 — 함수만 허용.
        manualChunks(id: string) {
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'monaco'
          return undefined
        },
      },
    },
  },
})
