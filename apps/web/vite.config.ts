import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const server = env.VITE_SERVER_URL || "http://localhost:8420"
  return {
    clearScreen: false,
    resolve: { tsconfigPaths: true },
    server: {
      port: 5173,
      strictPort: true,
      // The browser stays on this origin; the server sees it as PUBLIC_URL.
      proxy: { "/api": { target: server, changeOrigin: false } },
    },
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
  }
})
