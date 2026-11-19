import { RelatedTitle } from "./catalog"
import { get, post } from "./contract-routes"
import { RecommendationSeed } from "./recommendations"
import { t } from "./schema"
import { TitleKind } from "./schemas"

/*
 * Browsing the whole catalog of one kind, films or shows, or the
 * viewer's recommendations of it, narrowed by filters and in an order
 * the viewer picks. The server lists what each filter offers
 * (`browseOptions`), so no client keeps TMDB's ids or retypes the steps.
 */

/** The orders a browse can take. Each client words them itself. */
export const CATALOG_SORTS = [
  "popular",
  /** Best match first, only among the viewer's recommendations. */
  "forYou",
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
    /** Only the viewer's recommendations, in place of TMDB's whole catalog. */
    recommended: t.boolean().$default(false),
    /** Out within the next three months, and not yet. */
    upcoming: t.boolean().$default(false),
    /** Only titles the viewer can ask for: none that are here or declined. */
    requestable: t.boolean().$default(false),
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

/** Every filter off. */
export const NO_CATALOG_FILTERS: CatalogFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  scoreMin: null,
  scoreMax: null,
  votesMin: null,
  rating: null,
  language: null,
  runtimeMin: null,
  runtimeMax: null,
  recommended: false,
  upcoming: false,
  requestable: false,
}

export const CatalogBrowseInput = t
  .object({
    kind: TitleKind,
    filters: CatalogFilters,
    sort: CatalogSort.$default("popular"),
    page: t.number().int().min(1).max(500).$default(1),
  })
  .refine((value) => value.sort !== "forYou" || value.filters.recommended, {
    path: ["sort"],
    message: "Sort by best match only among your recommendations.",
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

/** What a card says under its name in place of the year: its score or its release date. */
export const CatalogCardDetail = t.enum(["score", "releaseDate"])

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
  detail: CatalogCardDetail.nullable(),
})

export const DiscoverRailId = t.enum([
  "popularFilms",
  "popularShows",
  "comingSoon",
  "forYou",
  "becauseWatched",
])

/**
 * The browse a row is the start of, which its heading opens: of the
 * first of `kinds`, which can switch to the other.
 */
export const DiscoverBrowse = t.object({
  /** The kinds the row holds, films and shows taking turns. */
  kinds: t.array(TitleKind).min(1),
  filters: CatalogFilters,
  sort: CatalogSort,
})

/**
 * A row of Discover. "forYou" and "becauseWatched" are the viewer's
 * recommendations; a "becauseWatched" row names the title it starts
 * from in `seed`, which is null for every other row. It's the one row
 * with no browse behind it, since it holds what came from one title.
 */
export const DiscoverRail = t.object({
  id: DiscoverRailId,
  seed: RecommendationSeed.nullable().$default(null),
  browse: DiscoverBrowse.nullable(),
})

export const DiscoverRails = t.object({
  enabled: t.boolean(),
  /**
   * Whether Discover opens with the waiting requests, read from
   * `admin.requests.live`. True only for an admin while at least one
   * request waits. It's no `DiscoverRail`, so an app that doesn't know
   * the row still reads the rest.
   */
  requests: t.boolean(),
  rails: t.array(DiscoverRail),
  /** The kinds this viewer can browse with filters, through `browse`. */
  browse: t.array(TitleKind),
})

/** The cards a row of Discover shows: the first page of its browse, or what came from its seed. */
export const DiscoverRow = t.object({
  items: t.array(CatalogBrowseTitle),
  stale: t.boolean(),
  detail: CatalogCardDetail.nullable(),
})

export const discoverContract = {
  rails: get("/discover/rails").output(DiscoverRails),
  /** A row's cards, by its `id` and `seed`. */
  row: post("/discover/row")
    .input(
      t.object({
        id: DiscoverRailId,
        seed: RecommendationSeed.nullable().$default(null),
      }),
    )
    .output(DiscoverRow),
  /** What browsing a kind offers. */
  browseOptions: get("/discover/browse/options")
    .input(t.object({ kind: TitleKind }))
    .output(CatalogBrowseOptions),
  /** A page of the catalog of one kind, filtered and sorted. */
  browse: post("/discover/browse")
    .input(CatalogBrowseInput)
    .output(CatalogBrowsePage),
}
