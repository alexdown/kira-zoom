import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // Proxy API requests to the Express server during development
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Proxy WebSocket connections
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
