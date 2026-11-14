import { log } from "../log"
import { resolveConfig } from "./config"
import type { BuiltinPlugin, BuiltinPluginDefinition } from "./index"
import { rows } from "./store"

export const builtins = new Map<
  string,
  { definition: BuiltinPluginDefinition; listeners: Set<() => void> }
>()
export function registerBuiltin(
  definition: BuiltinPluginDefinition,
): BuiltinPlugin {
  if (builtins.has(definition.id))
    throw new Error(`Built-in plugin ${definition.id} is already registered`)
  const listeners = new Set<() => void>()
  builtins.set(definition.id, { definition, listeners })
  return {
    config: () =>
      resolveConfig(
        definition.config,
        rows.get(definition.id),
        definition.environment,
      ),
    onChange: (listener) => {
      listeners.add(listener)
    },
  }
}
export function logBuiltinOverrides(): void {
  for (const [id, { definition }] of builtins) {
    const row = rows.get(id)
    if (!row) continue
    for (const field of definition.config) {
      const source = definition.environment?.[field.key]
      if (source?.value === undefined) continue
      const saved =
        field.type === "secret" ? row.secrets[field.key] : row.config[field.key]
      if (saved != null && saved !== source.value)
        log.info(
          `${source.variable} is set, but a value saved for plugin ${id} overrides it.`,
        )
    }
  }
}
export function notifyBuiltin(id: string): void {
  for (const listener of builtins.get(id)?.listeners ?? []) {
    try {
      listener()
    } catch (cause) {
      log.warn(`Plugin ${id} config listener failed`, cause)
    }
  }
}
