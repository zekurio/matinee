import { CatalogPage, CatalogRef, RelatedTitle } from "./catalog"
import { get, post } from "./contract-routes"
import { t } from "./schema"
import { TitleKind } from "./schemas"

export const DiscoverRail = t.object({
  id: t.enum([
    "becauseWatched",
    "popularFilms",
    "popularShows",
    "comingSoon",
    "othersAsked",
  ]),
  seed: CatalogRef.nullable(),
  seedName: t.string().nullable(),
})

export const DiscoverRails = t.object({
  enabled: t.boolean(),
  rails: t.array(DiscoverRail),
  /** The kinds this viewer can browse with filters, through `browse`. */
  browse: t.array(TitleKind),
})

/*
 * Browsing the whole catalog of one kind, films or shows, narrowed by
 * filters and in an order the viewer picks. The server lists what each
 * filter offers (`browseOptions`), so no client keeps TMDB's ids or
 * retypes the steps.
 */

/** The orders a browse can take. Each client words them itself. */
export const CATALOG_SORTS = [
  "popular",
  "scoreHigh",
  "scoreLow",
  "votes",
  "newest",
  "oldest",
  "nameAsc",
  "nameDesc",
] as const
export const CatalogSort = t.enum(CATALOG_SORTS)
export type CatalogSort = t.infer<typeof CatalogSort>

/** How far a score bound moves at a time, on TMDB's 0 to 10. */
export const CATALOG_SCORE_STEP = 0.5
/** How far a runtime bound moves at a time, in minutes. */
export const CATALOG_RUNTIME_STEP = 15

const year = t.number().int().min(1800).max(2200).nullable().$default(null)
const score = t
  .number()
  .min(0)
  .max(10)
  .multipleOf(CATALOG_SCORE_STEP)
  .nullable()
  .$default(null)
const runtime = t
  .number()
  .int()
  .min(0)
  .max(600)
  .multipleOf(CATALOG_RUNTIME_STEP)
  .nullable()
  .$default(null)

const ordered = (low: number | null, high: number | null) =>
  low === null || high === null || low <= high

/**
 * What a browse is narrowed to. Null, or an empty list, leaves a filter
 * off. Bounds are inclusive. Genre ids, ratings, languages and vote
 * steps are the ones `browseOptions` offers; anything else is refused.
 */
export const CatalogFilters = t
  .object({
    /** Titles with every one of these genres. */
    genres: t.array(t.number().int().min(1)).max(10).$default([]),
    yearFrom: year,
    yearTo: year,
    scoreMin: score,
    scoreMax: score,
    /** At least this many votes, one of the offered steps. */
    votesMin: t.number().int().min(1).max(1_000_000).nullable().$default(null),
    /** Rated this or milder, in the country `browseOptions` names. */
    rating: t.string().trim().min(1).max(16).nullable().$default(null),
    /** An ISO 639-1 code of the language it was made in. */
    language: t
      .string()
      .regex(/^[a-z]{2}$/, "Use a two-letter language code like en.")
      .nullable()
      .$default(null),
    /** A film's runtime, or a show's episodes', in minutes. */
    runtimeMin: runtime,
    runtimeMax: runtime,
  })
  .refine((value) => ordered(value.yearFrom, value.yearTo), {
    path: ["yearTo"],
    message: "The first year can't be after the last.",
  })
  .refine((value) => ordered(value.scoreMin, value.scoreMax), {
    path: ["scoreMax"],
    message: "The lowest score can't be above the highest.",
  })
  .refine((value) => ordered(value.runtimeMin, value.runtimeMax), {
    path: ["runtimeMax"],
    message: "The shortest runtime can't be longer than the longest.",
  })
export type CatalogFilters = t.infer<typeof CatalogFilters>

export const CatalogBrowseInput = t.object({
  kind: TitleKind,
  filters: CatalogFilters,
  sort: CatalogSort.$default("popular"),
  page: t.number().int().min(1).max(500).$default(1),
})

/** A span a filter's bounds move in, by `step`. */
export const CatalogRange = t.object({
  min: t.number(),
  max: t.number(),
  step: t.number(),
})

export const CatalogChoice = t.object({ id: t.string(), name: t.string() })

/** What each filter offers for one kind, in the language its titles read in. */
export const CatalogBrowseOptions = t.object({
  /** Whether this viewer can browse the kind: TMDB is set up and they can ask for one. */
  enabled: t.boolean(),
  /** Some lists are from an expired cache entry. */
  stale: t.boolean(),
  genres: t.array(t.object({ id: t.number().int(), name: t.string() })),
  /**
   * The age ratings of the country the titles' language belongs to,
   * mildest first, as TMDB lists them. Null where it lists none.
   */
  ratings: t
    .object({
      /** ISO 3166-1, like US or DE. */
      country: t.string(),
      ratings: t.array(t.string()),
    })
    .nullable(),
  /** Languages a title can be made in, by name. */
  languages: t.array(CatalogChoice),
  sorts: t.array(CatalogSort),
  /** The vote minimums on offer, smallest first. */
  votes: t.array(t.number().int()),
  /** Release years. A bound at an end leaves that side open. */
  years: CatalogRange,
  /** User scores, on TMDB's 0 to 10. A bound at an end leaves that side open. */
  scores: CatalogRange,
  /** Runtime in minutes. A bound at an end leaves that side open. */
  runtime: CatalogRange,
})

/**
 * A title in a browse. One in a library the viewer can see brings that
 * library's title, and clients draw it as the library's card.
 */
export const CatalogBrowseTitle = RelatedTitle.extend({
  /** TMDB's user score, 0 to 10, or null before anyone voted. */
  score: t.number().min(0).max(10).nullable(),
  votes: t.number().int().min(0),
  releaseDate: t.string().nullable(),
})

export const CatalogBrowsePage = t.object({
  items: t.array(CatalogBrowseTitle),
  nextPage: t.number().int().nullable(),
  /** The provider's answer is from an expired cache entry. */
  stale: t.boolean(),
  /**
   * A vote minimum the server applied on its own, because the order
   * would otherwise put titles a handful of people voted on first. Null
   * when the viewer chose one, or the order needs none.
   */
  voteFloor: t.number().int().nullable(),
  /** What a card says under its name in place of the year: its score or its release date. */
  detail: t.enum(["score", "releaseDate"]).nullable(),
})

export const discoverContract = {
  rails: get("/discover/rails").output(DiscoverRails),
  page: post("/discover/page")
    .input(
      t.object({
        rail: DiscoverRail,
        page: t.number().int().min(1).$default(1),
      }),
    )
    .output(CatalogPage),
  /** What browsing a kind offers. */
  browseOptions: get("/discover/browse/options")
    .input(t.object({ kind: TitleKind }))
    .output(CatalogBrowseOptions),
  /** A page of the catalog of one kind, filtered and sorted. */
  browse: post("/discover/browse")
    .input(CatalogBrowseInput)
    .output(CatalogBrowsePage),
}
