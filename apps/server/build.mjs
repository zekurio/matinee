// Bundles the server and its idle-I/O subtitle reader for production, so
// both start as plain Node without a TypeScript compiler in the process.
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
// @matinee/db finds its migrations at ../drizzle from its own file, which
// is dist/server/index.mjs once bundled.
await cp(
  fileURLToPath(new URL("../../packages/db/drizzle", import.meta.url)),
  `${dist}drizzle`,
  { recursive: true },
)
