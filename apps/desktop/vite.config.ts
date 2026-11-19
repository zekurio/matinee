import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/*
 * The desktop app's own pages. The build in dist/ goes into the native
 * binary, which serves it from matinee-shell://app/, so asset URLs start
 * at the origin's root and nothing loads from the network.
 */
export default defineConfig(({ command }) => {
  // The dev shell sets NODE_ENV=development, which would build React's
  // development code and the mock shell into the binary. Vite reads it
  // after loading this file.
  if (command === "build") process.env.NODE_ENV = "production"
  return {
    clearScreen: false,
    base: "/",
    resolve: { tsconfigPaths: true },
    server: { port: 5174, strictPort: true },
    build: {
      // The shell's Chromium has module preloading.
      modulePreload: { polyfill: false },
      // One chunk, read from the binary rather than the network: React,
      // and TypeBox for the bridge's schemas, make up most of it.
      chunkSizeWarningLimit: 800,
    },
    plugins: [react(), tailwindcss()],
  }
})
