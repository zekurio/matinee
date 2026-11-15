/*
 * Writes the iOS package's ContractModels.swift and ContractApi.swift
 * from the OpenAPI document the server serves. With
 * `--check`, it writes nothing and fails when either file is out of date,
 * which `pnpm verify` runs so a contract change can't leave the app behind.
 *
 *   pnpm api:ios            (from the repository root)
 *   pnpm api:ios --check
 */
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { clientDocument } from "./client-document"
import { swiftClient } from "./swift-client"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const target = join(
  root,
  "apps/ios/Packages/MatineeCore/Sources/MatineeCore/Api",
)

const document = await clientDocument()

const check = process.argv.includes("--check")
const stale: string[] = []
for (const [name, contents] of swiftClient(document)) {
  const path = join(target, name)
  const current = await readFile(path, "utf8").catch(() => null)
  if (current === contents) continue
  if (check) stale.push(relative(root, path))
  else await writeFile(path, contents)
}

if (stale.length > 0) {
  process.stderr.write(
    `${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} out of date with the contract. Run \`pnpm api:ios\`.\n`,
  )
  process.exitCode = 1
}
