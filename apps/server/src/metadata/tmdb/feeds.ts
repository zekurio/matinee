import type { CatalogRef } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { yearOf } from "../types"
import { image, request } from "./client"

const Result = t.object({
  id: t.number(),
  adult: t.boolean().optional(),
  title: t.string().optional(),
  name: t.string().optional(),
  release_date: t.string().optional(),
  first_air_date: t.string().optional(),
  poster_path: t.string().nullable().optional(),
})
const Page = t.object({ results: t.array(Result), total_pages: t.number() })

const FeedItem = t.object({
  id: t.string(),
  name: t.string(),
  year: t.number().nullable(),
  poster: t.string().nullable(),
  releaseDate: t.string().nullable(),
})

export const FeedPage = t.object({
  items: t.array(FeedItem),
  nextPage: t.number().nullable(),
})

/** A title as a feed lists it, without the adult ones. */
function feedItems(rows: t.infer<typeof Result>[]) {
  return rows
    .filter((row) => !row.adult)
    .map((row) => ({
      id: String(row.id),
      name: row.title ?? row.name ?? "",
      year: yearOf(row.release_date ?? row.first_air_date),
      poster: image(row.poster_path, "w342"),
      releaseDate: row.release_date || row.first_air_date || null,
    }))
}

export async function feed(
  kind: CatalogRef["kind"],
  language: string,
  operation: "popular" | "soon" | "recommendations",
  page: number,
  seed?: string,
) {
  const type = kind === "movie" ? "movie" : "tv"
  const today = new Date().toISOString().slice(0, 10)
  const until = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  const date = kind === "movie" ? "primary_release_date" : "first_air_date"
  const path =
    operation === "recommendations"
      ? `/${type}/${encodeURIComponent(seed ?? "")}/recommendations`
      : operation === "popular"
        ? `/trending/${type}/week`
        : `/discover/${type}`
  const params = new Map<string, string | number>([
    ["language", language],
    ["page", page],
    ["include_adult", "false"],
  ])
  if (operation === "soon") {
    params.set(`${date}.gte`, today)
    params.set(`${date}.lte`, until)
    // By date alone, the window opens on whatever anyone listed for
    // today, mostly titles nobody has heard of. Popular ones first; each
    // card says its date.
    params.set("sort_by", "popularity.desc")
  }
  const data = Page.parse(await request(path, Object.fromEntries(params)))
  return {
    items: feedItems(data.results),
    nextPage: page < Math.min(data.total_pages, 500) ? page + 1 : null,
  }
}

export const Related = t.object({
  /** The film series it's part of, under its name in the asked language. */
  collection: t.object({ id: t.string(), name: t.string() }).nullable(),
  recommendations: t.array(FeedItem),
  similar: t.array(FeedItem),
})

const RelatedPayload = t.object({
  belongs_to_collection: t
    .object({ id: t.number(), name: t.string() })
    .nullable()
    .optional(),
  recommendations: t.object({ results: t.array(Result) }).optional(),
  similar: t.object({ results: t.array(Result) }).optional(),
})

/**
 * What TMDB relates to a title, in one call: its collection, and the
 * first page each of its recommendations and of the titles it calls
 * similar.
 */
export async function related(
  kind: CatalogRef["kind"],
  language: string,
  id: string,
): Promise<t.infer<typeof Related>> {
  const type = kind === "movie" ? "movie" : "tv"
  const data = RelatedPayload.parse(
    await request(`/${type}/${encodeURIComponent(id)}`, {
      language,
      append_to_response: "recommendations,similar",
    }),
  )
  const collection = data.belongs_to_collection
  return {
    collection: collection
      ? { id: String(collection.id), name: collection.name }
      : null,
    recommendations: feedItems(data.recommendations?.results ?? []),
    similar: feedItems(data.similar?.results ?? []),
  }
}

export const Collection = t.object({
  name: t.string(),
  parts: t.array(FeedItem),
})

const CollectionPayload = t.object({
  name: t.string(),
  parts: t.array(Result).optional(),
})

/**
 * A film collection's parts in release order, the ones without a date
 * yet last.
 */
export async function collection(
  language: string,
  id: string,
): Promise<t.infer<typeof Collection>> {
  const data = CollectionPayload.parse(
    await request(`/collection/${encodeURIComponent(id)}`, { language }),
  )
  return {
    name: data.name,
    parts: feedItems(data.parts ?? []).toSorted(
      (a, b) =>
        Number(!a.releaseDate) - Number(!b.releaseDate) ||
        (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""),
    ),
  }
}
