import { isDeepStrictEqual } from "node:util"

import {
  PLUGIN_API_VERSION,
  pluginGrant,
  type PluginState,
} from "@matinee/contracts"
import type { PluginRow } from "@matinee/db"

import { invalidConfig, missingConfig, resolveConfig } from "./config"
import type { PluginFiles } from "./files"

export type PluginComputedState = { state: PluginState; error: string | null }
export type RuntimeState = {
  state: "starting" | "running" | "error"
  error: string | null
}
export function approved(row: PluginRow, file: PluginFiles): boolean {
  return (
    !!file.manifest &&
    isDeepStrictEqual(row.grant, pluginGrant(file.manifest)) &&
    row.integrity === file.integrity
  )
}
/** State precedence is shared by the admin view and the supervisor. */
export function pluginState(
  row: PluginRow,
  file: PluginFiles | undefined,
  runtime?: RuntimeState,
): PluginComputedState {
  const manifest = file?.manifest ?? row.manifest
  if (file?.problems.length)
    return { state: "incompatible", error: file.problems.join("\n") }
  if (manifest && manifest.api !== PLUGIN_API_VERSION)
    return {
      state: "incompatible",
      error: `This plugin needs API ${manifest.api}; this server supports API ${PLUGIN_API_VERSION}.`,
    }
  if (!file)
    return {
      state: "missing",
      error: "The plugin's folder is missing. Restore it or remove the plugin.",
    }
  if (!row.enabled) return { state: "disabled", error: null }
  if (!approved(row, file)) return { state: "needs-approval", error: null }
  if (manifest) {
    const values = resolveConfig(manifest.config, row)
    if (
      missingConfig(manifest.config, values) ||
      invalidConfig(manifest.config, values).length
    )
      return { state: "needs-config", error: null }
  }
  return runtime ?? { state: "starting", error: null }
}
