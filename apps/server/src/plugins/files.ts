import { createHash, randomUUID } from "node:crypto"
import {
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path"

import {
  parsePluginManifest,
  PluginId,
  type PluginManifest,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { env } from "../env"
import { log } from "../log"
import type { FetchedPlugin } from "./install"
import { Json } from "./schema"

export type PluginFiles = {
  path: string
  external: boolean
  manifest: PluginManifest | null
  integrity: string
  code: string
  problems: string[]
}
export const files = new Map<string, PluginFiles>()
let managedRoot = env.pluginsDir
export function isManagedPath(path: string): boolean {
  return inside(managedRoot, path)
}
const warned = new Set<string>()
const PartialPackage = t.object({
  matinee: t.object({ id: t.string().optional() }).optional(),
})

export function inside(parent: string, child: string): boolean {
  const path = relative(resolve(parent), resolve(child))
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  )
}
export function integrity(packageJson: Uint8Array, main: Uint8Array): string {
  return createHash("sha256")
    .update(packageJson)
    .update(Buffer.from([0]))
    .update(main)
    .digest("hex")
}
function warnOnce(message: string): void {
  if (warned.has(message)) return
  warned.add(message)
  log.warn(message)
}
export function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Unexpected plugin failure"
}
async function boundedRead(
  root: string,
  name: string,
  max: number,
): Promise<Buffer> {
  const path = await realpath(join(root, name))
  if (!inside(root, path))
    throw new Error(`${name} points outside the plugin folder`)
  const handle = await open(path, "r")
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > max)
      throw new Error(`${name} must be a regular file of at most ${max} bytes`)
    // A bounded read also covers a file growing between stat and read.
    const bytes = Buffer.alloc(max + 1)
    let length = 0
    while (length <= max) {
      const result = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null,
      )
      if (!result.bytesRead) break
      length += result.bytesRead
    }
    if (length > max) throw new Error(`${name} is too large`)
    return bytes.subarray(0, length)
  } finally {
    await handle.close()
  }
}
export async function readFolder(
  folder: string,
  external: boolean,
): Promise<{ id: string; files: PluginFiles } | null> {
  const path = await realpath(folder)
  let packageJson: Buffer
  try {
    packageJson = await boundedRead(path, "package.json", 1024 * 1024)
  } catch (cause) {
    // Ordinary directories aren't plugins. An unreadable package is logged.
    if (await stat(join(path, "package.json")).catch(() => null))
      warnOnce(`${path}: ${errorText(cause)}`)
    return null
  }
  let parsed: ReturnType<typeof parsePluginManifest>
  let id = PluginId.safeParse(basename(folder)).data
  try {
    const json = Json.parse(JSON.parse(packageJson.toString("utf8")))
    const partial = PartialPackage.safeParse(json)
    const declared = PluginId.safeParse(partial.data?.matinee?.id)
    if (declared.success) id = declared.data
    parsed = parsePluginManifest(json)
    if (partial.success && !partial.data.matinee) return null
  } catch (cause) {
    parsed = [errorText(cause)]
  }
  if (!id) {
    warnOnce(`Skipping plugin folder ${path}: no usable plugin id`)
    return null
  }
  const result: PluginFiles = {
    path,
    external,
    manifest: null,
    integrity: "",
    code: "",
    problems: [],
  }
  if (Array.isArray(parsed)) result.problems = parsed
  else {
    id = parsed.id
    result.manifest = parsed
    try {
      const main = await boundedRead(path, parsed.main, 5 * 1024 * 1024)
      result.integrity = integrity(packageJson, main)
      result.code = main.toString("utf8")
    } catch (cause) {
      result.problems.push(errorText(cause))
    }
  }
  return { id, files: result }
}
async function children(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  const result: string[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue
    const child = join(path, entry.name)
    if ((await stat(child).catch(() => null))?.isDirectory()) result.push(child)
  }
  return result
}
export async function discover(): Promise<Map<string, PluginFiles>> {
  managedRoot = await realpath(env.pluginsDir).catch(() => env.pluginsDir)
  const found = new Map<string, PluginFiles>()
  const candidates = (await children(env.pluginsDir)).map((path) => ({
    path,
    external: false,
  }))
  for (const path of env.pluginDirs) {
    candidates.push({ path, external: true })
    candidates.push(
      ...(await children(path)).map((child) => ({
        path: child,
        external: true,
      })),
    )
  }
  for (const candidate of candidates) {
    try {
      const plugin = await readFolder(candidate.path, candidate.external)
      if (!plugin) continue
      const previous = found.get(plugin.id)
      if (previous) {
        if (previous.path !== plugin.files.path)
          warnOnce(
            `Plugin ${plugin.id} in ${plugin.files.path} is ignored; ${previous.path} was found first`,
          )
      } else found.set(plugin.id, plugin.files)
    } catch (cause) {
      warnOnce(`${candidate.path}: ${errorText(cause)}`)
    }
  }
  return found
}

/**
 * Put right what a server that stopped in the middle of an install left
 * behind, before the first look for plugins. A folder moved aside whose
 * place is empty goes back, since the new one never arrived. Any other
 * leftover is removed. Only for server start: later an install may be
 * using these folders.
 */
export async function recoverPackages(): Promise<void> {
  const entries = await readdir(env.pluginsDir, { withFileTypes: true }).catch(
    () => [],
  )
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(env.pluginsDir, entry.name)
    if (entry.name.startsWith(".stage-"))
      await rm(path, { recursive: true, force: true })
    if (!entry.name.startsWith(".old-")) continue
    const plugin = await readFolder(path, false).catch(() => null)
    const home = plugin && join(env.pluginsDir, plugin.id)
    if (home && !(await stat(home).catch(() => null))) {
      await rename(path, home)
      log.warn(
        `Put plugin ${plugin.id} back in place after an install that didn't finish`,
      )
    } else await rm(path, { recursive: true, force: true })
  }
}
/** A package's files in place, and the ones they replaced, kept for now. */
export type WrittenPackage = { path: string; previous: string | null }
/** Put the replaced files back, as after an update that didn't start. */
export async function restorePackage(written: WrittenPackage): Promise<void> {
  if (!written.previous) return
  const aside = join(dirname(written.path), `.stage-${randomUUID()}`)
  await rename(written.path, aside)
  await rename(written.previous, written.path)
  await rm(aside, { recursive: true, force: true })
}
/** The new files are staying. Let go of the ones they replaced. */
export async function keepPackage(written: WrittenPackage): Promise<void> {
  if (written.previous)
    await rm(written.previous, { recursive: true, force: true })
}
/**
 * Write a package's two files into its folder. Files already there are
 * moved aside and kept, so the caller can go back to them: end with
 * `keepPackage` or `restorePackage`.
 */
export async function writePackage(
  pkg: FetchedPlugin,
): Promise<WrittenPackage> {
  await mkdir(env.pluginsDir, { recursive: true, mode: 0o700 })
  const root = await realpath(env.pluginsDir)
  managedRoot = root
  const destination = join(root, PluginId.parse(pkg.manifest.id))
  const temp = join(root, `.stage-${randomUUID()}`)
  const backup = join(root, `.old-${randomUUID()}`)
  await mkdir(temp, { mode: 0o700 })
  let moved = false
  try {
    const main = join(temp, pkg.manifest.main)
    if (!inside(temp, main))
      throw new Error("The plugin's main file must stay inside its folder")
    await mkdir(dirname(main), { recursive: true, mode: 0o700 })
    await writeFile(join(temp, "package.json"), pkg.packageJson, {
      mode: 0o600,
    })
    await writeFile(main, pkg.main, { mode: 0o600 })
    if (await stat(destination).catch(() => null)) {
      await rename(destination, backup)
      moved = true
    }
    try {
      await rename(temp, destination)
    } catch (cause) {
      if (moved) await rename(backup, destination)
      throw cause
    }
    return { path: destination, previous: moved ? backup : null }
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}
