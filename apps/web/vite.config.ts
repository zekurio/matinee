import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { brotliCompress, constants, gzip } from "node:zlib"

import solid from "@solidjs/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { defineConfig, loadEnv, type Plugin } from "vite"

const EAGER_ROUTES = new Set<string>([
  "/_authed",
  "/_authed/_shell",
  "/_authed/_shell/",
])

/** The version every part of Matinee has, from the root package.json. */
function matineeVersion(): string {
  const root = readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf8",
  )
  return /"version": "([^"]*)"/.exec(root)?.[1] ?? "dev"
}

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
        /\.(?:js|css|html|svg|json|wasm)$/.test(file),
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
        // The TV document has words of its own.
        if (ctx.path.startsWith("/tv/")) return html
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
  var files = ${JSON.stringify(Object.fromEntries(files))}
  var picked = null
  try {
    var stored = JSON.parse(localStorage.getItem("matinee.language") || "null")
    picked = stored && stored.state && stored.state.language
  } catch (e) {
    // Storage that's blocked or holds something else: follow the browser.
    picked = null
  }
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
})()`
        return {
          html,
          tags: [{ tag: "script", children: script, injectTo: "head" }],
        }
      },
    },
  }
}

/**
 * Names the build in each document's head, as `<meta name="matinee-build">`,
 * so a tab can ask the server for the page again and tell whether it's
 * been deployed anew (`lib/new-build.ts`). The root `package.json`'s
 * version changes only with a release, so it can't say that. The name is
 * a hash of every file the document can load, whose names hold hashes of
 * their own content, so the same source builds the same name.
 */
function buildId(): Plugin {
  return {
    name: "matinee:build-id",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, { bundle, chunk }) {
        if (!bundle || !chunk) return
        const files = new Set<string>()
        const visit = (name: string) => {
          const output = bundle[name]
          if (files.has(name) || !output) return
          files.add(name)
          if (output.type !== "chunk") return
          for (const css of output.viteMetadata?.importedCss ?? []) {
            files.add(css)
          }
          for (const asset of output.viteMetadata?.importedAssets ?? []) {
            files.add(asset)
          }
          for (const next of [...output.imports, ...output.dynamicImports]) {
            visit(next)
          }
        }
        visit(chunk.fileName)
        const id = createHash("sha256")
          .update([...files].sort().join("\n"))
          .digest("hex")
          .slice(0, 16)
        return [
          {
            tag: "meta",
            attrs: { name: "matinee-build", content: id },
            injectTo: "head",
          },
        ]
      },
    },
  }
}

/**
 * Serves `/tv` as `/tv/`, whose own document holds the TV UI. The route
 * is a document of its own, so the desktop app's root font size and
 * theme don't follow it, and the TV one doesn't follow the desktop app.
 */
function tvPath(): Plugin {
  return {
    name: "matinee:tv-path",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (request.url === "/tv" || request.url?.startsWith("/tv?")) {
          request.url = `/tv/${request.url.slice(3)}`
        }
        next()
      })
    },
  }
}

/**
 * Asks for the text face from the page's head. The first render waits for
 * it (`main.tsx`), and asked for only once the app's code has run, it
 * arrives after that code is done.
 */
function preloadTextFace(): Plugin {
  return {
    name: "matinee:preload-text-face",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, { bundle }) {
        const face = Object.keys(bundle ?? {}).find((name) =>
          /\/red-hat-text-latin-wght-normal-[\w-]+\.woff2$/.test(name),
        )
        if (!face) return
        return [
          {
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              href: `/${face}`,
              crossorigin: "",
            },
            injectTo: "head",
          },
        ]
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const server = env.VITE_SERVER_URL || "http://localhost:8420"
  return {
    clearScreen: false,
    define: { __MATINEE_VERSION__: JSON.stringify(matineeVersion()) },
    // A core entry the app imports must be the copy `@ui-sdk/solid` loads.
    // The TV package is source, compiled with this app's Solid plugin.
    optimizeDeps: {
      exclude: ["@matinee/tv", "@matinee/tv/tv-mode", "@ui-sdk/core"],
    },
    // `@/` in imports is `src/`, as tsconfig.json maps it.
    resolve: { tsconfigPaths: true },
    server: {
      port: 5173,
      strictPort: true,
      // The browser stays on this origin; the server sees it as PUBLIC_URL.
      // The slash keeps pages like /api-docs with the app.
      proxy: { "/api/": { target: server, changeOrigin: false } },
    },
    build: {
      rolldownOptions: {
        // The desktop app, and the TV UI at /tv/, in one build.
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          tv: fileURLToPath(new URL("./tv/index.html", import.meta.url)),
        },
        // A contract module only builds schemas, so one whose exports the
        // page never uses can be left out. Without this, one import from
        // the package's index builds every schema before the first screen.
        treeshake: {
          moduleSideEffects: [
            { test: /\/packages\/contracts\/src\//, sideEffects: false },
          ],
        },
        output: {
          // Folds chunks under 16 kB, mostly icons and route stubs, into
          // the chunks that use them, which takes the first load from many
          // requests to few, and that matters on HTTP/1.1 with latency.
          codeSplitting: { experimentalInlineCommonChunks: { maxSize: 16384 } },
        },
      },
    },
    plugins: [
      tvPath(),
      tanstackRouter({
        target: "solid",
        autoCodeSplitting: true,
        codeSplittingOptions: {
          splitBehavior: ({ routeId }) =>
            EAGER_ROUTES.has(routeId) ? [] : undefined,
        },
      }),
      solid(),
      tailwindcss(),
      preloadTextFace(),
      buildId(),
      preloadLocale(),
      precompress(),
    ],
  }
})
