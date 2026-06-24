import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      // 개발 환경: /api/ 요청을 Akademiya 백엔드로 프록시
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
