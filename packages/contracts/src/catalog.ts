import { Artwork } from "./artwork"
import { get, post } from "./contract-routes"
import { t } from "./schema"
import {
  Credit,
  MetadataProviderId,
  TitleKind,
  TitleSummary,
  Trailer,
} from "./schemas"

/** References are issued by the server, never translated between providers by clients. */
export const CatalogRef = t.object({
  kind: TitleKind,
  provider: MetadataProviderId,
  providerId: t.string().min(1).max(256),
})
export type CatalogRef = t.infer<typeof CatalogRef>

export const DECLINE_REASONS = [
  "alreadyHere",
  "notForServer",
  "notFound",
] as const
export const DeclineReason = t.enum(DECLINE_REASONS)
export type DeclineReason = t.infer<typeof DeclineReason>

/**
 * The reasons a waiting request is declined with. "Can't find a copy" is
 * only known once a request was accepted and sent, so it goes with
 * giving up on one instead.
 */
export const WAITING_DECLINE_REASONS = ["alreadyHere", "notForServer"] as const
export const WaitingDeclineReason = t.enum(WAITING_DECLINE_REASONS)
export type WaitingDeclineReason = t.infer<typeof WaitingDeclineReason>

export const RequestQuota = t.object({
  titles: t.number().int().min(1).max(10000),
  days: t.number().int().min(1).max(365),
})

export type RequestQuota = t.infer<typeof RequestQuota>

export const RequestLimit = RequestQuota.nullable()
export type RequestLimit = t.infer<typeof RequestLimit>

/** Computed from playable library rows for this viewer, never from arrival facts.
 * Hidden library holdings must not affect this response, including ids and counts.
 */
export const Availability = t.object({
  state: t.enum(["none", "asked", "coming", "release", "unavailable", "here"]),
  action: t.enum(["ask", "add", "follow", "unfollow", "cancel"]).nullable(),
  progress: t.number().min(0).max(1).nullable(),
  etaSeconds: t.number().int().min(0).nullable(),
  releaseDate: t.string().nullable(),
  stillLooking: t.boolean(),
  /**
   * Why a declined title is unavailable, with who declined it and the
   * admin's note. Only for the people who requested or follow it;
   * everyone else sees the title as unavailable without it.
   */
  reason: t
    .object({
      kind: t.enum(["declined", "notFound"]),
      code: DeclineReason.nullable(),
      note: t.string().nullable(),
    })
    .nullable(),
  askedBySelf: t.boolean(),
  following: t.boolean(),
  requestId: t.uuid().nullable(),
  others: t.object({
    count: t.number().int().min(0),
    names: t.array(t.string()),
  }),
  limit: t
    .object({ left: t.number().int().min(0), resetsAt: t.date() })
    .nullable(),
  libraryTitleId: t.uuid().nullable(),
  /**
   * Explains a disabled action without making a client infer policy or
   * quota. "declined": an admin declined the title's request, which
   * closes it for everyone until an admin lifts the decline.
   */
  disabledReason: t
    .enum(["off", "limit", "noDestination", "declined"])
    .nullable(),
})
export type Availability = t.infer<typeof Availability>

/**
 * A season's own state. A season with some of its aired episodes here
 * plays, and its state and action are about the rest: "none" with an ask
 * until someone asks for it, then "asked" or "coming".
 */
export const SeasonAvailability = Availability.extend({
  number: t.number().int().min(0),
  episodesHere: t.number().int().min(0),
  episodesAired: t.number().int().min(0),
})

export const ShowScope = t.object({
  seasons: t.array(t.number().int().min(0)).max(1000),
  future: t.boolean(),
})

export const CatalogDestination = t.object({
  id: t.uuid(),
  name: t.string(),
  selected: t.boolean(),
})

export const CatalogTitleSummary = t.object({
  ref: CatalogRef,
  name: t.string(),
  year: t.number().int().nullable(),
  poster: Artwork.nullable(),
  availability: Availability,
})

export const CatalogSeason = t.object({
  number: t.number().int().min(0),
  overview: t.string().nullable(),
  poster: Artwork.nullable(),
  episodeCount: t.number().int().nullable(),
  airDate: t.string().nullable(),
  availability: SeasonAvailability,
  selected: t.boolean(),
})

/**
 * A show in the library whose last episode on the server the viewer
 * finished, and its next season, which the server doesn't have.
 */
export const NextSeasonEntry = t.object({
  title: TitleSummary,
  /** The show at its library's metadata provider, for asking. */
  ref: CatalogRef,
  libraryId: t.uuid(),
  season: CatalogSeason,
  /** When the viewer last finished an episode of the show, for ordering. */
  lastWatchedAt: t.date(),
})
export type NextSeasonEntry = t.infer<typeof NextSeasonEntry>

export const CatalogTitleDetail = CatalogTitleSummary.extend({
  /** Provider metadata is from an expired cache entry after a provider failure. */
  stale: t.boolean(),
  overview: t.string().nullable(),
  genres: t.array(t.string()),
  rating: t.number().nullable(),
  contentRating: t.string().nullable(),
  backdrop: Artwork.nullable(),
  /** Cast in billing order, then crew, as a library title's. */
  credits: t.array(Credit),
  studios: t.array(t.string()),
  /** Best first, in the language of the library it would go to. */
  trailers: t.array(Trailer),
  seasons: t.array(CatalogSeason),
  defaultScope: ShowScope.nullable(),
  destinations: t.array(CatalogDestination),
})

export const CatalogPage = t.object({
  items: t.array(CatalogTitleSummary),
  nextPage: t.number().int().nullable(),
  stale: t.boolean(),
})

export const CatalogInput = t.object({
  ref: CatalogRef,
  libraryId: t.uuid().optional(),
})

export const RelatedRailId = t.enum(["collection", "moreLikeThis"])

/**
 * A row of titles related to a catalog title: the other parts of the
 * film series it belongs to, or what TMDB recommends with it. `name` is
 * the series' own name in the page's language; null for "More like
 * this", which each client words itself.
 */
export const RelatedRail = t.object({
  id: RelatedRailId,
  name: t.string().nullable(),
})

export const RelatedRails = t.object({
  rails: t.array(RelatedRail),
  /** The provider's answer is from an expired cache entry. */
  stale: t.boolean(),
})

/**
 * A related title. One in a library the viewer can see brings that
 * library's title, and clients draw it as the library's card.
 */
export const RelatedTitle = CatalogTitleSummary.extend({
  title: TitleSummary.nullable(),
})

export const RelatedPage = t.object({
  items: t.array(RelatedTitle),
  stale: t.boolean(),
})

export const catalogContract = {
  search: get("/catalog/search")
    .input(
      t.object({
        query: t.string().trim().min(1).max(256),
        kind: TitleKind.optional(),
        libraryId: t.uuid().optional(),
        page: t.number().int().min(1).$default(1),
      }),
    )
    .output(CatalogPage),
  details: post("/catalog/details")
    .input(CatalogInput)
    .output(CatalogTitleDetail),
  /** The rows of related titles a title's page has, in order. */
  related: post("/catalog/related").input(CatalogInput).output(RelatedRails),
  /** One row's titles, marked with the viewer's availability. */
  relatedTitles: post("/catalog/related/titles")
    .input(CatalogInput.extend({ rail: RelatedRailId }))
    .output(RelatedPage),
  missingSeasons: get("/catalog/missing-seasons")
    .input(t.object({ titleId: t.uuid() }))
    .output(
      t.object({
        ref: CatalogRef,
        stale: t.boolean(),
        seasons: t.array(CatalogSeason),
        partialSeasons: t.array(CatalogSeason),
        nextSeason: CatalogSeason.nullable(),
        defaultScope: ShowScope,
        destinations: t.array(CatalogDestination),
      }),
    ),
}
