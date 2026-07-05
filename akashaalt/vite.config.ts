import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      // 개발 환경: /api/ 요청을 akashaalt 자체 백엔드(server/index.ts)로 프록시
      "/api": {
        target: "http://localhost:3003",
        changeOrigin: true,
      },
    },
  },
});
