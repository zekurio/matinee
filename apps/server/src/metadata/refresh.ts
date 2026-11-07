import type { MetadataProviderId } from "@matinee/contracts"
import {
  credit,
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
import { defineQueue } from "../jobs/queue"
import { localName } from "../library/titles"
import { log } from "../log"
import { queueArtwork, saveArtwork } from "../media/artwork"
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
// Consecutive failures that stop the waiting fetches: the provider is down.
const MAX_FAILURES_IN_A_ROW = 5
const BATCH_SIZE = 500

/** The library's provider, if it has one the server can use. */
export function sourceFor(lib: LibraryRow): MetadataSource | null {
  if (!lib.metadataProvider) return null
  return sources[lib.metadataProvider]
}

function lookupFor(row: TitleRow, lib: LibraryRow): Lookup {
  return {
    kind: row.kind,
    language: lib.metadataLanguage,
  }
}

export function needsRefresh(
  row: TitleRow,
  lib: LibraryRow,
  now = Date.now(),
): boolean {
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
        originalLanguage: null,
        year: local.year,
        overview: null,
        tagline: null,
        genres: [],
        rating: null,
        contentRating: null,
        releaseDate: null,
        status: null,
        runtimeMinutes: null,
        studios: [],
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
    await tx.delete(credit).where(eq(credit.titleId, row.id))
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
  const downloads = await db.transaction(async (tx) => {
    const art = await saveArtwork(
      [
        details.images.poster,
        details.images.backdrop,
        details.images.logo,
        ...details.seasons.map((s) => s.poster),
        ...details.episodes.map((e) => e.still),
        ...details.credits.map((c) => c.photo),
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
        originalLanguage: details.originalLanguage,
        year: details.year ?? local.year,
        overview: details.overview,
        tagline: details.tagline,
        genres: details.genres,
        rating: details.rating,
        contentRating: details.contentRating,
        releaseDate: details.releaseDate,
        status: details.status,
        runtimeMinutes: details.runtimeMinutes,
        studios: details.studios,
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

    await tx.delete(credit).where(eq(credit.titleId, row.id))
    const credits = details.credits.map((c, position) => ({
      titleId: row.id,
      position,
      kind: c.kind,
      name: c.name,
      role: c.role,
      personId: c.personId,
      photoId: id(c.photo),
    }))
    if (credits.length > 0) await tx.insert(credit).values(credits)
    const covers = [id(details.images.poster), id(details.images.backdrop)]
    return {
      covers,
      rest: [...art.values()].filter((v) => !covers.includes(v)),
    }
  })
  // Every image downloads now, as in Jellyfin, so the placeholders are
  // there before anyone looks. Posters and backdrops go first, since the
  // library and Home show them.
  queueArtwork(downloads.covers, "normal")
  queueArtwork(downloads.rest, "low")
}

/**
 * Search by the folder's name and year. Sonarr often strips apostrophes
 * ("Returners Magic"), which word-based searches can miss, so a failed
 * search tries once more with them put back.
 *
 * TheTVDB's search finds nothing for some long names it lists, such as
 * "The Exiled Heavy Knight Knows How to Game the System", while a prefix
 * of the name finds them. So the last resort drops words from the end,
 * accepting only a result that has the full name as its name or an alias.
 */
async function searchFor(
  source: MetadataSource,
  lookup: Lookup,
  local: { name: string; year: number | null },
): Promise<string | null> {
  const names = [local.name]
  const possessive = local.name.replace(/\b(\w{2,}[^\s's])s\b/g, "$1's")
  if (possessive !== local.name) names.push(possessive)
  const search = (name: string) =>
    source.search({ ...lookup, name, year: local.year })
  for (const name of names) {
    const match = bestMatch(await search(name), local)
    if (match) return match.id
  }
  const words = local.name.split(/\s+/)
  for (let count = words.length - 1; count >= MIN_PREFIX_WORDS; count--) {
    const candidates = await search(words.slice(0, count).join(" "))
    const match = bestMatch(candidates, local, { exact: true })
    if (match) return match.id
  }
  return null
}

/** Shorter prefixes match too many unrelated titles to be worth a search. */
const MIN_PREFIX_WORDS = 3

/**
 * Match a title at its library's provider and store what it returns. The
 * id comes from, in order: the caller (a manual match), a `{tvdb-123}` tag
 * in the folder name, the earlier match, ids another provider found, and
 * last a search by the folder's name and year.
 */
async function refreshTitle(
  row: TitleRow,
  lib: LibraryRow,
  options: { providerId?: string } = {},
): Promise<void> {
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

type RefreshJob = {
  titleId: string
  libraryId: string
  /** The title's folder, for logs. */
  path: string
  /** The library's provider, so a rejected key stops only its fetches. */
  provider: MetadataProviderId | null
  /** Fetch even when the stored metadata is fresh. */
  force: boolean
  /** Match to this id, as a manual match does. */
  providerId?: string
}

/** A provider failure that makes the waiting fetches from it pointless. */
class ProviderStopped extends Error {
  constructor(
    message: string,
    readonly provider: MetadataProviderId | null,
    cause: unknown,
  ) {
    super(message, { cause })
    this.name = "ProviderStopped"
  }
}

const failuresInARow = new Map<MetadataProviderId | null, number>()

async function runRefresh(job: RefreshJob): Promise<void> {
  const [row] = await db.select().from(title).where(eq(title.id, job.titleId))
  if (!row) return
  const [lib] = await db
    .select()
    .from(library)
    .where(eq(library.id, row.libraryId))
  if (!lib) return
  if (!job.force && !job.providerId && !needsRefresh(row, lib)) return
  try {
    await refreshTitle(row, lib, { providerId: job.providerId })
    failuresInARow.set(job.provider, 0)
  } catch (cause) {
    const source = sourceFor(lib)
    const failures = (failuresInARow.get(job.provider) ?? 0) + 1
    failuresInARow.set(job.provider, failures)
    const status = cause instanceof ProviderError ? cause.status : null
    if (status === 401 || status === 403) {
      throw new ProviderStopped(
        `${source?.name} rejected the API key. ${source?.setup ?? ""}`,
        job.provider,
        cause,
      )
    }
    if (failures >= MAX_FAILURES_IN_A_ROW) {
      failuresInARow.set(job.provider, 0)
      throw new ProviderStopped(
        `${source?.name} keeps failing, stopping for now.`,
        job.provider,
        cause,
      )
    }
    throw cause
  }
}

/**
 * Metadata fetches, one job per title. A forced fetch or a manual match
 * during a fetch of the same title runs after it.
 *
 * Admins can't change the four. A title is a few requests, and the TMDB
 * and TheTVDB clients allow 6 and 4 in flight, so more titles at once
 * mostly wait on those limits. Staying under TMDB's leaves room for
 * searches from the identify dialog, which share it.
 */
export const metadataJobs = defineQueue<RefreshJob, void>({
  id: "metadata",
  name: "Metadata",
  description: "Fetch details, artwork, and episodes from TMDB or TheTVDB.",
  concurrency: 4,
  key: (job) => job.titleId,
  label: (job) => job.path,
  group: (job) => job.libraryId,
  merge: (waiting, incoming) => ({
    ...waiting,
    force: waiting.force || incoming.force,
    providerId: incoming.providerId ?? waiting.providerId,
  }),
  joinsRunning: (running, incoming) =>
    incoming.providerId === undefined && (!incoming.force || running.force),
  failure: (job) => `Couldn't fetch metadata for ${job.path}`,
  fatal: (cause) =>
    cause instanceof ProviderStopped
      ? {
          message: `Metadata fetches stopped: ${cause.message}`,
          drop: (job) => job.provider === cause.provider,
        }
      : null,
  summary: ({ completed, failed, ms }) =>
    completed + failed > 1
      ? `Fetched metadata for ${completed} title${completed === 1 ? "" : "s"} in ${ms} ms${failed > 0 ? `, ${failed} failed` : ""}`
      : null,
  run: (job) => runRefresh(job),
})

export function isRefreshing(libraryId: string): boolean {
  return metadataJobs.busy(libraryId)
}

/**
 * Fetch one title's metadata now, ahead of the background fetches, and
 * match it to `providerId` if given. Rejects with the provider's error.
 */
export async function refreshTitleNow(
  row: TitleRow,
  lib: LibraryRow,
  options: { providerId?: string } = {},
): Promise<void> {
  try {
    await metadataJobs.run(
      {
        titleId: row.id,
        libraryId: lib.id,
        path: row.path,
        provider: lib.metadataProvider,
        force: true,
        providerId: options.providerId,
      },
      { priority: "high" },
    )
  } catch (cause) {
    throw cause instanceof ProviderStopped ? cause.cause : cause
  }
}

/**
 * Queue a fetch for the library's titles that need one, or for all of them
 * with `force`, or for every library without `libraryId`. Resolves once
 * those fetches are done.
 */
export async function refreshMetadata(
  options: { libraryId?: string; force?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  const libs = await db
    .select()
    .from(library)
    .where(options.libraryId ? eq(library.id, options.libraryId) : undefined)
  const now = Date.now()
  const jobs: RefreshJob[] = []
  for (const lib of libs) {
    const rows = await db
      .select()
      .from(title)
      .where(eq(title.libraryId, lib.id))
    const due = rows.filter(
      (row) => options.force || needsRefresh(row, lib, now),
    )
    if (due.length === 0) continue
    log.info(
      `Fetching ${sourceFor(lib)?.name ?? "no"} metadata for ${due.length} titles in ${lib.name}`,
    )
    for (const row of due) {
      jobs.push({
        titleId: row.id,
        libraryId: lib.id,
        path: row.path,
        provider: lib.metadataProvider,
        force: options.force ?? false,
      })
    }
  }
  const done = jobs.map((job) => metadataJobs.run(job))
  options.signal?.addEventListener("abort", () => {
    for (const job of jobs) metadataJobs.cancel(job.titleId)
  })
  await Promise.allSettled(done)
}

/** Queue the fetches a library needs and leave them to the queue. */
export function queueRefresh(libraryId: string, force = false): void {
  refreshMetadata({ libraryId, force }).catch((cause: unknown) =>
    log.error(
      `Couldn't queue metadata fetches for library ${libraryId}`,
      cause,
    ),
  )
}
