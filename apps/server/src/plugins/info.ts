import { isDeepStrictEqual } from "node:util"

import {
  addedPermissions,
  identityFields,
  pluginGrant,
  pluginPermissions,
  type PluginInfo,
} from "@matinee/contracts"
import { ORPCError } from "@orpc/server"

import { SERVER_VERSION } from "../version"
import { builtins } from "./builtin"
import { invalidConfig, missingConfig, resolveConfig } from "./config"
import { eventDelivery } from "./events"
import { files, isManagedPath } from "./files"
import { authOptions, isAwake, runtimes } from "./runtime"
import { approved, pluginState, type PluginComputedState } from "./state"
import { rows } from "./store"

const loadedAt = new Date()
export function pluginInfo(id: string): PluginInfo {
  const builtin = builtins.get(id)?.definition
  const row = rows.get(id)
  if (!builtin && !row)
    throw new ORPCError("NOT_FOUND", {
      message: `Plugin ${id} wasn't found. Rescan the plugin folders.`,
    })
  const file = files.get(id)
  const manifest = file?.manifest ?? row?.manifest
  const fields = builtin?.config ?? manifest?.config ?? []
  const config = resolveConfig(fields, row, builtin?.environment)
  // A built-in is always on. Without a required key it has nothing to do.
  const state: PluginComputedState = builtin
    ? {
        state: missingConfig(fields, config) ? "needs-config" : "running",
        error: null,
      }
    : row
      ? pluginState(row, file, runtimes.get(id))
      : { state: "missing", error: null }
  return {
    id,
    name: builtin?.name ?? manifest?.name ?? id,
    version: builtin ? SERVER_VERSION : (manifest?.version ?? ""),
    description: builtin?.description ?? manifest?.description ?? "",
    author: builtin ? "Matinee" : (manifest?.author ?? null),
    homepage: builtin?.homepage ?? manifest?.homepage ?? null,
    source: builtin
      ? { type: "builtin" }
      : (row?.source ?? { type: "directory", path: file?.path ?? "" }),
    builtin: !!builtin,
    // One whose files are gone can always be forgotten. Otherwise only
    // what lives in the server's own plugins directory is the server's to
    // delete.
    removable:
      !builtin && (!file || (!file.external && isManagedPath(file.path))),
    enabled: !!builtin || !!row?.enabled,
    ...state,
    awake: !!builtin || isAwake(id),
    events: builtin ? null : eventDelivery(id),
    permissions: !builtin && manifest ? pluginPermissions(manifest) : [],
    approval: builtin
      ? null
      : {
          needed: !!row && !!file && !approved(row, file),
          integrity: file?.integrity ?? "",
          added: manifest ? addedPermissions(row?.grant ?? null, manifest) : [],
          changedOnDisk:
            !!row?.integrity &&
            !!file &&
            row.integrity !== file.integrity &&
            !!manifest &&
            isDeepStrictEqual(row.grant, pluginGrant(manifest)),
        },
    config: {
      fields,
      values: Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.type === "secret" ? null : (config[field.key] ?? null),
        ]),
      ),
      secretsSet: fields
        .filter(
          (field) =>
            field.type === "secret" &&
            config[field.key] != null &&
            config[field.key] !== "",
        )
        .map((field) => field.key),
      environment: fields
        .filter(
          (field) =>
            builtin?.environment?.[field.key]?.value !== undefined &&
            (field.type === "secret"
              ? row?.secrets[field.key]
              : row?.config[field.key]) == null,
        )
        .map((field) => field.key),
      invalid: builtin ? [] : invalidConfig(fields, config),
      identity: !builtin && manifest ? identityFields(manifest) : [],
    },
    contributes: {
      metadata: (builtin?.metadata ?? manifest?.contributes.metadata ?? []).map(
        ({ id: providerId, name }) => ({ id: providerId, name }),
      ),
      auth: (manifest?.contributes.auth ?? []).map((provider) => ({
        id: provider.id,
        key: `${id}.${provider.id}`,
        name: provider.name,
        kind: provider.kind,
        allowSignUp: authOptions(id, provider.id).allowSignUp === true,
      })),
      events: manifest?.contributes.events ?? [],
    },
    update: row?.update ? { version: row.update.version } : null,
    installedAt: row?.installedAt ?? loadedAt,
  }
}
export function pluginList(): PluginInfo[] {
  const builtinIds = [...builtins.keys()]
  return [
    ...builtinIds.map(pluginInfo),
    ...[...rows.keys()]
      .filter((id) => !builtins.has(id))
      .map(pluginInfo)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ]
}
