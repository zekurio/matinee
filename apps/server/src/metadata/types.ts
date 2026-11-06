import type { MetadataProviderId } from "@matinee/contracts"
import type { ExternalIds } from "@matinee/db"

export type MatchKind = "movie" | "show"

export type Lookup = {
  kind: MatchKind
  /** `en`, `de-DE`, and so on. Providers map it to their own codes. */
  language: string
}

export type SearchQuery = Lookup & { name: string; year: number | null }

export type Candidate = {
  id: string
  name: string
  /** Original, romanized, and alternative names, for matching. */
  aliases: string[]
  year: number | null
  overview: string | null
  /** Remote URL. */
  poster: string | null
}

/** Remote image URLs. */
export type ImageUrls = {
  poster: string | null
  backdrop: string | null
  logo: string | null
}

export type EpisodeDetails = {
  season: number
  episode: number
  name: string | null
  overview: string | null
  airDate: string | null
  runtimeMinutes: number | null
  still: string | null
}

export type SeasonDetails = {
  number: number
  name: string | null
  overview: string | null
  poster: string | null
}

export type TitleDetails = {
  id: string
  name: string
  originalName: string | null
  year: number | null
  overview: string | null
  tagline: string | null
  genres: string[]
  rating: number | null
  contentRating: string | null
  releaseDate: string | null
  status: string | null
  runtimeMinutes: number | null
  externalIds: ExternalIds
  images: ImageUrls
  /** Shows only. Empty when the provider has no season data. */
  seasons: SeasonDetails[]
  /** Shows only. Empty when the provider has no episode data. */
  episodes: EpisodeDetails[]
}

/**
 * One metadata source. Each library picks one; adding a provider means
 * implementing this and listing it in `sources.ts`.
 */
export interface MetadataSource {
  id: MetadataProviderId
  name: string
  description: string
  /** Gives episode names, descriptions, and stills. */
  episodes: boolean
  /** The environment variables it needs, for the admin UI. */
  setup: string | null
  configured(): boolean
  search(query: SearchQuery): Promise<Candidate[]>
  /**
   * The provider's id for a title known by ids at other sites, such as a
   * `{tvdb-123}` folder tag or the ids an earlier provider returned.
   */
  lookup(ids: ExternalIds, lookup: Lookup): Promise<string | null>
  details(id: string, lookup: Lookup): Promise<TitleDetails>
}

/** A failed provider request, with the HTTP status if there was one. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

/** `2008-01-20` → 2008. */
export function yearOf(date: string | null | undefined): number | null {
  const year = Number(date?.slice(0, 4))
  return Number.isInteger(year) && year > 1800 ? year : null
}

/** Empty strings and whitespace become null. */
export function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** A YYYY-MM-DD date, or null for anything else. */
export function isoDate(value: string | null | undefined): string | null {
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value ?? "")
  return match ? match[0] : null
}
