import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,   // no source maps in production (security)
    minify: "esbuild",
    rollupOptions: {
      output: {
        // Code-split major vendor bundles for better caching
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (["react", "react-dom", "react-router-dom"].some((p) => id.includes(`/${p}/`))) return "vendor-react";
            if (["i18next", "react-i18next"].some((p) => id.includes(`/${p}/`)))              return "vendor-i18n";
            if (id.includes("/recharts/"))                                                     return "vendor-recharts";
            if (id.includes("/zustand/") || id.includes("/axios/"))                           return "vendor-state";
          }
        },
      },
    },
    // Warn on chunks > 500 kB
    chunkSizeWarningLimit: 500,
  },
  preview: {
    port: 4173,
  },
});
