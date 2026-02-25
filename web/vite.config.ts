import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Bind to 0.0.0.0 so nginx (in Docker) can reach via host.docker.internal
    allowedHosts: true, // Allow requests from Docker's host.docker.internal
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/obj": {
        target: "http://192.168.1.106:9200",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/obj/, ""),
      },
    },
  },
});
