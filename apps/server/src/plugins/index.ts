import type {
  PluginAuthContribution,
  PluginConfigField,
  PluginConfigValue,
  PluginMetadataContribution,
  PluginState,
} from "@matinee/contracts"
import type { JsonValue } from "@matinee/db"

import { registerBuiltin } from "./builtin"
import { initializePlugins } from "./discovery"
import { startEventDelivery, stopEventDelivery } from "./events"
export {
  recordPluginEvent,
  recordPluginEvents,
  retryPluginEvents,
} from "./events"
import {
  authContributions,
  metadataContributions,
  metadataDeclarations,
  onMetadataStarted,
  stopRuntimes,
} from "./runtime"

export { pluginInfo, pluginList } from "./info"
export { rescanPlugins } from "./discovery"
export {
  setEnabled,
  approvePlugin,
  configurePlugin,
  setPluginAuthOptions,
  restartPlugin,
  removePlugin,
  readPluginLogs,
} from "./admin"
export { inspectPlugin, installPlugin } from "./staging"
export { checkPluginUpdates, browsePlugins } from "./updates"

/** A contribution of a plugin that is running now. */
export type Running<C> = {
  pluginId: string
  pluginName: string
  contribution: C
  /** Host options an admin set for it, like `{ allowSignUp: true }`. */
  options: Readonly<Record<string, boolean | number | string | null>>
  /**
   * Call `<kind>.<contribution id>.<method>` in the plugin's sandbox with
   * JSON arguments. Rejects with `SandboxError` from `./sandbox`. The
   * result is JSON the plugin made up: parse it with a `t` schema.
   */
  call(
    method: string,
    args: JsonValue[],
    options?: { timeoutMs?: number },
  ): Promise<JsonValue>
  /** Whether the plugin's grant lets it reach this URL. */
  allows(url: string): boolean
}

/** A metadata provider an installed plugin declares, running or not. */
export type DeclaredMetadata = {
  pluginId: string
  pluginName: string
  contribution: PluginMetadataContribution
  state: PluginState
}

/** Load the saved plugins and start the enabled, approved ones. */
export async function startPlugins(): Promise<void> {
  await initializePlugins()
  await startEventDelivery()
}

/** Stop every sandbox, for shutdown. Never rejects. */
export async function stopPlugins(): Promise<void> {
  await stopEventDelivery()
  await stopRuntimes()
}

export function runningMetadata(): Running<PluginMetadataContribution>[] {
  return metadataContributions()
}

export function runningAuth(): Running<PluginAuthContribution>[] {
  return authContributions()
}

/** Every metadata provider of an installed plugin, with its plugin's state. */
export function declaredMetadata(): DeclaredMetadata[] {
  return metadataDeclarations()
}

/**
 * Hear when plugins' metadata providers start, by provider id: at server
 * start, when an admin turns a plugin on, and after one restarts. The
 * libraries that use them have waited since they stopped.
 */
export function onPluginMetadataStarted(
  listener: (providerIds: string[]) => void,
): void {
  onMetadataStarted(listener)
}

export type BuiltinPluginDefinition = {
  id: string
  name: string
  description: string
  homepage?: string
  config: PluginConfigField[]
  /**
   * The environment variable behind a config field, with the value the
   * server read for it (`env.ts` resolves `NAME_FILE` too). A saved value
   * wins over it.
   */
  environment?: Record<
    string,
    { variable: string; value: string | number | boolean | undefined }
  >
  metadata?: PluginMetadataContribution[]
}

export type BuiltinPlugin = {
  /** Saved values over the environment's over the fields' defaults. Sync. */
  config(): Readonly<Record<string, PluginConfigValue>>
  /** Runs after an admin saves the plugin's settings. */
  onChange(listener: () => void): void
}

/**
 * Register a first-party plugin compiled into the server, so it shows in
 * the plugin list and its settings are edited there. Call it at module
 * scope; `config()` is valid once `startPlugins` resolved, and gives the
 * environment's values before that.
 */
export function defineBuiltinPlugin(
  definition: BuiltinPluginDefinition,
): BuiltinPlugin {
  return registerBuiltin(definition)
}
