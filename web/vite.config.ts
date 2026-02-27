import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const modulePath = id.split('node_modules/')[1];
            if (!modulePath) return 'vendor';

            const parts = modulePath.split('/');
            const part0 = parts[0];
            if (!part0) return 'vendor';

            const packageName = part0.startsWith('@')
              ? `${part0}/${parts[1]}`
              : part0;

            return packageName || 'vendor';
          }
        }
      }
    }
  },
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
