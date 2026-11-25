import solid from "@solidjs/vite-plugin"
import legacy from "@vitejs/plugin-legacy"
import { defineConfig, loadEnv, type Plugin } from "vite"

/**
 * The oldest engine the app is built for: Chromium 56, which Tizen 4.0
 * (2018) ships. Tizen 5.0 has 63, 6.0 has 76, 9.0 has 120.
 */
const OLDEST = "chrome >= 56"

/**
 * Takes `crossorigin` off the page's scripts. With it the engine asks for
 * them as it would another site's, which a page loaded by file path isn't
 * allowed to, so they'd never run.
 */
function plainScripts(): Plugin {
  return {
    name: "matinee:plain-scripts",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        html.replaceAll(/(<script\b[^>]*?)\s+crossorigin\b/g, "$1"),
    },
  }
}

/**
 * Loads Samsung's own APIs, `window.webapis`, the way its reference asks:
 * a script the TV serves from wherever it keeps them. Only in the build,
 * since a browser has no such file.
 */
function samsungApis(): Plugin {
  return {
    name: "matinee:samsung-apis",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "script",
        attrs: { src: "$WEBAPIS/webapis/webapis.js" },
        injectTo: "head",
      },
    ],
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const server = env.VITE_SERVER_URL || "http://localhost:8420"
  return {
    // The TV loads the app from its own package, by file path.
    base: "./",
    clearScreen: false,
    resolve: { tsconfigPaths: true },
    // The shared TV view is source, compiled here with this app's plugin.
    optimizeDeps: { exclude: ["@matinee/tv"] },
    server: {
      port: 5174,
      strictPort: true,
      // Connect the app to this address in a browser and it talks to the
      // server on its own origin, as the web app does.
      proxy: { "/api/": { target: server, changeOrigin: false } },
    },
    build: {
      // Beside it, scripts/package.mjs writes the package the TV installs.
      outDir: "dist/app",
      cssTarget: "chrome56",
      // One script: a page loaded by file path can't import modules.
      rolldownOptions: { output: { codeSplitting: false } },
    },
    plugins: [
      // The package a TV gets is the production runtime, without the
      // development diagnostics an in-browser session keeps.
      solid({ dev: false, diagnostics: false }),
      legacy({
        targets: [OLDEST],
        // Every TV gets the same build. One for newer engines would only
        // be a second thing to test without a TV.
        renderModernChunks: false,
      }),
      samsungApis(),
      plainScripts(),
    ],
  }
})
