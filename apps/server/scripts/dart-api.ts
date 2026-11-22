/*
 * Writes the Flutter app's API client, apps/flutter/lib/api, from the
 * OpenAPI document the server serves. With `--check`, nothing is written
 * and a file that's out of date fails, which `pnpm verify` runs so a
 * contract change can't leave the app behind.
 *
 *   pnpm api:dart            (from the repository root)
 *   pnpm api:dart --check
 */
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { dartClient } from "./dart-client"
import type { Document } from "./openapi-walker"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const folder = "apps/flutter/lib/api"

// env.ts wants a database to start, though the document never opens one.
process.env.DATABASE_URL ??= "postgres://localhost/matinee"
const { openapiSpec } = await import("../src/rpc/openapi")
// SAFETY: The converter writes these schemas and oRPC wraps the event streams;
// Document names the parts of that document the generator reads.
const document = (await openapiSpec()) as Document

const check = process.argv.includes("--check")
const stale: string[] = []
for (const [name, contents] of dartClient(document)) {
  const path = join(folder, name)
  const current = await readFile(join(root, path), "utf8").catch(() => null)
  if (current === contents) continue
  if (check) stale.push(path)
  else await writeFile(join(root, path), contents)
}

if (stale.length > 0) {
  process.stderr.write(
    `${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} out of date with the contract. Run \`pnpm api:dart\`.\n`,
  )
  process.exitCode = 1
}
