import type { MediaItem, Season, Title } from "@matinee/contracts"
import {
  library,
  mediaItem,
  season,
  title,
  type TitleRow,
  watchProgress,
} from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { saveArtwork } from "../media/artwork"
import {
  episodeOrder,
  inSeason,
  publicItems,
  reverseEpisodeOrder,
  toSummary,
} from "../media/items"
import { refreshTitle, sourceFor } from "../metadata/refresh"
import { providerList } from "../metadata/sources"
import { ProviderError } from "../metadata/types"
import { admin, authed, badRequest, notFound } from "./base"

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function seasonName(number: number | null, name: string | null): string {
  if (number === null) return "Other files"
  // Providers often call every season "Season N"; ours reads the same.
  return name ?? (number === 0 ? "Specials" : `Season ${number}`)
}

async function loadRow(id: string): Promise<TitleRow> {
  const [row] = await db.select().from(title).where(eq(title.id, id))
  if (!row) throw notFound("This title isn't in any library.")
  return row
}

async function seasonsOf(row: TitleRow, userId: string): Promise<Season[]> {
  const [counts, meta] = await Promise.all([
    db
      .select({
        number: mediaItem.seasonNumber,
        n: count(),
        watched:
          sql<number>`count(*) filter (where ${watchProgress.completed})`.mapWith(
            Number,
          ),
      })
      .from(mediaItem)
      .leftJoin(
        watchProgress,
        and(
          eq(watchProgress.mediaItemId, mediaItem.id),
          eq(watchProgress.userId, userId),
        ),
      )
      .where(eq(mediaItem.titleId, row.id))
      .groupBy(mediaItem.seasonNumber)
      .orderBy(sql`${mediaItem.seasonNumber} asc nulls last`),
    db.select().from(season).where(eq(season.titleId, row.id)),
  ])
  const byNumber = new Map(meta.map((s) => [s.number, s]))
  return counts.map((c) => {
    const info = c.number === null ? undefined : byNumber.get(c.number)
    return {
      number: c.number,
      name: seasonName(c.number, info?.name ?? null),
      overview: info?.overview ?? null,
      poster: info?.posterId ?? null,
      itemCount: c.n,
      watchedCount: c.watched,
    }
  })
}

/**
 * What Play should start: the file the user is in the middle of, else the
 * first unwatched one after the last they finished, else the first.
 */
async function nextItem(
  row: TitleRow,
  userId: string,
): Promise<MediaItem | null> {
  const files = await db
    .select()
    .from(mediaItem)
    .where(eq(mediaItem.titleId, row.id))
    .orderBy(...episodeOrder)
  if (files.length === 0) return null
  // The user's progress in the title, latest first.
  const progress = await db
    .select({
      id: watchProgress.mediaItemId,
      completed: watchProgress.completed,
    })
    .from(watchProgress)
    .innerJoin(mediaItem, eq(mediaItem.id, watchProgress.mediaItemId))
    .where(and(eq(watchProgress.userId, userId), eq(mediaItem.titleId, row.id)))
    .orderBy(desc(watchProgress.updatedAt), ...reverseEpisodeOrder)
  const latest = progress[0]
  let pick = files[0]
  if (latest) {
    const index = files.findIndex((file) => file.id === latest.id)
    if (latest.completed) {
      // Files marked watched by hand can sit ahead of the latest one.
      const watched = new Set(
        progress.filter((p) => p.completed).map((p) => p.id),
      )
      pick =
        files.slice(index + 1).find((file) => !watched.has(file.id)) ?? files[0]
    } else {
      pick = files[index] ?? files[0]
    }
  }
  if (!pick) return null
  const [item] = await publicItems([pick], userId)
  return item ?? null
}

async function toTitle(row: TitleRow, userId: string): Promise<Title> {
  const [seasons, next] = await Promise.all([
    row.kind === "show" ? seasonsOf(row, userId) : [],
    nextItem(row, userId),
  ])
  const [total] = await db
    .select({ n: count() })
    .from(mediaItem)
    .where(eq(mediaItem.titleId, row.id))
  return {
    ...toSummary(row),
    originalName: row.originalName,
    tagline: row.tagline,
    genres: row.genres,
    rating: row.rating,
    contentRating: row.contentRating,
    releaseDate: row.releaseDate,
    status: row.status,
    runtimeMinutes: row.runtimeMinutes,
    path: row.path,
    provider: row.provider,
    providerId: row.providerId,
    externalIds: row.externalIds,
    refreshedAt: row.refreshedAt,
    itemCount: total?.n ?? 0,
    seasons,
    next,
  }
}

/** Turn a provider failure into a message an admin can act on. */
function providerFailure(name: string, cause: unknown): never {
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

async function withLibrary(id: string) {
  const row = await loadRow(id)
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
  list: authed.titles.list.handler(async ({ input }) => {
    const pattern = input.query ? `%${escapeLike(input.query)}%` : null
    const where = and(
      eq(title.libraryId, input.libraryId),
      pattern
        ? or(
            ilike(title.name, pattern),
            ilike(title.originalName, pattern),
            ilike(title.path, pattern),
          )
        : undefined,
    )
    const order =
      input.sort === "recent"
        ? [desc(title.addedAt), asc(title.sortName)]
        : input.sort === "year"
          ? [sql`${title.year} desc nulls last`, asc(title.sortName)]
          : [asc(title.sortName), asc(title.year)]
    const [rows, [total]] = await Promise.all([
      db
        .select()
        .from(title)
        .where(where)
        .orderBy(...order)
        .limit(input.limit)
        .offset(input.offset),
      db.select({ n: count() }).from(title).where(where),
    ])
    return { items: rows.map(toSummary), total: total?.n ?? 0 }
  }),

  get: authed.titles.get.handler(async ({ context, input }) =>
    toTitle(await loadRow(input.id), context.user.id),
  ),

  items: authed.titles.items.handler(async ({ context, input }) => {
    const rows = await db
      .select()
      .from(mediaItem)
      .where(and(eq(mediaItem.titleId, input.id), inSeason(input.season)))
      .orderBy(...episodeOrder)
    return publicItems(rows, context.user.id)
  }),

  findMatches: admin.titles.findMatches.handler(async ({ input }) => {
    const { row, lib } = await withLibrary(input.id)
    if (row.kind === "folder") {
      throw badRequest("Folders in an Other videos library don't get metadata.")
    }
    const source = requireSource(lib)
    const candidates = await source
      .search({
        kind: row.kind === "movie" ? "movie" : "show",
        language: lib.metadataLanguage,
        name: input.query,
        year: input.year ?? null,
      })
      .catch((cause: unknown) => providerFailure(source.name, cause))
    const shown = candidates.slice(0, 20)
    const posters = await saveArtwork(shown.map((c) => c.poster))
    return shown.map((candidate) => ({
      provider: source.id,
      id: candidate.id,
      name: candidate.name,
      year: candidate.year,
      overview: candidate.overview,
      poster: candidate.poster ? (posters.get(candidate.poster) ?? null) : null,
    }))
  }),

  identify: admin.titles.identify.handler(async ({ context, input }) => {
    const { row, lib } = await withLibrary(input.id)
    const source = requireSource(lib)
    await refreshTitle(row, lib, { providerId: input.providerId }).catch(
      (cause: unknown) => providerFailure(source.name, cause),
    )
    return toTitle(await loadRow(input.id), context.user.id)
  }),

  refresh: admin.titles.refresh.handler(async ({ context, input }) => {
    const { row, lib } = await withLibrary(input.id)
    const source = requireSource(lib)
    await refreshTitle(row, lib).catch((cause: unknown) =>
      providerFailure(source.name, cause),
    )
    return toTitle(await loadRow(input.id), context.user.id)
  }),
}

export const metadata = {
  providers: authed.metadata.providers.handler(() => providerList()),
}
