import type { ImageSlot } from "@matinee/contracts"

import { languageTag } from "../../media/language"
import type { ImageCandidate, ImageScope, Lookup } from "../types"
import { image, request } from "./client"
import type { Image, ImageList } from "./payloads"

/**
 * The size each slot is stored in, as `details.ts` stores them, so picking
 * the image a refresh picks gives the same artwork. Then the size shown
 * among the choices.
 */
const SIZES = {
  poster: { full: "w780", preview: "w342" },
  backdrop: { full: "w1280", preview: "w780" },
  logo: { full: "w500", preview: "w300" },
  still: { full: "original", preview: "w300" },
} satisfies Record<ImageSlot, { full: string; preview: string }>

function candidates(
  slot: ImageSlot,
  list: Image[] | undefined,
): ImageCandidate[] {
  return (list ?? []).flatMap((entry): ImageCandidate[] => {
    // TMDB keeps some logos as SVG, which the server doesn't serve. Like
    // `pickLogo`, keep only the PNG ones, which are transparent.
    const path = entry.file_path
    if (slot === "logo" ? !path.endsWith(".png") : path.endsWith(".svg")) {
      return []
    }
    const url = image(path, SIZES[slot].full)
    if (!url) return []
    return [
      {
        slot,
        url,
        preview: image(path, SIZES[slot].preview),
        width: entry.width ?? null,
        height: entry.height ?? null,
        language: entry.iso_639_1 ? languageTag(entry.iso_639_1) : null,
        score: entry.vote_average ?? 0,
        votes: entry.vote_count ?? 0,
      },
    ]
  })
}

/** Every image TMDB has, in every language, since no language is asked. */
export async function tmdbImages(
  id: string,
  { kind }: Lookup,
  scope: ImageScope,
): Promise<ImageCandidate[]> {
  const base =
    kind === "movie"
      ? `/movie/${encodeURIComponent(id)}`
      : `/tv/${encodeURIComponent(id)}`
  if (scope.kind === "title") {
    const list = await request<ImageList>(`${base}/images`, {})
    return [
      ...candidates("poster", list.posters),
      ...candidates("backdrop", list.backdrops),
      ...candidates("logo", list.logos),
    ]
  }
  if (kind === "movie") return []
  if (scope.kind === "season") {
    const list = await request<ImageList>(
      `${base}/season/${scope.season}/images`,
      {},
    )
    return candidates("poster", list.posters)
  }
  const list = await request<ImageList>(
    `${base}/season/${scope.season}/episode/${scope.episode}/images`,
    {},
  )
  return candidates("still", list.stills)
}
