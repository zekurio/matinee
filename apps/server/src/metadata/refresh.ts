import type { MetadataProviderId } from "@matinee/contracts"
import {
  episode,
  type ExternalIds,
  library,
  type LibraryRow,
  season,
  title,
  type TitleRow,
} from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { localName } from "../library/titles"
import { log } from "../log"
import { saveArtwork } from "../media/artwork"
import { limiter } from "../media/process"
import { sortName } from "../media/title"
import { bestMatch } from "./match"
import { sources } from "./sources"
import {
  type Lookup,
  type MetadataSource,
  ProviderError,
  type TitleDetails,
} from "./types"

const DAY = 24 * 60 * 60 * 1000
// Matched titles are fetched again after this, for new art and episodes.
const STALE_AFTER_MS = 30 * DAY
// Unmatched titles are searched again after this.
const RETRY_UNMATCHED_MS = DAY
// Consecutive failures that end a library refresh: the provider is down.
const MAX_FAILURES_IN_A_ROW = 5
const BATCH_SIZE = 500

/** The library's provider, if it has one the server can use. */
export function sourceFor(lib: LibraryRow): MetadataSource | null {
  if (lib.kind === "other" || !lib.metadataProvider) return null
  return sources[lib.metadataProvider]
}

function lookupFor(row: TitleRow, lib: LibraryRow): Lookup {
  return {
    kind: row.kind === "movie" ? "movie" : "show",
    language: lib.metadataLanguage,
  }
}

export function needsRefresh(
  row: TitleRow,
  lib: LibraryRow,
  now = Date.now(),
): boolean {
  if (row.kind === "folder") return false
  const source = sourceFor(lib)
  // Provider removed: put the folder names back.
  if (!source) return row.provider !== null
  // Without its API key, leave whatever the titles have alone.
  if (!source.configured()) return false
  if (row.provider !== source.id || !row.refreshedAt) return true
  const age = now - row.refreshedAt.getTime()
  if (!row.providerId) return age > RETRY_UNMATCHED_MS
  // New files, such as new episodes, may need names the last fetch lacked.
  return row.addedAt > row.refreshedAt || age > STALE_AFTER_MS
}

/** Back to what the scanner read from the path, with no provider data. */
async function reset(
  row: TitleRow,
  provider: MetadataProviderId | null,
): Promise<void> {
  const local = localName(row.path, row.kind)
  await db.transaction(async (tx) => {
    await tx
      .update(title)
      .set({
        name: local.name,
        sortName: sortName(local.name),
        originalName: null,
        year: local.year,
        overview: null,
        tagline: null,
        genres: [],
        rating: null,
        contentRating: null,
        releaseDate: null,
        status: null,
        runtimeMinutes: null,
        posterId: null,
        backdropId: null,
        logoId: null,
        provider,
        providerId: null,
        externalIds: local.ids,
        refreshedAt: new Date(),
      })
      .where(eq(title.id, row.id))
    await tx.delete(season).where(eq(season.titleId, row.id))
    await tx.delete(episode).where(eq(episode.titleId, row.id))
  })
}

async function save(
  row: TitleRow,
  provider: MetadataProviderId,
  details: TitleDetails,
  folderIds: ExternalIds,
): Promise<void> {
  const local = localName(row.path, row.kind)
  const name = details.name.trim() || local.name
  await db.transaction(async (tx) => {
    const art = await saveArtwork(
      [
        details.images.poster,
        details.images.backdrop,
        details.images.logo,
        ...details.seasons.map((s) => s.poster),
        ...details.episodes.map((e) => e.still),
      ],
      tx,
    )
    const id = (url: string | null) => (url ? (art.get(url) ?? null) : null)
    await tx
      .update(title)
      .set({
        name,
        sortName: sortName(name),
        originalName:
          details.originalName && details.originalName !== name
            ? details.originalName
            : null,
        year: details.year ?? local.year,
        overview: details.overview,
        tagline: details.tagline,
        genres: details.genres,
        rating: details.rating,
        contentRating: details.contentRating,
        releaseDate: details.releaseDate,
        status: details.status,
        runtimeMinutes: details.runtimeMinutes,
        posterId: id(details.images.poster),
        backdropId: id(details.images.backdrop),
        logoId: id(details.images.logo),
        provider,
        providerId: details.id,
        externalIds: { ...folderIds, ...details.externalIds },
        refreshedAt: new Date(),
      })
      .where(eq(title.id, row.id))

    await tx.delete(season).where(eq(season.titleId, row.id))
    const seasons = details.seasons.map((s) => ({
      titleId: row.id,
      number: s.number,
      name: s.name,
      overview: s.overview,
      posterId: id(s.poster),
    }))
    for (let i = 0; i < seasons.length; i += BATCH_SIZE) {
      await tx
        .insert(season)
        .values(seasons.slice(i, i + BATCH_SIZE))
        .onConflictDoNothing()
    }

    await tx.delete(episode).where(eq(episode.titleId, row.id))
    const episodes = details.episodes.map((e) => ({
      titleId: row.id,
      seasonNumber: e.season,
      episodeNumber: e.episode,
      name: e.name,
      overview: e.overview,
      airDate: e.airDate,
      runtimeMinutes: e.runtimeMinutes,
      stillId: id(e.still),
    }))
    for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
      await tx
        .insert(episode)
        .values(episodes.slice(i, i + BATCH_SIZE))
        // Providers occasionally list an episode twice.
        .onConflictDoNothing()
    }
  })
}

/**
 * Search by the folder's name and year. Sonarr often strips apostrophes
 * ("Returners Magic"), which word-based searches like AniList's miss, so a
 * failed search tries once more with them put back.
 */
async function searchFor(
  source: MetadataSource,
  lookup: Lookup,
  local: { name: string; year: number | null },
): Promise<string | null> {
  const names = [local.name]
  const possessive = local.name.replace(/\b(\w{2,}[^\s's])s\b/g, "$1's")
  if (possessive !== local.name) names.push(possessive)
  for (const name of names) {
    const candidates = await source.search({
      ...lookup,
      name,
      year: local.year,
    })
    const match = bestMatch(candidates, local)
    if (match) return match.id
  }
  return null
}

/**
 * Match a title at its library's provider and store what it returns. The
 * id comes from, in order: the caller (a manual match), a `{tvdb-123}` tag
 * in the folder name, the earlier match, ids another provider found, and
 * last a search by the folder's name and year.
 */
export async function refreshTitle(
  row: TitleRow,
  lib: LibraryRow,
  options: { providerId?: string } = {},
): Promise<void> {
  if (row.kind === "folder") return
  const source = sourceFor(lib)
  if (!source) {
    if (row.provider !== null) await reset(row, null)
    return
  }
  const lookup = lookupFor(row, lib)
  const local = localName(row.path, row.kind)
  const known: ExternalIds = { ...row.externalIds, ...local.ids }

  let id: string | null =
    options.providerId ??
    local.ids[source.id] ??
    (row.provider === source.id ? row.providerId : null)
  id ??= await source.lookup(known, lookup)
  id ??= await searchFor(source, lookup, local)
  if (!id) {
    log.info(`No ${source.name} match for ${row.path}`)
    await reset(row, source.id)
    return
  }
  const details = await source.details(id, lookup)
  await save(row, source.id, details, local.ids)
}

const running = new Map<string, Promise<void>>()
const queued = new Set<string>()

export function isRefreshing(libraryId: string): boolean {
  return running.has(libraryId)
}

async function runRefresh(libraryId: string, force: boolean): Promise<void> {
  const [lib] = await db.select().from(library).where(eq(library.id, libraryId))
  if (!lib || lib.kind === "other") return
  const rows = await db.select().from(title).where(eq(title.libraryId, lib.id))
  const now = Date.now()
  const due = rows.filter(
    (row) => row.kind !== "folder" && (force || needsRefresh(row, lib, now)),
  )
  if (due.length === 0) return
  const source = sourceFor(lib)
  const started = Date.now()
  log.info(
    `Fetching ${source?.name ?? "no"} metadata for ${due.length} titles in ${lib.name}`,
  )

  const withSlot = limiter(4)
  let failuresInARow = 0
  let stopped: string | null = null
  await Promise.all(
    due.map((row) =>
      withSlot(async () => {
        if (stopped) return
        try {
          await refreshTitle(row, lib)
          failuresInARow = 0
        } catch (error) {
          failuresInARow++
          const status = error instanceof ProviderError ? error.status : null
          if (status === 401 || status === 403) {
            stopped = `${source?.name} rejected the API key. ${source?.setup ?? ""}`
          } else if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
            stopped = `${source?.name} keeps failing, stopping for now`
          }
          log.warn(`Couldn't fetch metadata for ${row.path}`, error)
        }
      }),
    ),
  )
  if (stopped) log.error(`Metadata refresh of ${lib.name} stopped: ${stopped}`)
  else {
    log.info(`Fetched metadata for ${lib.name} in ${Date.now() - started} ms`)
  }
}

/**
 * Fetch metadata for the library's titles that need it, or for all of them
 * with `force`. A request during a run queues one more run after it.
 */
export function refreshLibrary(
  libraryId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const existing = running.get(libraryId)
  if (existing) {
    if (options.force && !queued.has(libraryId)) {
      queued.add(libraryId)
      return existing.then(() => {
        queued.delete(libraryId)
        return refreshLibrary(libraryId, options)
      })
    }
    return existing
  }
  const job = runRefresh(libraryId, options.force ?? false)
    .catch((cause: unknown) => {
      log.error(`Metadata refresh of library ${libraryId} failed`, cause)
    })
    .finally(() => running.delete(libraryId))
  running.set(libraryId, job)
  return job
}
