import type { MetadataProvider, MetadataProviderId } from "@matinee/contracts"

import { tmdb } from "./tmdb/source"
import { tvdb } from "./tvdb/source"
import type { MetadataSource } from "./types"

export const sources = {
  tmdb,
  tvdb,
} satisfies Record<MetadataProviderId, MetadataSource>

export function providerList(): MetadataProvider[] {
  return Object.values(sources).map((source) => {
    const configured = source.configured()
    return {
      id: source.id,
      name: source.name,
      description: source.description,
      episodes: source.episodes,
      configured,
      setup: configured ? null : source.setup,
    }
  })
}
