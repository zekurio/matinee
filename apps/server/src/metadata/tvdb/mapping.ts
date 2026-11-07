import type { ExternalIds } from "@matinee/db"

import { type CreditDetails, MAX_CAST, mergeCrew, text } from "../types"
import type { Artwork, Character, RemoteId } from "./payloads"

const ARTWORK_HOST = "https://artworks.thetvdb.com"

const PEOPLE_TYPES = new Map<string, CreditDetails["kind"]>([
  ["Actor", "actor"],
  ["Creator", "creator"],
  ["Director", "director"],
  ["Writer", "writer"],
])

export function absolute(url: string | null | undefined): string | null {
  if (!url) return null
  return url.startsWith("/") ? `${ARTWORK_HOST}${url}` : url
}

/**
 * Actors in TVDB's order, then creators, directors, and writers. Guest
 * stars, producers, and the rest are left out.
 */
export function credits(
  characters: Character[] | null | undefined,
): CreditDetails[] {
  const all = (characters ?? [])
    // TVDB leaves the order at 0 when nobody set it.
    .toSorted((a, b) => (a.sort || Infinity) - (b.sort || Infinity))
    .flatMap((character): CreditDetails[] => {
      const kind = PEOPLE_TYPES.get(character.peopleType ?? "")
      const name = text(character.personName)
      if (!kind || !name) return []
      return [
        {
          kind,
          name,
          role: kind === "actor" ? text(character.name) : null,
          personId: character.peopleId ? String(character.peopleId) : null,
          photo: absolute(character.personImgURL),
        },
      ]
    })
  const order = ["creator", "director", "writer"]
  const crew = all
    .filter((c) => c.kind !== "actor")
    .toSorted((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
  return [
    ...all.filter((c) => c.kind === "actor").slice(0, MAX_CAST),
    ...mergeCrew(crew),
  ]
}

/**
 * The best artwork of a type: highest score in the user's language, then
 * without text, then in English, then any.
 */
export function pickArtwork(
  artworks: Artwork[] | undefined,
  type: number | null,
  lang: string,
  preferTextless = false,
): string | null {
  if (type === null) return null
  const ofType = (artworks ?? [])
    .filter((art) => art.type === type)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const order = preferTextless ? [null, lang, "eng"] : [lang, null, "eng"]
  for (const language of order) {
    const match = ofType.find((art) => art.language === language)
    if (match) return absolute(match.image)
  }
  return absolute(ofType[0]?.image)
}

export function remoteIds(
  id: number,
  remote: RemoteId[] | undefined,
): ExternalIds {
  const ids: ExternalIds = { tvdb: String(id) }
  for (const entry of remote ?? []) {
    const source = entry.sourceName?.toLowerCase() ?? ""
    if (source.includes("imdb")) ids.imdb = entry.id
    else if (source.includes("themoviedb")) ids.tmdb = entry.id
  }
  return ids
}
