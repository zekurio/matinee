import { type CatalogRef, CreditKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { providerCache } from "@matinee/db"
import { and, eq, lt, sql } from "drizzle-orm"

import { db } from "../db"
import { sources } from "../metadata/sources"
import {
  BrowseResult,
  certifications,
  Certifications,
  discover,
  type DiscoverQuery,
  genres,
  Genres,
  keywords,
  Keywords,
  languages,
  Languages,
} from "../metadata/tmdb/browse"
import { titleFacts } from "../metadata/tmdb/details"
import {
  collection,
  Collection,
  feed,
  FeedPage,
  related,
  Related,
} from "../metadata/tmdb/feeds"
import { ExternalIds } from "../requests/availability"

const cacheBody = () => t.record(t.string(), t.unknown())
const text = t.string().nullable()
const Candidate = t.object({
  id: t.string(),
  name: t.string(),
  year: t.number().nullable(),
  poster: text,
})
const Detail = Candidate.extend({
  overview: text,
  genres: t.array(t.string()),
  /** Missing from entries cached before it was asked for. */
  anime: t.boolean().optional(),
  originalLanguage: text.optional(),
  /** TMDB's only, and missing from its entries cached before they were asked for. */
  genreIds: t.array(t.number()).optional(),
  keywordIds: t.array(t.number()).optional(),
  rating: t.number().nullable(),
  contentRating: text,
  releaseDate: text,
  externalIds: ExternalIds,
  images: t.object({ poster: text, backdrop: text, logo: text }),
  seasons: t.array(
    t.object({ number: t.number(), overview: text, poster: text }),
  ),
  episodes: t.array(
    t.object({ season: t.number(), episode: t.number(), airDate: text }),
  ),
  /** These three are missing from entries cached before they were shown. */
  studios: t.array(t.string()).optional(),
  credits: t
    .array(
      t.object({ kind: CreditKind, name: t.string(), role: text, photo: text }),
    )
    .optional(),
  trailers: t
    .array(t.object({ key: t.string(), name: text, language: text }))
    .optional(),
})

/** Hours. Search is short-lived; full provider-numbered episode lists last a day. */
export const CACHE_HOURS = { search: 6, details: 24, lookup: 168, feed: 6 }
async function cached<T>(
  key: string,
  hours: number,
  parse: (body: t.infer<ReturnType<typeof cacheBody>>) => T,
  fetch: () => Promise<t.infer<ReturnType<typeof cacheBody>>>,
  /** False for an entry that lacks something asked for since; it's fetched again, and served only if that fails. */
  complete: (value: T) => boolean = () => true,
) {
  const [stored] = await db
    .select()
    .from(providerCache)
    .where(eq(providerCache.key, key))
  const parsed = stored
    ? t.record(t.string(), t.unknown()).safeParse(stored.body)
    : null
  let previous: T | undefined
  if (parsed?.success) {
    try {
      previous = parse(parsed.data)
    } catch {
      /* Invalid cache entries are replaced, never served. */
    }
  }
  if (
    previous !== undefined &&
    stored &&
    complete(previous) &&
    stored.fetchedAt.getTime() + hours * 3600000 > Date.now()
  )
    return { value: previous, stale: false }
  try {
    const body = await fetch()
    const value = parse(body)
    await db
      .insert(providerCache)
      .values({ key, body, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: providerCache.key,
        set: { body, fetchedAt: new Date() },
      })
    return { value, stale: false }
  } catch (cause) {
    if (previous !== undefined) return { value: previous, stale: true }
    throw cause
  }
}
export function searchProvider(
  ref: Pick<CatalogRef, "provider" | "kind">,
  language: string,
  query: string,
) {
  return cached(
    JSON.stringify([ref.provider, language, "search", ref.kind, query]),
    CACHE_HOURS.search,
    (body) => t.object({ items: t.array(Candidate) }).parse(body).items,
    async () => ({
      items: await sources[ref.provider].search({
        kind: ref.kind,
        language,
        name: query,
        year: null,
      }),
    }),
  )
}
export function lookupProvider(
  ref: Pick<CatalogRef, "provider" | "kind">,
  language: string,
  ids: t.infer<typeof ExternalIds>,
) {
  const externalIds = ExternalIds.parse(ids)
  return cached(
    JSON.stringify([
      ref.provider,
      language,
      "lookup",
      ref.kind,
      Object.entries(externalIds).sort(([a], [b]) => a.localeCompare(b)),
    ]),
    CACHE_HOURS.lookup,
    (body) => t.object({ id: text }).parse(body).id,
    async () => ({
      id: await sources[ref.provider].lookup(externalIds, {
        kind: ref.kind,
        language,
      }),
    }),
  )
}

/** Where a title's details sit in the provider cache. */
export function detailKey(ref: CatalogRef, language: string) {
  return JSON.stringify([
    ref.provider,
    language,
    "details",
    ref.kind,
    ref.providerId,
  ])
}

export function detailProvider(ref: CatalogRef, language: string) {
  return cached(
    detailKey(ref, language),
    CACHE_HOURS.details,
    (body) => Detail.parse(body),
    async () => {
      const detail = await sources[ref.provider].details(ref.providerId, {
        kind: ref.kind,
        language,
      })
      return { ...detail, poster: detail.images.poster }
    },
    (value) =>
      value.anime !== undefined &&
      (ref.provider !== "tmdb" || value.keywordIds !== undefined) &&
      value.studios !== undefined &&
      value.credits !== undefined &&
      value.trailers !== undefined,
  )
}

export function feedProvider(
  kind: CatalogRef["kind"],
  language: string,
  operation: "popular" | "soon" | "recommendations",
  page: number,
  seed?: string,
) {
  // Date windows change at midnight, even while a previous page is still fresh.
  const day =
    operation === "soon" ? new Date().toISOString().slice(0, 10) : null
  return cached(
    JSON.stringify([
      "tmdb",
      language,
      "feed",
      kind,
      operation,
      page,
      seed,
      day,
    ]),
    CACHE_HOURS.feed,
    (body) => FeedPage.parse(body),
    () => feed(kind, language, operation, page, seed),
  )
}

/** What TMDB relates to a title by its TMDB id, kept as long as a feed. */
export function relatedProvider(
  kind: CatalogRef["kind"],
  language: string,
  id: string,
) {
  return cached(
    JSON.stringify(["tmdb", language, "related", kind, id]),
    CACHE_HOURS.feed,
    (body) => Related.parse(body),
    () => related(kind, language, id),
  )
}

/**
 * A page of the catalog of one kind, filtered and sorted, kept as long as
 * a feed. The key holds the whole query, which the caller has already
 * brought to its steps, so every distinct answer has one entry.
 */
export function browseProvider(
  kind: CatalogRef["kind"],
  language: string,
  query: DiscoverQuery,
  page: number,
) {
  return cached(
    JSON.stringify(["tmdb", language, "browse", kind, query, page]),
    CACHE_HOURS.feed,
    (body) => BrowseResult.parse(body),
    () => discover(kind, language, query, page),
  )
}

/** How long a browsed page stays after it was last fetched. */
const BROWSE_KEPT_DAYS = 7

/**
 * Deletes browsed pages fetched more than a week ago. Filters make more
 * distinct pages than any feed, and an old one is only worth keeping as
 * a stand-in while TMDB is down.
 */
export async function forgetBrowsedPages() {
  await db
    .delete(providerCache)
    .where(
      and(
        sql`${providerCache.key} like ${'["tmdb","%","browse",%'}`,
        lt(
          providerCache.fetchedAt,
          new Date(Date.now() - BROWSE_KEPT_DAYS * 86400000),
        ),
      ),
    )
}

/** A kind's genres in a language, kept as long as a lookup. */
export function genreProvider(kind: CatalogRef["kind"], language: string) {
  return cached(
    JSON.stringify(["tmdb", language, "genres", kind]),
    CACHE_HOURS.lookup,
    (body) => Genres.parse(body).genres,
    () => genres(kind, language),
  )
}

/** Every country's age ratings for a kind, kept as long as a lookup. */
export function certificationProvider(kind: CatalogRef["kind"]) {
  return cached(
    JSON.stringify(["tmdb", "certifications", kind]),
    CACHE_HOURS.lookup,
    (body) => Certifications.parse(body).certifications,
    () => certifications(kind),
  )
}

/** The languages a title can be made in, kept as long as a lookup. */
export function languageProvider() {
  return cached(
    JSON.stringify(["tmdb", "languages"]),
    CACHE_HOURS.lookup,
    (body) => Languages.parse(body).languages,
    () => languages(),
  )
}

/** A TMDB film collection's name and parts, kept as long as a feed. */
export function collectionProvider(language: string, id: string) {
  return cached(
    JSON.stringify(["tmdb", language, "collection", id]),
    CACHE_HOURS.feed,
    (body) => Collection.parse(body),
    () => collection(language, id),
  )
}

export const Facts = t.object({
  anime: t.boolean(),
  genreIds: t.array(t.number()),
  keywordIds: t.array(t.number()),
  originalLanguage: text,
})

/** Where a title's facts at TMDB sit in the provider cache. */
export function factsKey(kind: CatalogRef["kind"], id: string) {
  return JSON.stringify(["tmdb", "facts", kind, id])
}

/**
 * What override rules look at in a title TMDB knows by `id`, kept as long
 * as details, for a title read from TheTVDB.
 */
export function factsProvider(kind: CatalogRef["kind"], id: string) {
  return cached(
    factsKey(kind, id),
    CACHE_HOURS.details,
    (body) => Facts.parse(body),
    () => titleFacts(kind, id),
  )
}

/** TMDB's keywords matching a search, kept as long as a search. */
export function keywordProvider(query: string) {
  return cached(
    JSON.stringify(["tmdb", "keywords", query.toLowerCase()]),
    CACHE_HOURS.search,
    (body) => Keywords.parse(body).keywords,
    () => keywords(query),
  )
}
