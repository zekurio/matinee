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

const FeedItem = t.object({
  id: t.string(),
  name: t.string(),
  year: t.number().nullable(),
  poster: t.string().nullable(),
  releaseDate: t.string().nullable(),
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
