import type {
  CreditKind,
  ImageSlot,
  MetadataProviderId,
} from "@matinee/contracts"
import type { ExternalIds, YouTubeTrailer } from "@matinee/db"

type MatchKind = "movie" | "show"

// Enough to fill a row on a wide screen; Jellyfin keeps 15.
export const MAX_CAST = 20

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
type ImageUrls = {
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
  overview: string | null
  poster: string | null
}

export type CreditDetails = {
  kind: CreditKind
  name: string
  /** The character, or the crew member's jobs. */
  role: string | null
  /** The person's id at the provider. */
  personId: string | null
  /** Remote URL of a portrait. */
  photo: string | null
}

export type TitleDetails = {
  id: string
  name: string
  originalName: string | null
  /** BCP 47 tag of the language it was made in, when the provider says. */
  originalLanguage: string | null
  year: number | null
  overview: string | null
  tagline: string | null
  genres: string[]
  /**
   * The provider calls it anime: TheTVDB's Anime genre, TMDB's "anime"
   * keyword. Requests route anime by it; nothing else decides it.
   */
  anime: boolean
  rating: number | null
  contentRating: string | null
  releaseDate: string | null
  status: string | null
  runtimeMinutes: number | null
  externalIds: ExternalIds
  images: ImageUrls
  studios: string[]
  /** Cast in billing order, then crew. */
  credits: CreditDetails[]
  /** Best first, as `rankTrailers` orders them. */
  trailers: YouTubeTrailer[]
  /** Shows only. Empty when the provider has no season data. */
  seasons: SeasonDetails[]
  /** Shows only. Empty when the provider has no episode data. */
  episodes: EpisodeDetails[]
}

/** Whose images to list: the title's, a season's, or an episode's. */
export type ImageScope =
  | { kind: "title" }
  | { kind: "season"; season: number }
  | { kind: "episode"; season: number; episode: number }

/** An image a provider has, as `RemoteImage` gives it before it's saved. */
export type ImageCandidate = {
  slot: ImageSlot
  /** Remote URL, in the size a refresh would store. */
  url: string
  /** Remote URL of a smaller copy, if the provider has one. */
  preview: string | null
  width: number | null
  height: number | null
  /** BCP 47. Null when it has no text. */
  language: string | null
  /** The provider's rating of it, for ordering. Higher is better. */
  score: number
  /** How many rated it, to break ties in `score`. */
  votes: number
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
  /**
   * Every image the provider has for the title `id`, one of its seasons,
   * or one of its episodes, in any language and order.
   */
  images(
    id: string,
    lookup: Lookup,
    scope: ImageScope,
  ): Promise<ImageCandidate[]>
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

/** Names without blanks or repeats, in order. */
export function uniqueNames(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    const name = text(value)
    if (name) seen.add(name)
  }
  return [...seen]
}

/**
 * One credit per person and kind, so a writer credited for both the
 * screenplay and the story shows once, as `Screenplay, Story`.
 */
export function mergeCrew(crew: CreditDetails[]): CreditDetails[] {
  const merged = new Map<string, CreditDetails>()
  for (const member of crew) {
    const key = `${member.kind}:${member.personId ?? member.name}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...member })
      continue
    }
    const roles = uniqueNames([
      ...(existing.role?.split(", ") ?? []),
      ...(member.role?.split(", ") ?? []),
    ])
    existing.role = roles.length > 0 ? roles.join(", ") : null
    existing.photo ??= member.photo
  }
  return [...merged.values()]
}
