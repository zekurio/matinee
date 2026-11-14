import {
  CATALOG_RUNTIME_STEP,
  CATALOG_SCORE_STEP,
  CATALOG_SORTS,
  type CatalogFilters,
  type CatalogBrowseOptions,
  type CatalogBrowsePage,
  type CatalogSort,
  type CatalogRef,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { ORPCError } from "@orpc/server"

import type { Viewer } from "../access/viewer"
import { env } from "../env"
import type { DiscoverQuery } from "../metadata/tmdb/browse"
import { destinations, lookupLanguage } from "../requests/destinations"
import {
  browseProvider,
  certificationProvider,
  genreProvider,
  languageProvider,
} from "./cache"
import { catalogCards } from "./cards"

/*
 * Browsing TMDB's catalog of one kind with filters and a sort. Titles
 * read in the language of the library a request would go to, and its
 * country picks the age ratings, as the feeds do.
 */

type Kind = CatalogRef["kind"]

/** The vote minimums on offer. */
const VOTE_STEPS = [10, 100, 250, 500, 1000, 5000]
/**
 * Votes a title needs to be in a list ordered by score, unless the
 * viewer chose a minimum: below it, three people's 10 outrank the films
 * everyone knows.
 */
const SCORE_FLOOR = 250
/**
 * Votes a title needs to be in a list ordered by date or name: below it,
 * the ends of the list are announcements and uploads nobody has seen.
 */
const LISTING_FLOOR = 10
const FIRST_YEAR = 1900
/** A film's runtime, or a show's episodes', has an open end past this. */
const LONGEST = { movie: 240, show: 120 } satisfies Record<Kind, number>
/** Codes TMDB lists among a country's ratings for "not rated". */
const UNRATED = new Set(["NR", "UR"])

const TMDB_SORT = {
  popular: { by: "popularity", direction: "desc" },
  scoreHigh: { by: "vote_average", direction: "desc" },
  scoreLow: { by: "vote_average", direction: "asc" },
  votes: { by: "vote_count", direction: "desc" },
  newest: { by: "date", direction: "desc" },
  oldest: { by: "date", direction: "asc" },
  nameAsc: { by: "name", direction: "asc" },
  nameDesc: { by: "name", direction: "desc" },
} satisfies Record<CatalogSort, DiscoverQuery["sort"]>

function bounds(kind: Kind) {
  return {
    years: { min: FIRST_YEAR, max: new Date().getFullYear() + 2, step: 1 },
    scores: { min: 0, max: 10, step: CATALOG_SCORE_STEP },
    runtime: { min: 0, max: LONGEST[kind], step: CATALOG_RUNTIME_STEP },
  }
}

/**
 * The language titles read in, and the country it belongs to: en-US is
 * the US, and a bare de is Germany. Null without a TMDB key or a
 * library of the kind the viewer can ask into.
 */
async function setting(viewer: Viewer, kind: Kind) {
  if (!env.MATINEE_TMDB_API_KEY) return null
  const candidates = await destinations(viewer, kind)
  if (!candidates.length) return null
  const language = lookupLanguage(candidates, "tmdb")
  let country: string | null = null
  try {
    country = new Intl.Locale(language).maximize().region ?? null
  } catch {
    // A language ICU doesn't know has no country to rate in.
  }
  return { language, country }
}

/** A country's ratings for a kind, mildest first, without "not rated". */
async function ratingsFor(kind: Kind, country: string | null) {
  const all = await certificationProvider(kind)
  const list = country ? all.value[country] : undefined
  const ratings = (list ?? [])
    .filter((entry) => !UNRATED.has(entry.certification))
    .toSorted((a, b) => a.order - b.order)
  return { ratings, stale: all.stale }
}

/** The languages by their names in `language`, alphabetically. */
async function languagesIn(language: string) {
  const list = await languageProvider()
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([language], { type: "language" })
  } catch {
    // Unknown to ICU: the English names stand.
  }
  const collator = new Intl.Collator(language)
  const entries = list.value
    // TMDB's "No Language", for silent films and the like, isn't one to pick.
    .filter((entry) => entry.id !== "xx")
    .map((entry) => {
      let name = entry.name
      try {
        const local = names?.of(entry.id)
        if (local && local !== entry.id) name = local
      } catch {
        // Not a code ICU takes: the English name stands.
      }
      return { id: entry.id, name }
    })
    .toSorted((a, b) => collator.compare(a.name, b.name))
  return { languages: entries, stale: list.stale }
}

export async function options(
  viewer: Viewer,
  kind: Kind,
): Promise<t.infer<typeof CatalogBrowseOptions>> {
  const from = await setting(viewer, kind)
  if (!from)
    return {
      enabled: false,
      stale: false,
      genres: [],
      ratings: null,
      languages: [],
      sorts: [],
      votes: [],
      ...bounds(kind),
    }
  const [genres, ratings, languages] = await Promise.all([
    genreProvider(kind, from.language),
    ratingsFor(kind, from.country),
    languagesIn(from.language),
  ])
  return {
    enabled: true,
    stale: genres.stale || ratings.stale || languages.stale,
    genres: genres.value.map((genre) => ({ id: genre.id, name: genre.name })),
    ratings:
      from.country && ratings.ratings.length
        ? {
            country: from.country,
            ratings: ratings.ratings.map((entry) => entry.certification),
          }
        : null,
    languages: languages.languages,
    sorts: [...CATALOG_SORTS],
    votes: VOTE_STEPS,
    ...bounds(kind),
  }
}

/** A filter that isn't on offer, as from an old link. */
function refused(): never {
  throw new ORPCError("BAD_REQUEST", {
    message:
      "One of these filters isn't on offer anymore. Clear it and try again.",
  })
}

/**
 * The filters as TMDB takes them, checked against what's on offer. A
 * bound at an end of its span is no bound, so a range dragged to its
 * end and one never touched share a cache entry.
 */
async function query(
  kind: Kind,
  from: { language: string; country: string | null },
  filters: CatalogFilters,
  sort: CatalogSort,
): Promise<{ query: DiscoverQuery; floor: number | null }> {
  const span = bounds(kind)
  const open = (value: number | null, end: number, below: boolean) =>
    value === null || (below ? value <= end : value >= end) ? null : value
  const genres = [...new Set(filters.genres)].toSorted((a, b) => a - b)
  if (genres.length) {
    const offered = await genreProvider(kind, from.language)
    if (genres.some((id) => !offered.value.some((genre) => genre.id === id)))
      refused()
  }
  if (filters.votesMin !== null && !VOTE_STEPS.includes(filters.votesMin))
    refused()
  let ratings: DiscoverQuery["ratings"] = null
  if (filters.rating !== null) {
    const { ratings: list } = await ratingsFor(kind, from.country)
    const chosen = list.find((entry) => entry.certification === filters.rating)
    if (!chosen || !from.country) refused()
    ratings = {
      country: from.country,
      ratings: list
        .filter((entry) => entry.order <= chosen.order)
        .map((entry) => entry.certification),
    }
  }
  if (filters.language !== null) {
    const offered = await languageProvider()
    if (!offered.value.some((entry) => entry.id === filters.language)) refused()
  }
  const floor =
    filters.votesMin !== null
      ? null
      : sort === "scoreHigh" || sort === "scoreLow"
        ? SCORE_FLOOR
        : sort === "popular" || sort === "votes"
          ? null
          : LISTING_FLOOR
  return {
    query: {
      genres,
      yearFrom: open(filters.yearFrom, span.years.min, true),
      yearTo: open(filters.yearTo, span.years.max, false),
      scoreMin: open(filters.scoreMin, span.scores.min, true),
      scoreMax: open(filters.scoreMax, span.scores.max, false),
      votesMin: filters.votesMin ?? floor,
      ratings,
      language: filters.language,
      runtimeMin: open(filters.runtimeMin, span.runtime.min, true),
      runtimeMax: open(filters.runtimeMax, span.runtime.max, false),
      sort: TMDB_SORT[sort],
    },
    floor,
  }
}

export async function page(
  viewer: Viewer,
  input: {
    kind: Kind
    filters: CatalogFilters
    sort: CatalogSort
    page: number
  },
): Promise<t.infer<typeof CatalogBrowsePage>> {
  const from = await setting(viewer, input.kind)
  if (!from)
    return {
      items: [],
      nextPage: null,
      stale: false,
      voteFloor: null,
      detail: null,
    }
  const { query: built, floor } = await query(
    input.kind,
    from,
    input.filters,
    input.sort,
  )
  const result = await browseProvider(
    input.kind,
    from.language,
    built,
    input.page,
  )
  const cards = await catalogCards(viewer, input.kind, result.value.items)
  const scored =
    built.scoreMin !== null ||
    built.scoreMax !== null ||
    input.sort === "scoreHigh" ||
    input.sort === "scoreLow"
  return {
    items: cards.map(({ row, card }) => ({
      ...card,
      score: row.score,
      votes: row.votes,
      releaseDate: row.releaseDate,
    })),
    nextPage: result.value.nextPage,
    stale: result.stale,
    voteFloor: floor,
    detail:
      input.sort === "newest" || input.sort === "oldest"
        ? "releaseDate"
        : scored
          ? "score"
          : null,
  }
}
