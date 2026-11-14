import type { MetadataProvider } from "@matinee/contracts"

import { declaredMetadata, runningMetadata } from "../plugins"
import { pluginSource } from "./plugin-source"
import { tmdb } from "./tmdb/source"
import { tvdb } from "./tvdb/source"
import type { MetadataSource } from "./types"

const builtins = [tmdb, tvdb]

export function sourceById(id: string): MetadataSource | null {
  const builtin = builtins.find((source) => source.id === id)
  if (builtin) return builtin
  const running = runningMetadata().find(
    (entry) => entry.contribution.id === id,
  )
  return running ? pluginSource(running) : null
}

export function providerState(
  id: string,
): "available" | "unavailable" | "unknown" {
  if (sourceById(id)) return "available"
  return declaredMetadata().some((entry) => entry.contribution.id === id)
    ? "unavailable"
    : "unknown"
}

export function providerList(): MetadataProvider[] {
  const providers = builtins.map((source): MetadataProvider => {
    const configured = source.configured()
    return {
      plugin: { id: source.id, name: source.name },
      builtin: true,
      available: true,
      id: source.id,
      name: source.name,
      description: source.description,
      kinds: source.kinds,
      episodes: source.episodes,
      configured,
      setup: configured ? null : source.setup,
    }
  })
  const running = new Set(
    runningMetadata().map((entry) => entry.contribution.id),
  )
  const seen = new Set(providers.map((provider) => provider.id))
  for (const entry of declaredMetadata()) {
    const { contribution } = entry
    if (seen.has(contribution.id)) continue
    seen.add(contribution.id)
    const available = running.has(contribution.id)
    providers.push({
      plugin: { id: entry.pluginId, name: entry.pluginName },
      builtin: false,
      available,
      ...contribution,
      description: contribution.description ?? "",
      configured: available,
      setup: null,
    })
  }
  return providers
}

export function providerUnavailable(id: string): string {
  const provider = providerList().find((entry) => entry.id === id)
  return provider
    ? `${provider.name} isn't running. Turn its plugin on under Settings → Plugins.`
    : `The metadata provider ${id} isn't installed. Install its plugin under Settings → Plugins, or choose another provider.`
}

export function providerKindUnsupported(name: string): string {
  return `${name} doesn't handle this library's kind. Choose another provider or change the library's kind.`
}
