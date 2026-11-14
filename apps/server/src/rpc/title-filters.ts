import {
  TITLE_RUNTIME_STEP,
  TITLE_SCORE_STEP,
  TITLE_SORTS,
  type AgeLimit,
  type FilterRange,
  type TitleFilterOptions,
  type TitleFilters,
  type TitleKind,
  type TitleScope,
} from "@matinee/contracts"
import { library, title } from "@matinee/db"
import {
  and,
  arrayContains,
  count,
  desc,
  eq,
  isNotNull,
  max,
  min,
  type SQL,
  sql,
} from "drizzle-orm"

import { visibleTitles } from "../access/visible"
import { certificationProvider } from "../catalog/cache"
import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { badRequest } from "./base"
import {
  type RatingLimits,
  tagCounts,
  type Watcher,
  watchFlags,
} from "./browse"

/*
 * What a list of titles can be filtered by, drawn from the titles a viewer
 * sees in a scope, and the age limits those filters ask for.
 *
 * Titles carry an age rating as text, from the country of their library's
 * metadata language, or the US where the provider has none for it. Its
 * place among the milder and stricter ones comes from TMDB's lists of
 * every country's ratings, which Discover keeps too. Without TMDB there's
 * no order, so no age filter.
 */

/** Codes TMDB lists among a country's ratings for "not rated". */
const UNRATED = new Set(["NR", "UR"])

/** A country's ratings for one kind, each with its place, mildest lowest. */
type System = ReadonlyMap<string, number>

/** Every country's rating system for `kind`, or null when there's no TMDB to ask. */
async function systems(
  kind: TitleKind,
): Promise<ReadonlyMap<string, System> | null> {
  if (!env.MATINEE_TMDB_API_KEY) return null
  try {
    const { value } = await certificationProvider(kind)
    return new Map(
      Object.entries(value).map(([country, ratings]) => [
        country,
        new Map(
          ratings
            .filter((entry) => !UNRATED.has(entry.certification))
            .map((entry) => [entry.certification, entry.order]),
        ),
      ]),
    )
  } catch (cause) {
    log.warn("Couldn't load the age rating lists", cause)
    return null
  }
}

/** The country a metadata language's ratings come from: en-US is the US, de is Germany. */
function countryOf(language: string): string | null {
  try {
    return new Intl.Locale(language).maximize().region ?? null
  } catch {
    return null
  }
}

/**
 * The ratings each kind may have under the filters' age limits. A limit
 * names a rating in a country's system; it lets in that one and every
 * milder one there.
 */
export async function ratingLimits(
  filters: TitleFilters | undefined,
): Promise<RatingLimits> {
  const limits = new Map<TitleKind, string[]>()
  const asked: [TitleKind, AgeLimit | null][] = [
    ["movie", filters?.movieRating ?? null],
    ["show", filters?.showRating ?? null],
  ]
  for (const [kind, limit] of asked) {
    if (!limit) continue
    const system = (await systems(kind))?.get(limit.country)
    const place = system?.get(limit.rating)
    if (!system || place === undefined) {
      // Only a hand-made or old link names one the lists don't have.
      throw badRequest(
        "One of these filters isn't on offer anymore. Clear it and try again.",
      )
    }
    limits.set(
      kind,
      [...system].flatMap(([rating, order]) =>
        order <= place ? [rating] : [],
      ),
    )
  }
  return limits
}

/** The titles in a scope the viewer sees. */
function scopeWhere(viewer: Watcher, scope: TitleScope): SQL | undefined {
  return and(
    visibleTitles(viewer),
    scope.libraryId ? eq(title.libraryId, scope.libraryId) : undefined,
    scope.kind ? eq(title.kind, scope.kind) : undefined,
    scope.genre ? arrayContains(title.genres, [scope.genre]) : undefined,
    scope.studio ? arrayContains(title.studios, [scope.studio]) : undefined,
  )
}

/** Lowest to highest on `step`'s marks, or null with nothing to pick between. */
function range(
  low: number | null,
  high: number | null,
  step: number,
): FilterRange | null {
  if (low === null || high === null) return null
  const from = Math.floor(low / step) * step
  const to = Math.ceil(high / step) * step
  return to > from ? { min: from, max: to, step } : null
}

type RatedRow = {
  kind: TitleKind
  rating: string
  language: string
  titleCount: number
}

/**
 * For each kind, the system most of its rated titles' ratings belong to,
 * of the countries their libraries rate in and the US the providers fall
 * back to, and the ratings of it they carry.
 */
async function ratingOptions(
  rows: RatedRow[],
): Promise<TitleFilterOptions["ratings"]> {
  const result: TitleFilterOptions["ratings"] = []
  for (const kind of ["movie", "show"] as const) {
    const rated = rows.filter((row) => row.kind === kind)
    if (rated.length === 0) continue
    const all = await systems(kind)
    if (!all) continue
    // The libraries' countries, the most titles' first, then the US.
    const weight = new Map<string, number>()
    for (const row of rated) {
      const country = countryOf(row.language)
      if (country)
        weight.set(country, (weight.get(country) ?? 0) + row.titleCount)
    }
    const candidates = [
      ...[...weight]
        .toSorted((a, b) => b[1] - a[1])
        .map(([country]) => country),
      "US",
    ]
    let best: { country: string; system: System; covered: number } | null = null
    for (const country of new Set(candidates)) {
      const system = all.get(country)
      if (!system) continue
      const covered = rated.reduce(
        (sum, row) => sum + (system.has(row.rating) ? row.titleCount : 0),
        0,
      )
      if (covered > (best?.covered ?? 0)) best = { country, system, covered }
    }
    if (!best) continue
    const { system } = best
    const counts = new Map<string, number>()
    for (const row of rated) {
      if (system.has(row.rating))
        counts.set(row.rating, (counts.get(row.rating) ?? 0) + row.titleCount)
    }
    result.push({
      kind,
      country: best.country,
      ratings: [...counts]
        .map(([rating, titleCount]) => ({ rating, titleCount }))
        .toSorted(
          (a, b) =>
            (system.get(a.rating) ?? 0) - (system.get(b.rating) ?? 0) ||
            a.rating.localeCompare(b.rating),
        ),
    })
  }
  return result
}

/**
 * What each filter offers for the titles in `scope` the viewer sees: five
 * queries, and the rating lists from the provider cache.
 */
export async function filterOptions(
  viewer: Watcher,
  scope: TitleScope,
): Promise<TitleFilterOptions> {
  const where = scopeWhere(viewer, scope)
  const { started, finished } = watchFlags(viewer.id)
  const titleCount = count()
  // ACCESS: Every query here is narrowed by scopeWhere, which applies visibleTitles.
  const [genres, studios, rated, languages, [totals]] = await Promise.all([
    tagCounts(viewer, title.genres, { where }),
    tagCounts(viewer, title.studios, { where }),
    db
      .select({
        kind: title.kind,
        rating: sql<string>`${title.contentRating}`,
        language: library.metadataLanguage,
        titleCount,
      })
      .from(title)
      .innerJoin(library, eq(library.id, title.libraryId))
      .where(and(where, isNotNull(title.contentRating)))
      .groupBy(title.kind, title.contentRating, library.metadataLanguage),
    db
      .select({
        language: sql<string>`${title.originalLanguage}`,
        titleCount,
      })
      .from(title)
      .where(and(where, isNotNull(title.originalLanguage)))
      .groupBy(title.originalLanguage)
      .orderBy(desc(titleCount), title.originalLanguage),
    db
      .select({
        total: count(),
        yearMin: min(title.year),
        yearMax: max(title.year),
        scoreMin: min(title.rating),
        scoreMax: max(title.rating),
        runtimeMin: min(title.runtimeMinutes),
        runtimeMax: max(title.runtimeMinutes),
        dated: count(title.year),
        scored: count(title.rating),
        timed: count(title.runtimeMinutes),
        started: sql<number>`count(*) filter (where ${started})`.mapWith(
          Number,
        ),
        finished: sql<number>`count(*) filter (where ${finished})`.mapWith(
          Number,
        ),
      })
      .from(title)
      .where(where),
  ])
  const total = totals?.total ?? 0
  const startedCount = totals?.started ?? 0
  const finishedCount = totals?.finished ?? 0
  // Names are in the libraries' languages, which may differ; the server's
  // own collation orders them.
  const collator = new Intl.Collator(undefined, { sensitivity: "base" })
  return {
    genres: genres
      .filter((facet) => facet.name !== scope.genre)
      .toSorted((a, b) => collator.compare(a.name, b.name)),
    studios: studios.filter((facet) => facet.name !== scope.studio),
    ratings: await ratingOptions(rated),
    languages,
    years: range(totals?.yearMin ?? null, totals?.yearMax ?? null, 1),
    scores: range(
      totals?.scoreMin ?? null,
      totals?.scoreMax ?? null,
      TITLE_SCORE_STEP,
    ),
    runtime: range(
      totals?.runtimeMin ?? null,
      totals?.runtimeMax ?? null,
      TITLE_RUNTIME_STEP,
    ),
    watched: {
      unwatched: total - startedCount,
      inProgress: startedCount - finishedCount,
      watched: finishedCount,
    },
    total,
    sorts: TITLE_SORTS.filter((sort) =>
      sort === "year"
        ? (totals?.dated ?? 0) > 0
        : sort === "score"
          ? (totals?.scored ?? 0) > 0
          : sort === "runtime"
            ? (totals?.timed ?? 0) > 0
            : true,
    ),
  }
}
