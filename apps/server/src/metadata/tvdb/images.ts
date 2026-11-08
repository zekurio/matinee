import type { ImageSlot } from "@matinee/contracts"

import { languageTag } from "../../media/language"
import type { ImageCandidate, ImageScope, Lookup } from "../types"
import { request } from "./client"
import { absolute } from "./mapping"
import type { Artwork, Episode, Series } from "./payloads"
import { artworkType } from "./reference"

type RecordKind = "series" | "season" | "movie"

/** TVDB's names for the artwork types Matinee keeps. */
const TYPE_NAMES = [
  ["poster", "poster"],
  ["background", "backdrop"],
  ["clearlogo", "logo"],
] as const

/** The slot each of the record's artwork types fills, by type id. */
async function slotsOf(record: RecordKind): Promise<Map<number, ImageSlot>> {
  // A season has only posters to show.
  const names = record === "season" ? TYPE_NAMES.slice(0, 1) : TYPE_NAMES
  const ids = await Promise.all(
    names.map(([name]) => artworkType(record, name)),
  )
  const slots = new Map<number, ImageSlot>()
  names.forEach(([, slot], i) => {
    const id = ids[i]
    if (id !== null && id !== undefined) slots.set(id, slot)
  })
  return slots
}

async function candidates(
  record: RecordKind,
  artworks: Artwork[] | null | undefined,
): Promise<ImageCandidate[]> {
  const slots = await slotsOf(record)
  return (artworks ?? []).flatMap((art): ImageCandidate[] => {
    const slot = slots.get(art.type)
    const url = absolute(art.image)
    if (!slot || !url) return []
    return [
      {
        slot,
        url,
        preview: absolute(art.thumbnail),
        width: art.width || null,
        height: art.height || null,
        language: art.language ? languageTag(art.language) : null,
        score: art.score ?? 0,
        votes: 0,
      },
    ]
  })
}

/**
 * A season's posters. The series record names its seasons with their ids,
 * picked as `details.ts` picks them: the default order's, or the official
 * one's. When the default order's season has none, the official one's
 * posters stand in, as in Jellyfin's TVDB plugin.
 */
async function seasonImages(id: string, number: number) {
  const { data: series } = await request<Series>(
    `/series/${encodeURIComponent(id)}/extended`,
    { short: "true" },
  )
  const numbered = (series.seasons ?? []).filter((s) => s.number === number)
  const picked = numbered.find(
    (s) =>
      s.type?.id === series.defaultSeasonType || s.type?.type === "official",
  )
  const official = numbered.find((s) => s.type?.type === "official")
  for (const season of new Set([picked, official])) {
    if (!season) continue
    const { data } = await request<{ artwork?: Artwork[] | null }>(
      `/seasons/${season.id}/extended`,
    )
    const found = await candidates("season", data.artwork)
    if (found.length > 0) return found
  }
  return []
}

/** TVDB keeps one image per episode, the one a refresh stores. */
async function episodeImages(id: string, season: number, episode: number) {
  const { data } = await request<{ episodes?: Episode[] | null }>(
    `/series/${encodeURIComponent(id)}/episodes/default`,
    { page: 0, season, episodeNumber: episode },
  )
  const url = absolute(data.episodes?.[0]?.image)
  if (!url) return []
  return [
    {
      slot: "still",
      url,
      preview: null,
      width: null,
      height: null,
      language: null,
      score: 0,
      votes: 0,
    } satisfies ImageCandidate,
  ]
}

export async function tvdbImages(
  id: string,
  { kind }: Lookup,
  scope: ImageScope,
): Promise<ImageCandidate[]> {
  if (kind === "movie") {
    if (scope.kind !== "title") return []
    const { data } = await request<{ artworks?: Artwork[] | null }>(
      `/movies/${encodeURIComponent(id)}/extended`,
    )
    return candidates("movie", data.artworks)
  }
  if (scope.kind === "season") return seasonImages(id, scope.season)
  if (scope.kind === "episode") {
    return episodeImages(id, scope.season, scope.episode)
  }
  const { data } = await request<{ artworks?: Artwork[] | null }>(
    `/series/${encodeURIComponent(id)}/artworks`,
  )
  return candidates("series", data.artworks)
}
