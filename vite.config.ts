import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Важно: /api-poo, /api-ponod и /api-ponoinput раньше /api/, иначе /api перехватывает их
      "/api-poo": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-poo/, "/api"),
      },
      "/api-ponod": {
        target: "http://localhost:8082",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-ponod/, "/api"),
      },
      "/api-ponoinput": {
        target: "http://localhost:8083",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-ponoinput/, "/api"),
      },
      "/api/": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
