import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { brotliCompress, constants, gzip } from "node:zlib"

import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"

const EAGER_ROUTES = new Set<string>([
  "/_authed",
  "/_authed/_shell",
  "/_authed/_shell/",
])

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

/**
 * Starts loading the interface's language with the page rather than after
 * the app's code has run and asked for it: an inline script picks the
 * language as `stores/language.ts` and `i18n` do, and preloads its chunk.
 */
function preloadLocale(): Plugin {
  return {
    name: "matinee:preload-locale",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const files = new Map<string, string>()
        for (const output of Object.values(ctx.bundle ?? {})) {
          if (output.type !== "chunk") continue
          const tag = /[\\/]i18n[\\/]locales[\\/]([^\\/]+)[\\/]index\.ts$/.exec(
            output.facadeModuleId ?? "",
          )?.[1]
          if (tag) files.set(tag, `/${output.fileName}`)
        }
        if (files.size === 0) return html
        const script = `(function () {
  try {
    var files = ${JSON.stringify(Object.fromEntries(files))}
    var stored = JSON.parse(localStorage.getItem("matinee.language") || "null")
    var picked = stored && stored.state && stored.state.language
    var wanted = picked && picked !== "auto" ? [picked] : navigator.languages
    var tags = Object.keys(files)
    for (var i = 0; i < wanted.length; i++) {
      var tag = wanted[i].toLowerCase()
      if (tag === "en" || tag.indexOf("en-") === 0) return
      var match = tags.filter(function (t) {
        return t.toLowerCase() === tag || t.split("-")[0] === tag.split("-")[0]
      })[0]
      if (match) {
        var link = document.createElement("link")
        link.rel = "modulepreload"
        link.crossOrigin = ""
        link.href = files[match]
        document.head.appendChild(link)
        return
      }
    }
  } catch (e) {}
})()`
        return {
          html,
          tags: [{ tag: "script", children: script, injectTo: "head" }],
        }
      },
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
    build: {
      rolldownOptions: {
        output: {
          // Folds chunks under 16 kB, mostly icons and route stubs, into
          // the chunks that use them. That costs a few duplicate kilobytes
          // in pages loaded later, and takes the app's first load from 70
          // requests to 15, which matters on HTTP/1.1 with real latency.
          codeSplitting: { experimentalInlineCommonChunks: { maxSize: 16384 } },
        },
      },
    },
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        codeSplittingOptions: {
          // The layout every signed-in page sits in, and Home, where most
          // visits start, come with the app instead of after the session
          // check, which would add a round trip before the first paint.
          splitBehavior: ({ routeId }) =>
            EAGER_ROUTES.has(routeId) ? [] : undefined,
        },
      }),
      react(),
      tailwindcss(),
      preloadLocale(),
      precompress(),
    ],
  }
})
