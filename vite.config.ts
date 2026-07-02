/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@/integrations/supabase/client": path.resolve(__dirname, "./src/lib/supabase/client.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["snarkjs"],
    esbuildOptions: {
      // snarkjs uses globalThis.crypto — available in modern browsers and Node 20+
      target: "es2022",
    },
  },
  build: {
    rollupOptions: {
      // snarkjs is large (~2MB) — split it into its own chunk so it only loads on ZK pages
      output: {
        manualChunks: {
          snarkjs: ["snarkjs"],
        },
      },
    },
  },
});
