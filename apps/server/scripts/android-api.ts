/*
 * Writes the Android app's API client, apps/android's ContractModels.kt
 * and ContractApi.kt, from the OpenAPI document the server serves. With
 * `--check`, it writes nothing and fails when either file is out of date,
 * which `pnpm verify` runs so a contract change can't leave the app behind.
 *
 *   pnpm api:android            (from the repository root)
 *   pnpm api:android --check
 */
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import type { Document } from "./kotlin-client"
import { kotlinClient } from "./kotlin-client"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const target = join(
  root,
  "apps/android/app/src/main/java/io/github/zekurio/matinee/api",
)

// env.ts wants a database to start, though the document never opens one.
process.env.DATABASE_URL ??= "postgres://localhost/matinee"
const { openapiSpec } = await import("../src/rpc/openapi")

// SAFETY: Every schema in the document is one TypeBoxToJsonSchemaConverter
// wrote or an event stream oRPC wrapped around one; `Document` names the
// parts of those the generator reads.
const document = (await openapiSpec()) as Document

const check = process.argv.includes("--check")
const stale: string[] = []
for (const [name, contents] of kotlinClient(document)) {
  const path = join(target, name)
  const current = await readFile(path, "utf8").catch(() => null)
  if (current === contents) continue
  if (check) stale.push(relative(root, path))
  else await writeFile(path, contents)
}

if (stale.length > 0) {
  process.stderr.write(
    `${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} out of date with the contract. Run \`pnpm api:android\`.\n`,
  )
  process.exitCode = 1
}
