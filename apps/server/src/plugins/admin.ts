import { rm } from "node:fs/promises"

import { pluginGrant, type PluginConfigValues } from "@matinee/contracts"
import { ORPCError } from "@orpc/server"

import { builtins, notifyBuiltin } from "./builtin"
import { validateValue } from "./config"
import { files, isManagedPath, readFolder } from "./files"
import { forgetHostStorage } from "./host"
import { pluginInfo } from "./info"
import { clearPluginLogs, pluginLogs } from "./logs"
import {
  authOptions,
  runtimes,
  serialize,
  startRuntime,
  stopRuntime,
} from "./runtime"
import {
  changed,
  deleteRow,
  linkedAccounts,
  removeLinks,
  rows,
  saveRow,
} from "./store"

export function badRequest(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message })
}
function installed(id: string) {
  if (builtins.has(id))
    badRequest(
      `Plugin ${id} is built in. Its settings can be changed, but it can't be stopped or removed.`,
    )
  const row = rows.get(id)
  if (!row)
    throw new ORPCError("NOT_FOUND", {
      message: `Plugin ${id} wasn't found. Rescan the plugin folders.`,
    })
  return row
}
export function setEnabled(id: string, enabled: boolean) {
  return serialize(id, async () => {
    installed(id)
    await saveRow(id, { enabled })
    await stopRuntime(id)
    if (enabled) await startRuntime(id, true)
    return pluginInfo(id)
  })
}
export function approvePlugin(id: string, integrity: string) {
  return serialize(id, async () => {
    installed(id)
    const file = files.get(id)
    if (!file)
      badRequest("The plugin's folder is missing. Restore it and rescan first.")
    const current = await readFolder(file.path, file.external).catch(() => null)
    if (!current || current.id !== id) {
      await stopRuntime(id)
      files.delete(id)
      changed()
      badRequest("The plugin's files changed. Look at it again.")
    }
    if (current.files.integrity !== file.integrity) await stopRuntime(id)
    files.set(id, current.files)
    changed()
    if (current.files.integrity !== integrity)
      badRequest("The plugin's files changed. Look at it again.")
    if (!current.files.manifest || current.files.problems.length)
      badRequest("Fix the plugin's manifest and rescan before approving it.")
    await saveRow(id, {
      manifest: current.files.manifest,
      grant: pluginGrant(current.files.manifest),
      integrity,
    })
    await stopRuntime(id)
    await startRuntime(id, true)
    return pluginInfo(id)
  })
}
export function configurePlugin(
  id: string,
  values: PluginConfigValues,
  links?: "keep" | "remove",
) {
  return serialize(id, async () => {
    const info = pluginInfo(id)
    const builtin = builtins.get(id)?.definition
    const row = rows.get(id)
    const config = { ...row?.config }
    const secrets = { ...row?.secrets }
    // A subject only means a person at one service. Pointing a sign-in
    // plugin somewhere else, or reading the subject from another field,
    // would let whoever has a linked subject there into that account. So
    // the admin has to say what happens to the links.
    const moved = info.config.identity.filter((key) => {
      const field = info.config.fields.find((item) => item.key === key)
      if (!field || !(key in values)) return false
      const now = field.type === "secret" ? secrets[key] : config[key]
      return (
        (values[key] ?? field.default ?? null) !==
        (now ?? field.default ?? null)
      )
    })
    if (moved.length && !links) {
      const linked = await linkedAccounts(id)
      if (linked > 0)
        badRequest(
          `This changes where people sign in, and ${linked} ${linked === 1 ? "account is" : "accounts are"} linked through ${info.name}. Say whether to keep the links or remove them.`,
        )
    }
    for (const [key, value] of Object.entries(values)) {
      const field = info.config.fields.find((item) => item.key === key)
      if (!field) badRequest(`Plugin ${id} has no config field named ${key}.`)
      validateValue(field, value)
      const environment = builtin?.environment?.[key]?.value
      if (field.type === "secret") {
        if (value === null || value === environment) delete secrets[key]
        else {
          // validateValue has checked the secret's scalar type.
          const text = String(value)
          secrets[key] = text
        }
      } else if (value === null || value === environment) delete config[key]
      else config[key] = value
    }
    const next: Parameters<typeof saveRow>[1] = { config, secrets }
    if (builtin) {
      next.source = { type: "builtin" }
      next.manifest = null
    }
    await saveRow(id, next)
    if (moved.length && links === "remove") await removeLinks(id)
    if (builtin) notifyBuiltin(id)
    else {
      await stopRuntime(id)
      await startRuntime(id, true)
    }
    return pluginInfo(id)
  })
}
export function setPluginAuthOptions(
  id: string,
  provider: string,
  allowSignUp: boolean,
) {
  return serialize(id, async () => {
    const row = installed(id)
    const manifest = files.get(id)?.manifest ?? row.manifest
    if (!manifest?.contributes.auth.some((item) => item.id === provider))
      badRequest(`Plugin ${id} has no sign-in provider named ${provider}.`)
    const auth = Object.fromEntries(
      manifest.contributes.auth.map((item) => [
        item.id,
        authOptions(id, item.id),
      ]),
    )
    auth[provider] = { ...auth[provider], allowSignUp }
    await saveRow(id, { options: { ...row.options, auth } })
    return pluginInfo(id)
  })
}
export function restartPlugin(id: string) {
  return serialize(id, async () => {
    installed(id)
    await stopRuntime(id)
    await startRuntime(id, true)
    return pluginInfo(id)
  })
}
export function removePlugin(id: string): Promise<void> {
  return serialize(id, async () => {
    installed(id)
    const file = files.get(id)
    if (file && (file.external || !isManagedPath(file.path)))
      badRequest(
        "This plugin comes from MATINEE_PLUGIN_DIRS. Remove it there, then rescan.",
      )
    await stopRuntime(id)
    // Only files the server found, in its own directory, are deleted. A
    // plugin whose files are already gone is just forgotten.
    if (file) await rm(file.path, { recursive: true, force: true })
    files.delete(id)
    await deleteRow(id)
    runtimes.delete(id)
    forgetHostStorage(id)
    clearPluginLogs(id)
  })
}
export function readPluginLogs(id: string) {
  pluginInfo(id)
  return pluginLogs(id)
}
