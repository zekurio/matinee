import {
  NO_CATALOG_FILTERS,
  type CatalogRef,
  type DiscoverRail,
  type DiscoverRails,
  type DiscoverRow,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { library } from "@matinee/db"

import { can, type Viewer } from "../access/viewer"
import { db } from "../db"
import { env } from "../env"
import { queueArtwork, saveArtwork } from "../media/artwork"
import {
  discoverBecause,
  discoverRails,
  impressions,
} from "../recommendations/read"
import { destinations } from "../requests/destinations"
import { page, query } from "./browse"
import { browseProvider } from "./cache"
import { askable, catalogCards } from "./cards"

/*
 * Discover's rows: the viewer's recommendations first, then what's
 * popular, then what's coming out, each holding only titles the viewer
 * can ask for. Each but "Because you watched" is the start of a browse,
 * a kind with filters and a sort, which its heading opens in full.
 */

type Rail = t.infer<typeof DiscoverRail>
type Kind = CatalogRef["kind"]

/** The rows every viewer gets, of the kinds they can ask for. */
function catalogRails(kinds: Kind[]): Rail[] {
  const filters = { ...NO_CATALOG_FILTERS, requestable: true }
  const result: Rail[] = []
  if (kinds.includes("movie"))
    result.push({
      id: "popularFilms",
      seed: null,
      browse: { kinds: ["movie"], filters, sort: "popular" },
    })
  if (kinds.includes("show"))
    result.push({
      id: "popularShows",
      seed: null,
      browse: { kinds: ["show"], filters, sort: "popular" },
    })
  result.push({
    id: "comingSoon",
    seed: null,
    browse: { kinds, filters: { ...filters, upcoming: true }, sort: "popular" },
  })
  return result
}

/** The kinds this viewer can ask for, which Discover is of; none without TMDB. */
async function askableKinds(viewer: Viewer) {
  if (!env.MATINEE_TMDB_API_KEY) return []
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie"),
    destinations(viewer, "show"),
  ])
  const kinds: Kind[] = []
  if (movies.length) kinds.push("movie")
  if (shows.length) kinds.push("show")
  return kinds
}

export async function rails(
  viewer: Viewer,
): Promise<t.infer<typeof DiscoverRails>> {
  const kinds = await askableKinds(viewer)
  // Discover is for eligible request destinations, not a standalone TMDB browser.
  if (!kinds.length)
    return { enabled: false, requests: null, rails: [], browse: [] }
  return {
    enabled: true,
    requests: requestsRow(viewer),
    rails: [...(await discoverRails(viewer, kinds)), ...catalogRails(kinds)],
    browse: kinds,
  }
}

/**
 * Which requests head Discover: the waiting ones for whoever runs the
 * queue, reading it and answering from the cards, as the web's
 * `runsQueue` has it; the viewer's own for anyone who may read those;
 * none otherwise.
 */
function requestsRow(viewer: Viewer) {
  if (
    can(viewer, "adminRequest.read") &&
    (can(viewer, "adminRequest.approve") || can(viewer, "adminRequest.decline"))
  )
    return "queue"
  return can(viewer, "request.read") ? "mine" : null
}

/**
 * A row's cards: the first page of its browse, of each of its kinds in
 * turn, or what came from a "Because you watched" row's title. Only the
 * row asked for is worked out, from this viewer, so a client can't ask
 * for another's.
 */
export async function row(
  viewer: Viewer,
  input: { id: Rail["id"]; seed: Rail["seed"] },
): Promise<t.infer<typeof DiscoverRow>> {
  const empty = { items: [], stale: false, detail: null }
  const kinds = await askableKinds(viewer)
  if (!kinds.length) return empty
  if (input.id === "becauseWatched") {
    if (!input.seed) return empty
    const rows = await discoverBecause(viewer, kinds, input.seed)
    const kind = input.seed.ref.kind
    const cards = await catalogCards(
      viewer,
      kind,
      rows.map((r) => ({
        id: r.tmdbId,
        name: r.name,
        year: r.year,
        poster: r.poster,
        releaseDate: r.releaseDate,
      })),
    )
    impressions(viewer, rows, "discover", input.id)
    return {
      items: cards.flatMap(({ row, card }) =>
        askable(card.availability)
          ? [{ ...card, score: null, votes: 0, releaseDate: row.releaseDate }]
          : [],
      ),
      stale: false,
      detail: null,
    }
  }
  const rail = (
    input.id === "forYou"
      ? await discoverRails(viewer, kinds)
      : catalogRails(kinds)
  ).find((r) => r.id === input.id)
  const browse = rail?.browse
  if (!browse) return empty
  const pages = await Promise.all(
    browse.kinds.map((kind) =>
      page(viewer, {
        kind,
        filters: browse.filters,
        sort: browse.sort,
        page: 1,
      }),
    ),
  )
  return {
    items: interleave(pages.map((p) => p.items)),
    stale: pages.some((p) => p.stale),
    detail: pages[0]?.detail ?? null,
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
 * The catalog rows' first pages read ahead, with their posters fetched,
 * so the first person to open Discover after TMDB's lists change sees
 * each poster's placeholder rather than an empty card. The pages are the
 * same for everyone who reads them in a language, one per language a
 * library that takes requests uses.
 */
export async function prepareDiscover({
  signal,
}: { signal?: AbortSignal } = {}): Promise<void> {
  if (!env.MATINEE_TMDB_API_KEY) return
  // ACCESS: no viewer; only each library's kind and language are read, to
  // fill the shared cache. Pages still filter by what a viewer sees.
  const rows = await db.select().from(library)
  for (const kind of ["movie", "show"] as const) {
    const languages = new Set(
      rows
        .filter(
          (row) =>
            row.metadataProvider !== null &&
            (row.kind === "movies") === (kind === "movie"),
        )
        .map((row) => row.metadataLanguage),
    )
    for (const language of languages) {
      for (const { browse } of catalogRails([kind])) {
        if (signal?.aborted) return
        if (!browse) continue
        const built = await query(
          kind,
          { language, country: null },
          browse.filters,
          browse.sort,
        )
        const result = await browseProvider(kind, language, built.query, 1)
        const saved = await saveArtwork(
          result.value.items.map((row) => row.poster),
          undefined,
          { catalog: true },
        )
        queueArtwork([...saved.values()], "low")
      }
    }
  }
}
