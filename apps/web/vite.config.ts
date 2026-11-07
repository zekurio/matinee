import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { brotliCompress, constants, gzip } from "node:zlib"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"

const brotli = promisify(brotliCompress)
const gz = promisify(gzip)

/**
 * Brotli and gzip copies of every text file next to it, which the server
 * sends to browsers that take them. Compressing once at build time allows
 * the slowest, smallest settings.
 */
function precompress(): Plugin {
  return {
    name: "matinee:precompress",
    apply: "build",
    async writeBundle(options, bundle) {
      const dir = options.dir
      if (!dir) return
      const files = Object.keys(bundle).filter((file) =>
        /\.(?:js|css|html|svg|json)$/.test(file),
      )
      await Promise.all(
        files.map(async (file) => {
          const path = join(dir, file)
          const data = await readFile(path)
          if (data.byteLength < 1024) return
          const [br, gzipped] = await Promise.all([
            brotli(data, {
              params: {
                [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
                [constants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
              },
            }),
            gz(data, { level: constants.Z_BEST_COMPRESSION }),
          ])
          await Promise.all([
            writeFile(`${path}.br`, br),
            writeFile(`${path}.gz`, gzipped),
          ])
        }),
      )
    },
  }
}

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
      precompress(),
    ],
  }
})
