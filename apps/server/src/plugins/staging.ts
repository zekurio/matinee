import { randomUUID } from "node:crypto"

import {
  addedPermissions,
  pluginGrant,
  pluginPermissions,
  type PluginInstallSource,
  type PluginPreview,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import type { PluginRow } from "@matinee/db"

import { badRequest } from "./admin"
import { builtins } from "./builtin"
import {
  errorText,
  files,
  integrity,
  keepPackage,
  readFolder,
  restorePackage,
  writePackage,
  type WrittenPackage,
} from "./files"
import { pluginInfo } from "./info"
import {
  fetchPluginPackage,
  PluginInstallError,
  type FetchedPlugin,
} from "./install"
import { serialize, startRuntime, stopRuntime } from "./runtime"
import { rows, saveRow } from "./store"

const staged = new Map<
  string,
  { pkg: FetchedPlugin; expires: number; timer: NodeJS.Timeout }
>()
function discard(ticket: string): void {
  clearTimeout(staged.get(ticket)?.timer)
  staged.delete(ticket)
}
function prune(): void {
  for (const [ticket, item] of staged)
    if (item.expires <= Date.now()) discard(ticket)
}
function canInstall(id: string): void {
  if (builtins.has(id))
    badRequest(`Plugin ${id} is built in and can't be replaced.`)
  const row = rows.get(id)
  if (
    files.get(id)?.external ||
    (row?.source.type === "directory" && !pluginInfo(id).removable)
  )
    badRequest(
      `Plugin ${id} comes from MATINEE_PLUGIN_DIRS. Update it there instead.`,
    )
}
export async function inspectPlugin(
  source: t.infer<typeof PluginInstallSource>,
): Promise<PluginPreview> {
  let pkg: FetchedPlugin
  try {
    pkg = await fetchPluginPackage(source)
  } catch (cause) {
    if (cause instanceof PluginInstallError) badRequest(cause.message)
    throw cause
  }
  canInstall(pkg.manifest.id)
  prune()
  while (staged.size >= 8) {
    const oldest = staged.keys().next().value
    if (oldest) discard(oldest)
  }
  const ticket = randomUUID()
  const timer = setTimeout(() => discard(ticket), 10 * 60_000).unref()
  staged.set(ticket, { pkg, expires: Date.now() + 10 * 60_000, timer })
  const row = rows.get(pkg.manifest.id)
  return {
    ticket,
    manifest: pkg.manifest,
    permissions: pluginPermissions(pkg.manifest),
    integrity: integrity(pkg.packageJson, pkg.main),
    installedVersion: row?.manifest?.version ?? null,
    added: addedPermissions(row?.grant ?? null, pkg.manifest),
  }
}
export async function installPlugin(ticket: string, enable: boolean) {
  prune()
  const item = staged.get(ticket)
  if (!item)
    badRequest(
      "This plugin preview expired or was already installed. Start again by inspecting the package.",
    )
  discard(ticket)
  const { pkg } = item
  return serialize(pkg.manifest.id, async () => {
    const id = pkg.manifest.id
    canInstall(id)
    const before = rows.get(id)
    await stopRuntime(id)
    const written = await writePackage(pkg)
    let failure: string | null = null
    try {
      const current = await readFolder(written.path, false)
      if (!current?.files.manifest)
        throw new Error("Couldn't read the installed plugin files")
      files.set(id, current.files)
      await saveRow(id, {
        source: pkg.source,
        manifest: pkg.manifest,
        grant: pluginGrant(pkg.manifest),
        integrity: integrity(pkg.packageJson, pkg.main),
        enabled: enable,
        update: null,
      })
      await startRuntime(id, true)
      const info = pluginInfo(id)
      if (info.state === "error")
        failure = info.error ?? "It stopped while starting."
    } catch (cause) {
      if (!before || !written.previous) throw cause
      failure = errorText(cause)
    }
    // An update that doesn't start must not cost the version that worked.
    // A first install has nothing to go back to and stays, with its error.
    if (failure === null || !before || !written.previous) {
      await keepPackage(written)
      return pluginInfo(id)
    }
    await goBack(id, written, before)
    badRequest(
      `Version ${pkg.manifest.version} didn't start, so ${before.manifest?.version ? `version ${before.manifest.version}` : "the installed version"} was kept. ${failure}`,
    )
  })
}
/**
 * Undo an update: the files that were replaced and the row that went with
 * them. What the new version stored before it failed stays.
 */
async function goBack(
  id: string,
  written: WrittenPackage,
  before: PluginRow,
): Promise<void> {
  await stopRuntime(id)
  await restorePackage(written)
  const restored = await readFolder(written.path, false)
  if (restored) files.set(id, restored.files)
  else files.delete(id)
  await saveRow(id, {
    source: before.source,
    manifest: before.manifest,
    grant: before.grant,
    integrity: before.integrity,
    enabled: before.enabled,
    update: before.update,
  })
  await startRuntime(id, true)
}
