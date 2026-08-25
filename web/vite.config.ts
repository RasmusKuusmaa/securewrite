import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    // Sync-mode account server (see ../server) - proxying keeps /api
    // same-origin in dev, matching how it's served in production, so the
    // session cookie just works with no CORS/credentials setup needed.
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
