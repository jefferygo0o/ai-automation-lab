import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const __dirname = new URL(".", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT) || 5173,
    allowedHosts: ["p1.proxy.zo.computer"],
    proxy: {
      "/api": "http://localhost:7777",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
