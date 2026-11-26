import { adapter as movieSource } from "./radarr/source"
import { adapter as seriesSource } from "./sonarr/source"
import type { FulfilmentSource } from "./types"

/** Adapters register here. Core code only looks up the opaque source id. */
export const sources = new Map<string, FulfilmentSource>([
  [movieSource.id, movieSource],
  [seriesSource.id, seriesSource],
])

export function sourceList(): FulfilmentSource[] {
  return [...sources.values()]
}
