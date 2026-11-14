import type { CatalogRef, DiscoverRail } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { library, request, requestFollower } from "@matinee/db"
import { and, desc, eq, exists, ne } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { inLibraries } from "../access/visible"
import { db } from "../db"
import { env } from "../env"
import {
  placeholders,
  queueArtwork,
  saveArtwork,
  toArtwork,
} from "../media/artwork"
import { availability, ExternalIds } from "../requests/availability"
import { withCachedDetails } from "../requests/cached-details"
import { destinations, lookupLanguage } from "../requests/destinations"
import { loadRouting } from "../requests/fulfilment/connections"
import { feedProvider } from "./cache"

type Rail = t.infer<typeof DiscoverRail>

function tmdbRef(kind: CatalogRef["kind"], providerId: string): CatalogRef {
  return { kind, provider: "tmdb", providerId }
}

async function others(viewer: Viewer) {
  return db
    .select()
    .from(request)
    .where(
      and(
        inLibraries(viewer, request.libraryId),
        ne(request.status, "declined"),
        exists(
          db
            .select({ id: requestFollower.userId })
            .from(requestFollower)
            .where(
              and(
                eq(requestFollower.requestId, request.id),
                ne(requestFollower.userId, viewer.id),
                eq(requestFollower.asked, true),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(request.createdAt), desc(request.id))
}

export async function rails(viewer: Viewer) {
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie"),
    destinations(viewer, "show"),
  ])
  // Discover is for eligible request destinations, not a standalone TMDB browser.
  if (!env.MATINEE_TMDB_API_KEY || (!movies.length && !shows.length))
    return { enabled: false, rails: [], browse: [] }
  const kinds: CatalogRef["kind"][] = []
  if (movies.length) kinds.push("movie")
  if (shows.length) kinds.push("show")
  const result: Rail[] = []
  const popular: Rail["id"][] = []
  if (movies.length) popular.push("popularFilms")
  if (shows.length) popular.push("popularShows")
  popular.push("comingSoon")
  for (const id of popular) {
    result.push({ id })
  }
  const asked = await others(viewer)
  const states = await availability(
    viewer,
    asked.map((row) => ({
      ref: {
        kind: row.kind,
        provider: row.provider,
        providerId: row.providerId,
      },
      externalIds: ExternalIds.parse(row.externalIds),
    })),
  )
  if (
    states.some(
      (state, index) =>
        asked[index] &&
        ExternalIds.parse(asked[index].externalIds).tmdb &&
        kinds.includes(asked[index].kind) &&
        state.availability.state !== "here" &&
        state.availability.state !== "unavailable",
    )
  )
    result.push({ id: "othersAsked" })
  return { enabled: true, rails: result, browse: kinds }
}

export async function page(
  viewer: Viewer,
  input: { rail: Rail; page: number },
) {
  const empty = { items: [], nextPage: null, stale: false }
  // Rebuild the rows from this viewer, so a client can't ask for another.
  const descriptor = (await rails(viewer)).rails.find(
    (rail) => rail.id === input.rail.id,
  )
  if (!descriptor) return empty
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie"),
    destinations(viewer, "show"),
  ])
  if (descriptor.id === "othersAsked") {
    const rows = (await others(viewer)).filter((row) =>
      row.kind === "movie" ? movies.length : shows.length,
    )
    const states = await availability(
      viewer,
      rows.map((row) => ({
        ref: {
          kind: row.kind,
          provider: row.provider,
          providerId: row.providerId,
        },
        libraryId: row.libraryId,
        externalIds: ExternalIds.parse(row.externalIds),
      })),
    )
    const art = await placeholders(
      rows.flatMap((row) => (row.posterId ? [row.posterId] : [])),
    )
    const items = rows.flatMap((row, index) => {
      const state = states[index]?.availability
      // Discover offers titles to request, so a declined one, which
      // nobody can request, is left out. Search still finds it.
      if (!state || state.state === "here" || state.state === "unavailable")
        return []
      const tmdb = ExternalIds.parse(row.externalIds).tmdb
      // Local requests without a known TMDB id cannot issue a TMDB feed reference.
      if (!tmdb) return []
      return [
        {
          ref: tmdbRef(row.kind, tmdb),
          name: row.name,
          year: row.year,
          poster: toArtwork(row.posterId, art),
          availability: state,
        },
      ]
    })
    const start = (input.page - 1) * 20
    return {
      items: items.slice(start, start + 20),
      nextPage: items.length > start + 20 ? input.page + 1 : null,
      stale: false,
    }
  }
  const kinds: CatalogRef["kind"][] = []
  if (descriptor.id === "popularFilms") kinds.push("movie")
  else if (descriptor.id === "popularShows") kinds.push("show")
  else {
    if (movies.length) kinds.push("movie")
    if (shows.length) kinds.push("show")
  }
  const results = await Promise.all(
    kinds.map(async (kind) => {
      const candidates = kind === "movie" ? movies : shows
      if (!candidates.length) return { items: [], nextPage: null, stale: false }
      const result = await feedProvider(
        kind,
        lookupLanguage(candidates),
        descriptor.id === "comingSoon" ? "soon" : "popular",
        input.page,
      )
      const states = await availability(
        viewer,
        await withCachedDetails(
          viewer,
          result.value.items.map((row) => ({
            ref: { kind, provider: "tmdb", providerId: row.id },
            releaseDate: row.releaseDate,
          })),
        ),
      )
      const saved = await saveArtwork(
        result.value.items.map((row) => row.poster),
      )
      const art = await placeholders([...saved.values()])
      queueArtwork([...saved.values()], "low")
      return {
        items: result.value.items.flatMap((row, index) => {
          const state = states[index]?.availability
          // Discover offers titles to request, so a declined one, which
          // nobody can request, is left out. Search still finds it.
          if (!state || state.state === "here" || state.state === "unavailable")
            return []
          return [
            {
              ref: tmdbRef(kind, row.id),
              name: row.name,
              year: row.year,
              poster: toArtwork(
                row.poster ? (saved.get(row.poster) ?? null) : null,
                art,
              ),
              availability: state,
            },
          ]
        }),
        nextPage: result.value.nextPage,
        stale: result.stale,
      }
    }),
  )
  // Films and shows take turns, each in the provider's order, most
  // popular first. Sorting a page by date would start every page of the
  // grid back at today.
  const items = interleave(results.map((result) => result.items))
  return {
    items,
    nextPage: results.some((result) => result.nextPage) ? input.page + 1 : null,
    stale: results.some((result) => result.stale),
  }
}

/** The first of each list, then the second of each, and so on. */
function interleave<T>(lists: T[][]): T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length))
  return Array.from({ length: longest }, (_, index) =>
    lists.flatMap((list) => {
      const item = list[index]
      return item === undefined ? [] : [item]
    }),
  ).flat()
}

/**
 * Discover's rows read ahead, with their posters fetched, so the first
 * person to open Discover after a feed changes sees each poster's
 * placeholder rather than an empty card. The rows are the same for
 * everyone who reads them in a language, one per language a library that
 * takes requests uses.
 */
export async function prepareDiscover({
  signal,
}: { signal?: AbortSignal } = {}): Promise<void> {
  if (!env.MATINEE_TMDB_API_KEY) return
  const routing = await loadRouting()
  // ACCESS: no viewer; only each library's kind and language are read, to
  // fill the shared feed cache. Pages still filter by what a viewer sees.
  const rows = await db.select().from(library)
  for (const kind of ["movie", "show"] as const) {
    const reached = routing.reached(kind)
    const languages = new Set(
      rows
        .filter(
          (row) =>
            reached.has(row.id) &&
            (row.kind === "movies") === (kind === "movie"),
        )
        .map((row) => row.metadataLanguage),
    )
    for (const language of languages) {
      for (const operation of ["popular", "soon"] as const) {
        if (signal?.aborted) return
        const result = await feedProvider(kind, language, operation, 1)
        const saved = await saveArtwork(
          result.value.items.map((row) => row.poster),
        )
        queueArtwork([...saved.values()], "low")
      }
    }
  }
}
