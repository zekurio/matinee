import type { Credit, Title } from "@matinee/contracts"
import { credit, library, mediaItem, title, type TitleRow } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { and, asc, count, eq } from "drizzle-orm"

import { libraryFor, titleFor } from "../access/visible"
import { db } from "../db"
import { log } from "../log"
import { placeholders, saveArtwork, toArtwork } from "../media/artwork"
import {
  episodeOrder,
  inSeason,
  nextItem,
  publicItems,
  titleArtwork,
  toSummaries,
  toSummary,
  viewerStates,
} from "../media/items"
import { seasonsByTitle } from "../media/seasons"
import { refreshTitleNow, sourceFor } from "../metadata/refresh"
import { providerList } from "../metadata/sources"
import { youTubeUrl } from "../metadata/trailers"
import { ProviderError } from "../metadata/types"
import { admin, authed, badRequest, notFound } from "./base"
import { tagCounts, titleOrder, titleWhere } from "./browse"
import { filterOptions, ratingLimits } from "./title-filters"

export async function loadRow(id: string): Promise<TitleRow> {
  // ACCESS: This loader is used only by admin metadata and image procedures.
  const [row] = await db.select().from(title).where(eq(title.id, id))
  if (!row) throw notFound("This title isn't in any library.")
  return row
}

async function creditsOf(row: TitleRow): Promise<Credit[]> {
  const rows = await db
    .select({
      kind: credit.kind,
      name: credit.name,
      role: credit.role,
      photo: credit.photoId,
    })
    .from(credit)
    .where(eq(credit.titleId, row.id))
    .orderBy(asc(credit.position))
  const art = await placeholders(rows.map((c) => c.photo))
  return rows.map((c) => ({ ...c, photo: toArtwork(c.photo, art) }))
}

/**
 * What Play should start: the file the user is in the middle of, else the
 * first unwatched one after the last they finished, else the first.
 */
async function toTitle(row: TitleRow, userId: string): Promise<Title> {
  const [seasons, next, credits, states, art] = await Promise.all([
    row.kind === "show"
      ? seasonsByTitle([row.id], userId).then((all) => all.get(row.id) ?? [])
      : [],
    nextItem(row, userId),
    creditsOf(row),
    viewerStates([row.id], userId),
    placeholders(titleArtwork(row)),
  ])
  // ACCESS: Count files of the visible title passed to toTitle.
  const [total] = await db
    .select({ n: count() })
    .from(mediaItem)
    .where(eq(mediaItem.titleId, row.id))
  return {
    ...toSummary(row, art, states),
    originalName: row.originalName,
    tagline: row.tagline,
    releaseDate: row.releaseDate,
    status: row.status,
    path: row.path,
    provider: row.provider,
    providerId: row.providerId,
    externalIds: row.externalIds,
    refreshedAt: row.refreshedAt,
    studios: row.studios,
    credits,
    trailers: row.trailers.map((trailer) => ({
      url: youTubeUrl(trailer.key),
      name: trailer.name,
      language: trailer.language,
    })),
    itemCount: total?.n ?? 0,
    seasons,
    next,
  }
}

/** Turn a provider failure into a message an admin can act on. */
export function providerFailure(name: string, cause: unknown): never {
  if (cause instanceof ProviderError) {
    log.warn(`${name} request failed`, cause)
    const message =
      cause.status === 401 || cause.status === 403
        ? `${name} rejected the API key. Check the server's configuration.`
        : cause.status === 404
          ? `${name} has no entry with that id.`
          : `${name} didn't answer. Try again in a minute.`
    throw new ORPCError("PROVIDER_FAILED", { status: 424, message })
  }
  throw cause
}

export async function withLibrary(id: string) {
  const row = await loadRow(id)
  // ACCESS: The library belongs to the title loaded by the admin-only loader.
  const [lib] = await db
    .select()
    .from(library)
    .where(eq(library.id, row.libraryId))
  if (!lib) throw notFound("This title isn't in any library.")
  return { row, lib }
}

function requireSource(lib: typeof library.$inferSelect) {
  const source = sourceFor(lib)
  if (!source) {
    throw badRequest("Pick a metadata provider for this library first.")
  }
  if (!source.configured()) {
    throw badRequest(`${source.name} isn't set up. ${source.setup ?? ""}`)
  }
  return source
}

export const titles = {
  list: authed.titles.list.handler(async ({ context, input }) => {
    if (!(await libraryFor(context.user, input.libraryId))) {
      throw notFound("Library not found.")
    }
    const limits = await ratingLimits(input.filters)
    const where = titleWhere(context.user, input, limits, input.libraryId)
    // ACCESS: Both queries use titleWhere, which applies the viewer's visibleTitles filter.
    const [rows, [total]] = await Promise.all([
      db
        .select()
        .from(title)
        .where(where)
        .orderBy(...titleOrder(input.sort, input.order))
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(title).where(where),
    ])
    return {
      items: await toSummaries(rows, context.user.id),
      total: total?.n ?? 0,
    }
  }),

  browse: authed.titles.browse.handler(async ({ context, input }) => {
    const limits = await ratingLimits(input.filters)
    // ACCESS: Both queries use titleWhere, which applies the viewer's visibleTitles filter.
    const [rows, kinds] = await Promise.all([
      db
        .select()
        .from(title)
        .where(titleWhere(context.user, input, limits))
        .orderBy(...titleOrder(input.sort, input.order))
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ kind: title.kind, n: count() })
        .from(title)
        .where(titleWhere(context.user, { ...input, kind: undefined }, limits))
        .groupBy(title.kind),
    ])
    const byKind = new Map(kinds.map((row) => [row.kind, row.n]))
    const counts = {
      movie: byKind.get("movie") ?? 0,
      show: byKind.get("show") ?? 0,
    }
    return {
      items: await toSummaries(rows, context.user.id),
      total: input.kind ? counts[input.kind] : counts.movie + counts.show,
      kinds: counts,
    }
  }),

  filterOptions: authed.titles.filterOptions.handler(
    async ({ context, input }) => {
      if (
        input.libraryId &&
        !(await libraryFor(context.user, input.libraryId))
      ) {
        throw notFound("Library not found.")
      }
      return filterOptions(context.user, input)
    },
  ),

  facets: authed.titles.facets.handler(async ({ context, input }) => {
    const where = titleWhere(
      context.user,
      { kind: input.kind },
      new Map(),
      input.libraryId,
    )
    const [genres, studios] = await Promise.all([
      tagCounts(context.user, title.genres, { where }),
      tagCounts(context.user, title.studios, { where }),
    ])
    return { genres, studios }
  }),

  get: authed.titles.get.handler(async ({ context, input }) => {
    const row = await titleFor(context.user, input.id)
    if (!row) throw notFound("This title isn't in any library.")
    return toTitle(row, context.user.id)
  }),

  items: authed.titles.items.handler(async ({ context, input }) => {
    const row = await titleFor(context.user, input.id)
    if (!row) throw notFound("This title isn't in any library.")
    // ACCESS: Files are keyed by the visible title above.
    const rows = await db
      .select()
      .from(mediaItem)
      .where(and(eq(mediaItem.titleId, row.id), inSeason(input.season)))
      .orderBy(...episodeOrder)
    return publicItems(rows, context.user.id)
  }),

  findMatches: admin.titles.findMatches.handler(async ({ input }) => {
    const { row, lib } = await withLibrary(input.id)
    const source = requireSource(lib)
    const candidates = await source
      .search({
        kind: row.kind,
        language: lib.metadataLanguage,
        name: input.query,
        year: input.year ?? null,
      })
      .catch((cause: unknown) => providerFailure(source.name, cause))
    const shown = candidates.slice(0, 20)
    const posters = await saveArtwork(shown.map((c) => c.poster))
    // Posters already in the cache have a placeholder.
    const art = await placeholders(posters.values())
    return shown.map((candidate) => ({
      provider: source.id,
      id: candidate.id,
      name: candidate.name,
      year: candidate.year,
      overview: candidate.overview,
      poster: toArtwork(
        candidate.poster ? (posters.get(candidate.poster) ?? null) : null,
        art,
      ),
    }))
  }),

  identify: admin.titles.identify.handler(async ({ context, input }) => {
    const { row, lib } = await withLibrary(input.id)
    const source = requireSource(lib)
    await refreshTitleNow(row, lib, { providerId: input.providerId }).catch(
      (cause: unknown) => providerFailure(source.name, cause),
    )
    return toTitle(await loadRow(input.id), context.user.id)
  }),

  refresh: admin.titles.refresh.handler(async ({ context, input }) => {
    const { row, lib } = await withLibrary(input.id)
    const source = requireSource(lib)
    await refreshTitleNow(row, lib).catch((cause: unknown) =>
      providerFailure(source.name, cause),
    )
    return toTitle(await loadRow(input.id), context.user.id)
  }),
}

export const metadata = {
  providers: authed.metadata.providers.handler(() => providerList()),
}
