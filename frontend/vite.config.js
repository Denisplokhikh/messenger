import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Слушаем на IPv4: на Windows Node резолвит localhost в ::1,
    // а браузер может стучаться на 127.0.0.1 → ERR_CONNECTION_REFUSED
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // В dev-режиме API и WebSocket проксируются на FastAPI
    proxy: {
      "/api": { target: "http://localhost:8000", ws: true },
      "/media": "http://localhost:8000",
    },
  },
});
