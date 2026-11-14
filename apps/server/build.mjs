// Bundles the server and its workers for production. All runtime files live
// in dist/server, including QuickJS's WebAssembly binary.
import { cp, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const dist = fileURLToPath(new URL("dist/", import.meta.url))

await rm(dist, { recursive: true, force: true })
await build({
  entryPoints: [fileURLToPath(new URL("src/index.ts", import.meta.url))],
  outfile: `${dist}server/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // Readable stack traces in the logs, without source maps to load.
  minify: false,
  keepNames: true,
  // Some dependencies are CommonJS and require Node's modules.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "warning",
})
await build({
  entryPoints: [
    fileURLToPath(new URL("src/media/subtitle-worker.ts", import.meta.url)),
  ],
  outfile: `${dist}server/subtitle-worker.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  logLevel: "warning",
})
// The worker a plugin's sandbox runs in. With `--checks`, also the sandbox
// on its own, so `plugin-sandbox-check.ts --bundle` runs against what
// ships without starting the server. Production has no use for that one.
await build({
  entryPoints: {
    "plugin-worker": fileURLToPath(
      new URL("src/plugins/sandbox/worker.ts", import.meta.url),
    ),
    ...(process.argv.includes("--checks") && {
      "plugin-sandbox": fileURLToPath(
        new URL("src/plugins/sandbox/index.ts", import.meta.url),
      ),
    }),
  },
  outdir: `${dist}server`,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "warning",
})
await cp(
  fileURLToPath(
    import.meta.resolve("@jitl/quickjs-ng-wasmfile-release-sync/wasm"),
  ),
  `${dist}server/plugin-quickjs.wasm`,
)
// @matinee/db finds its migrations at ../drizzle from its own file, which
// is dist/server/index.mjs once bundled.
await cp(
  fileURLToPath(new URL("../../packages/db/drizzle", import.meta.url)),
  `${dist}drizzle`,
  { recursive: true },
)
