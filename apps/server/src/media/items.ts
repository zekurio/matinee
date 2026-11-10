import type { MediaItem, TitleSummary } from "@matinee/contracts"
import {
  episode,
  type EpisodeRow,
  favorite,
  favoriteItem,
  mediaItem,
  type MediaItemRow,
  title,
  type TitleRow,
  watchProgress,
  type WatchProgressRow,
} from "@matinee/db"
import { and, asc, desc, eq, isNull, type SQL, sql } from "drizzle-orm"

import { anyOf, arg, db } from "../db"
import { placeholders, type Placeholders, toArtwork } from "./artwork"
import { displayProbe } from "./display-probe"
import { mimeType } from "./mime"
import { itemLabel } from "./title"

// How many folders deep a file sits in its library.
const depth = sql`length(${mediaItem.relativePath}) - length(replace(${mediaItem.relativePath}, '/', ''))`

/**
 * Files in episode order: season, episode, then files directly in the
 * title's folder before those in subfolders (a movie before its extras),
 * then path.
 */
export const episodeOrder = [
  sql`${mediaItem.seasonNumber} asc nulls last`,
  sql`${mediaItem.episodeNumber} asc nulls last`,
  sql`${depth} asc`,
  asc(mediaItem.relativePath),
]

/**
 * `episodeOrder` backwards. Files marked watched together share a time, and
 * this makes the last of them the latest.
 */
export const reverseEpisodeOrder = [
  sql`${mediaItem.seasonNumber} desc nulls first`,
  sql`${mediaItem.episodeNumber} desc nulls first`,
  sql`${depth} desc`,
  desc(mediaItem.relativePath),
]

/**
 * A title's files in one season. Undefined keeps every season; null picks
 * the files without a season number.
 */
export function inSeason(season: number | null | undefined): SQL | undefined {
  if (season === undefined) return undefined
  return season === null
    ? isNull(mediaItem.seasonNumber)
    : eq(mediaItem.seasonNumber, season)
}

/** The artwork ids a title's summary shows. */
export function titleArtwork(row: TitleRow): (string | null)[] {
  return [row.posterId, row.backdropId, row.logoId]
}

/** What a summary shows of the signed-in user's own state. */
type ViewerState = Pick<TitleSummary, "favorite" | "watched">

/** {@link ViewerState} by title id, from {@link viewerStates}. */
export type ViewerStates = ReadonlyMap<string, ViewerState>

const NO_STATE: ViewerState = { favorite: false, watched: false }

// Prepared once: building these from drizzle's pieces on every call cost
// more than running them.
const likedTitles = db
  .select({ id: favorite.titleId })
  .from(favorite)
  .where(
    and(
      eq(favorite.userId, arg("userId")),
      anyOf(favorite.titleId, arg("ids"), "uuid"),
    ),
  )
  .prepare("liked_titles")

const watchedTitles = db
  .select({
    id: mediaItem.titleId,
    watched: sql<boolean>`bool_and(coalesce(${watchProgress.completed}, false))`,
  })
  .from(mediaItem)
  .leftJoin(
    watchProgress,
    and(
      eq(watchProgress.mediaItemId, mediaItem.id),
      eq(watchProgress.userId, arg("userId")),
    ),
  )
  .where(anyOf(mediaItem.titleId, arg("ids"), "uuid"))
  .groupBy(mediaItem.titleId)
  .prepare("watched_titles")

const itemProgress = db
  .select()
  .from(watchProgress)
  .where(
    and(
      eq(watchProgress.userId, arg("userId")),
      anyOf(watchProgress.mediaItemId, arg("ids"), "uuid"),
    ),
  )
  .prepare("item_progress")

const likedItems = db
  .select({ id: favoriteItem.mediaItemId })
  .from(favoriteItem)
  .where(
    and(
      eq(favoriteItem.userId, arg("userId")),
      anyOf(favoriteItem.mediaItemId, arg("ids"), "uuid"),
    ),
  )
  .prepare("liked_items")

const titleRows = db
  .select()
  .from(title)
  .where(anyOf(title.id, arg("ids"), "uuid"))
  .prepare("title_rows")

// Three array parameters, however many episodes.
const episodeRows = db
  .select()
  .from(episode)
  .where(
    sql`(${episode.titleId}, ${episode.seasonNumber}, ${episode.episodeNumber}) in (select * from unnest(${arg("titles")}::uuid[], ${arg("seasons")}::int[], ${arg("numbers")}::int[]))`,
  )
  .prepare("episode_rows")

/**
 * Whether the user marked each title as a favorite and watched every file
 * it has, in two queries.
 */
export async function viewerStates(
  titleIds: Iterable<string>,
  userId: string,
): Promise<ViewerStates> {
  const ids = [...new Set(titleIds)]
  if (ids.length === 0) return new Map()
  const [liked, files] = await Promise.all([
    likedTitles.execute({ userId, ids }),
    watchedTitles.execute({ userId, ids }),
  ])
  const favorites = new Set(liked.map((row) => row.id))
  const watched = new Set(
    files.flatMap((row) => (row.id && row.watched ? [row.id] : [])),
  )
  return new Map(
    ids.map((id) => [
      id,
      { favorite: favorites.has(id), watched: watched.has(id) },
    ]),
  )
}

/**
 * `art` holds the placeholders of the row's {@link titleArtwork}, and
 * `states` the user's state in it.
 */
export function toSummary(
  row: TitleRow,
  art: Placeholders,
  states: ViewerStates,
): TitleSummary {
  return {
    id: row.id,
    libraryId: row.libraryId,
    kind: row.kind,
    name: row.name,
    year: row.year,
    overview: row.overview,
    images: {
      poster: toArtwork(row.posterId, art),
      backdrop: toArtwork(row.backdropId, art),
      logo: toArtwork(row.logoId, art),
    },
    genres: row.genres,
    rating: row.rating,
    contentRating: row.contentRating,
    originalLanguage: row.originalLanguage,
    ...(states.get(row.id) ?? NO_STATE),
  }
}

/**
 * Summaries of the rows as the user sees them, in their order, with one
 * placeholder lookup.
 */
export async function toSummaries(
  rows: TitleRow[],
  userId: string,
): Promise<TitleSummary[]> {
  const [art, states] = await Promise.all([
    placeholders(rows.flatMap(titleArtwork)),
    viewerStates(
      rows.map((row) => row.id),
      userId,
    ),
  ])
  return rows.map((row) => toSummary(row, art, states))
}

/** What {@link toItem} looks a file's details up in. */
type ItemDetails = {
  progress: ReadonlyMap<string, WatchProgressRow>
  favorites: ReadonlySet<string>
  titles: ReadonlyMap<string, TitleRow>
  episodes: ReadonlyMap<string, EpisodeRow>
  art: Placeholders
  states: ViewerStates
}

function toItem(row: MediaItemRow, details: ItemDetails): MediaItem {
  const owner = row.titleId ? details.titles.get(row.titleId) : undefined
  const info =
    row.titleId && row.seasonNumber !== null && row.episodeNumber !== null
      ? details.episodes.get(
          episodeKey(row.titleId, row.seasonNumber, row.episodeNumber),
        )
      : undefined
  const progress = details.progress.get(row.id)
  const item = {
    id: row.id,
    libraryId: row.libraryId,
    fileTitle: row.title,
    title: owner ? toSummary(owner, details.art, details.states) : null,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    episode: info
      ? {
          name: info.name,
          overview: info.overview,
          airDate: info.airDate,
          runtimeMinutes: info.runtimeMinutes,
          still: toArtwork(info.stillId, details.art),
        }
      : null,
    relativePath: row.relativePath,
    container: row.container,
    mimeType: mimeType(row.container),
    sizeBytes: row.sizeBytes,
    modifiedAt: row.modifiedAt,
    durationSeconds: row.durationSeconds,
    probe: row.probe ? displayProbe(row.probe) : null,
    progress: progress
      ? {
          positionSeconds: progress.positionSeconds,
          completed: progress.completed,
          updatedAt: progress.updatedAt,
        }
      : null,
    favorite: details.favorites.has(row.id),
  }
  return { ...item, label: itemLabel(item) }
}

function episodeKey(titleId: string, season: number, number: number): string {
  return `${titleId}/${season}/${number}`
}

/**
 * Public items with the user's progress and favorites, their titles, and
 * episode details attached.
 */
export async function publicItems(
  rows: MediaItemRow[],
  userId: string,
): Promise<MediaItem[]> {
  if (rows.length === 0) return []
  const itemIds = rows.map((row) => row.id)
  const titleIds = [
    ...new Set(rows.flatMap((row) => (row.titleId ? [row.titleId] : []))),
  ]
  const numbered = rows.filter(
    (row) =>
      row.titleId && row.seasonNumber !== null && row.episodeNumber !== null,
  )
  const [progress, liked, titles, episodes, states] = await Promise.all([
    itemProgress.execute({ userId, ids: itemIds }),
    likedItems.execute({ userId, ids: itemIds }),
    titleIds.length > 0 ? titleRows.execute({ ids: titleIds }) : [],
    numbered.length > 0
      ? episodeRows.execute({
          titles: numbered.map((row) => row.titleId),
          seasons: numbered.map((row) => row.seasonNumber),
          numbers: numbered.map((row) => row.episodeNumber),
        })
      : [],
    viewerStates(titleIds, userId),
  ])
  const art = await placeholders([
    ...titles.flatMap(titleArtwork),
    ...episodes.map((row) => row.stillId),
  ])
  const details: ItemDetails = {
    progress: new Map(progress.map((row) => [row.mediaItemId, row])),
    favorites: new Set(liked.map((row) => row.id)),
    titles: new Map(titles.map((row) => [row.id, row])),
    episodes: new Map(
      episodes.map((row) => [
        episodeKey(row.titleId, row.seasonNumber, row.episodeNumber),
        row,
      ]),
    ),
    art,
    states,
  }
  return rows.map((row) => toItem(row, details))
}

const titleFiles = db
  .select()
  .from(mediaItem)
  .where(eq(mediaItem.titleId, arg("titleId")))
  .orderBy(...episodeOrder)
  .prepare("title_files")

// The user's progress in the title, latest first.
const titleProgress = db
  .select({
    id: watchProgress.mediaItemId,
    completed: watchProgress.completed,
  })
  .from(watchProgress)
  .innerJoin(mediaItem, eq(mediaItem.id, watchProgress.mediaItemId))
  .where(
    and(
      eq(watchProgress.userId, arg("userId")),
      eq(mediaItem.titleId, arg("titleId")),
    ),
  )
  .orderBy(desc(watchProgress.updatedAt), ...reverseEpisodeOrder)
  .prepare("title_progress")

/**
 * What Play starts in a title: the file in progress, the one after the
 * last watched, or the first.
 */
export async function nextItem(
  row: TitleRow,
  userId: string,
): Promise<MediaItem | null> {
  const files = await titleFiles.execute({ titleId: row.id })
  if (files.length === 0) return null
  const progress = await titleProgress.execute({ userId, titleId: row.id })
  const latest = progress[0]
  let pick = files[0]
  if (latest) {
    const index = files.findIndex((file) => file.id === latest.id)
    if (latest.completed) {
      // Files marked watched by hand can sit ahead of the latest one, and
      // unwatched ones behind it.
      const watched = new Set(
        progress.filter((p) => p.completed).map((p) => p.id),
      )
      const unwatched = (file: { id: string }) => !watched.has(file.id)
      pick =
        files.slice(index + 1).find(unwatched) ??
        files.find(unwatched) ??
        files[0]
    } else {
      pick = files[index] ?? files[0]
    }
  }
  if (!pick) return null
  const [item] = await publicItems([pick], userId)
  return item ?? null
}
