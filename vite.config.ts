import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Важно: /api-poo раньше /api/, иначе /api перехватывает /api-poo/* → 8080 (РХЗО)
      "/api-poo": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-poo/, "/api"),
      },
      "/api/": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
