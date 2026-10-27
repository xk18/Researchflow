import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/release/**", "**/artifacts/**", "**/test-results/**"] } },
  clearScreen: false,
  build: { target: "es2022" },
});
