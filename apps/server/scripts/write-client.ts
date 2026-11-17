/*
 * What the native clients' generators share: the OpenAPI document the server
 * serves, and writing a client's files from it. With `--check`, nothing is
 * written and a file that's out of date fails, which `pnpm verify` runs so
 * a contract change can't leave an app behind.
 */
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { Document } from "./kotlin-client"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")

/** Writes `render`'s files into `folder`, a path from the repository root. */
export async function writeClient(
  command: string,
  folder: string,
  render: (document: Document) => Map<string, string>,
): Promise<void> {
  // env.ts wants a database to start, though the document never opens one.
  process.env.DATABASE_URL ??= "postgres://localhost/matinee"
  const { openapiSpec } = await import("../src/rpc/openapi")
  // SAFETY: The converter writes these schemas and oRPC wraps the event streams;
  // Document names the parts of that document the native generators read.
  const document = (await openapiSpec()) as Document

  const check = process.argv.includes("--check")
  const stale: string[] = []
  for (const [name, contents] of render(document)) {
    const path = join(folder, name)
    const current = await readFile(join(root, path), "utf8").catch(() => null)
    if (current === contents) continue
    if (check) stale.push(path)
    else await writeFile(join(root, path), contents)
  }

  if (stale.length > 0) {
    process.stderr.write(
      `${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} out of date with the contract. Run \`${command}\`.\n`,
    )
    process.exitCode = 1
  }
}
