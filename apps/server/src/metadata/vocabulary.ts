import { type Genre, GENRES, type TitleStatus } from "@matinee/contracts"

import { uniqueNames } from "./types"

/*
 * The words the server keeps for what providers name in their own
 * vocabulary: a title's status and its genres. Clients word the keys in
 * their own language. Migration 0009 maps the rows stored before this with
 * the same tables, in SQL; keep the two alike.
 */

/**
 * Every status TMDB and TheTVDB give, lowercase, by what it maps to. TMDB's
 * shows: Returning Series, Planned, In Production, Ended, Canceled, Pilot.
 * Its movies: Rumored, Planned, In Production, Post Production, Released,
 * Canceled. TheTVDB's series: Continuing, Ended, Upcoming. Its movies:
 * Announced, Pre-Production, Filming / Post-Production, Completed,
 * Released. The keys themselves map to themselves, so a value already
 * mapped reads the same.
 */
const STATUSES = new Map<string, TitleStatus>([
  ["returning series", "continuing"],
  ["continuing", "continuing"],
  ["ended", "ended"],
  ["canceled", "canceled"],
  ["cancelled", "canceled"],
  ["planned", "upcoming"],
  ["rumored", "upcoming"],
  ["upcoming", "upcoming"],
  ["announced", "upcoming"],
  ["pre-production", "upcoming"],
  // Made and waiting for its release.
  ["completed", "upcoming"],
  ["in production", "in-production"],
  ["in-production", "in-production"],
  ["post production", "in-production"],
  ["filming / post-production", "in-production"],
  ["pilot", "pilot"],
  ["released", "released"],
])

/** A provider's status as the server's, or null for one it doesn't know. */
export function titleStatus(
  value: string | null | undefined,
): TitleStatus | null {
  return STATUSES.get(value?.trim().toLowerCase() ?? "") ?? null
}

/**
 * TMDB's genres by id, which hold in every language. Its show genres that
 * pair two, like Action & Adventure, become both, as its movies have them.
 */
const TMDB_GENRES = new Map<number, Genre[]>([
  [28, ["action"]],
  [12, ["adventure"]],
  [16, ["animation"]],
  [35, ["comedy"]],
  [80, ["crime"]],
  [99, ["documentary"]],
  [18, ["drama"]],
  [10751, ["family"]],
  [14, ["fantasy"]],
  [36, ["history"]],
  [27, ["horror"]],
  [10402, ["music"]],
  [9648, ["mystery"]],
  [10749, ["romance"]],
  [878, ["science-fiction"]],
  [10770, ["tv-movie"]],
  [53, ["thriller"]],
  [10752, ["war"]],
  [37, ["western"]],
  [10759, ["action", "adventure"]],
  [10762, ["children"]],
  [10763, ["news"]],
  [10764, ["reality"]],
  [10765, ["science-fiction", "fantasy"]],
  [10766, ["soap"]],
  [10767, ["talk-show"]],
  [10768, ["war", "politics"]],
])

/**
 * English genre names that aren't their key with dashes for spaces: TMDB's
 * English names and TheTVDB's, which only come in English.
 */
const ENGLISH_GENRES = new Map<string, Genre[]>([
  ["kids", ["children"]],
  ["talk", ["talk-show"]],
  ["action & adventure", ["action", "adventure"]],
  ["sci-fi & fantasy", ["science-fiction", "fantasy"]],
  ["war & politics", ["war", "politics"]],
])

const KEYS = new Set<string>(GENRES)

function isGenre(value: string): value is Genre {
  return KEYS.has(value)
}

/** The keys an English name or a key stands for, or none. */
function fromName(name: string): Genre[] {
  const lower = name.trim().toLowerCase()
  const named = ENGLISH_GENRES.get(lower)
  if (named) return named
  const slug = lower.replaceAll(/\s+/g, "-")
  return isGenre(slug) ? [slug] : []
}

/**
 * Genres as titles keep them: each name a key stands for as that key, and
 * a name without one as it is. Takes keys too, so it reads them the same.
 */
export function genreKeys(names: string[]): string[] {
  return uniqueNames(
    names.flatMap((name) => {
      const keys = fromName(name)
      return keys.length ? keys : [name]
    }),
  )
}

/** TMDB's genres, by id where it has one, in the order TMDB gives them. */
export function tmdbGenres(list: { id?: number; name: string }[] | undefined) {
  return uniqueNames(
    (list ?? []).flatMap((genre) => {
      const keys =
        genre.id === undefined ? undefined : TMDB_GENRES.get(genre.id)
      return keys ?? genreKeys([genre.name])
    }),
  )
}

/** TheTVDB's genres, by slug, which is the key for those the server knows. */
export function tvdbGenres(
  list: { name: string; slug?: string }[] | undefined,
) {
  return uniqueNames(
    (list ?? []).flatMap((genre) =>
      genre.slug && isGenre(genre.slug)
        ? [genre.slug]
        : genreKeys([genre.name]),
    ),
  )
}
