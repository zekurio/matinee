import { fileURLToPath } from "node:url"

import solid from "@solidjs/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { defineConfig, loadEnv, type Plugin } from "vite"

const EAGER_ROUTES = new Set<string>([
  "/_authed",
  "/_authed/_shell",
  "/_authed/_shell/",
])

const OWN_SRC = fileURLToPath(new URL("./src/", import.meta.url))
const REACT_SRC = fileURLToPath(new URL("../web/src/", import.meta.url))

/**
 * `@/x` is this app's `src/x` when there is one, and the React app's
 * otherwise, whichever app the importing file is in. So a file with no
 * React in it is shared as it is, and one that needs porting is ported by
 * writing it here under the same name. `tsconfig.json` lists the same two
 * places for the type checker; Vite's own reading of `paths` would go by
 * the importing file's tsconfig, and send the React app's files back to
 * the React app's copies.
 */
function sharedSource(): Plugin {
  return {
    name: "matinee:shared-source",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.startsWith("@/")) return null
      const path = source.slice(2)
      for (const root of [OWN_SRC, REACT_SRC]) {
        const found = await this.resolve(root + path, importer, {
          ...options,
          skipSelf: true,
        })
        if (found) return found
      }
      return null
    },
  }
}

/** Packages only the React app may load. */
const REACT_ONLY =
  /^(?:react|react-dom|zustand|lucide-react|sonner|@base-ui\/react|@tanstack\/react-[a-z-]+)(?:\/|$)/

/**
 * Fails the build when a module reaches for React. A file shared from the
 * React app through `@/` can import a neighbour by its relative path, which
 * skips this app's own copy and would bundle React without a word.
 */
function noReact(): Plugin {
  return {
    name: "matinee:no-react",
    enforce: "pre",
    resolveId(source, importer) {
      if (!REACT_ONLY.test(source) || source === "zustand/vanilla") return null
      this.error(
        `${importer ?? "The entry"} imports ${source}. Port that file to src/, or the one that led to it.`,
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const server = env.VITE_SERVER_URL || "http://localhost:8420"
  return {
    clearScreen: false,
    // A core entry the app imports must be the copy `@ui-sdk/solid` loads.
    optimizeDeps: { exclude: ["@ui-sdk/core"] },
    server: {
      // Beside the React app on 5173. Cookies go by host, so a session
      // from either works in both; a passkey is bound to PUBLIC_URL, so
      // sign in on that one, or run this on its port.
      port: Number(env.SOLID_PORT) || 5174,
      strictPort: true,
      proxy: { "/api/": { target: server, changeOrigin: false } },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: { experimentalInlineCommonChunks: { maxSize: 16384 } },
        },
      },
    },
    plugins: [
      sharedSource(),
      noReact(),
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
    ],
  }
})
