import type { MetadataProvider, MetadataProviderId } from "@matinee/contracts"

import { anilist } from "./anilist"
import { tmdb } from "./tmdb"
import { tvdb } from "./tvdb"
import type { MetadataSource } from "./types"

export const sources = {
  tmdb,
  tvdb,
  anilist,
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
