import type { MediaItem, TitleSummary } from "@matinee/contracts"
import {
  episode,
  type EpisodeRow,
  mediaItem,
  type MediaItemRow,
  title,
  type TitleRow,
  watchProgress,
  type WatchProgressRow,
} from "@matinee/db"
import { and, asc, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm"

import { db } from "../db"
import { mimeType } from "./mime"

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

export function toSummary(row: TitleRow): TitleSummary {
  return {
    id: row.id,
    libraryId: row.libraryId,
    kind: row.kind,
    name: row.name,
    year: row.year,
    overview: row.overview,
    images: {
      poster: row.posterId,
      backdrop: row.backdropId,
      logo: row.logoId,
    },
  }
}

export function toItem(
  row: MediaItemRow,
  progress: WatchProgressRow | undefined,
  owner: TitleRow | undefined,
  info: EpisodeRow | undefined,
): MediaItem {
  return {
    id: row.id,
    libraryId: row.libraryId,
    fileTitle: row.title,
    title: owner ? toSummary(owner) : null,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    episode: info
      ? {
          name: info.name,
          overview: info.overview,
          airDate: info.airDate,
          runtimeMinutes: info.runtimeMinutes,
          still: info.stillId,
        }
      : null,
    relativePath: row.relativePath,
    container: row.container,
    mimeType: mimeType(row.container),
    sizeBytes: row.sizeBytes,
    modifiedAt: row.modifiedAt,
    durationSeconds: row.durationSeconds,
    probe: row.probe,
    progress: progress
      ? {
          positionSeconds: progress.positionSeconds,
          completed: progress.completed,
          updatedAt: progress.updatedAt,
        }
      : null,
  }
}

function episodeKey(titleId: string, season: number, number: number): string {
  return `${titleId}/${season}/${number}`
}

/**
 * Public items with the user's progress, their titles, and episode details
 * attached, in three queries.
 */
export async function publicItems(
  rows: MediaItemRow[],
  userId: string,
): Promise<MediaItem[]> {
  if (rows.length === 0) return []
  const titleIds = [
    ...new Set(rows.flatMap((row) => (row.titleId ? [row.titleId] : []))),
  ]
  const numbered = rows.filter(
    (row) =>
      row.titleId && row.seasonNumber !== null && row.episodeNumber !== null,
  )
  const [progress, titles, episodes] = await Promise.all([
    db
      .select()
      .from(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, userId),
          inArray(
            watchProgress.mediaItemId,
            rows.map((row) => row.id),
          ),
        ),
      ),
    titleIds.length > 0
      ? db.select().from(title).where(inArray(title.id, titleIds))
      : [],
    numbered.length > 0
      ? db
          .select()
          .from(episode)
          .where(
            sql`(${episode.titleId}, ${episode.seasonNumber}, ${episode.episodeNumber}) in (${sql.join(
              numbered.map(
                (row) =>
                  sql`(${row.titleId}::uuid, ${row.seasonNumber}::int, ${row.episodeNumber}::int)`,
              ),
              sql`, `,
            )})`,
          )
      : [],
  ])
  const byItem = new Map(progress.map((row) => [row.mediaItemId, row]))
  const byTitle = new Map(titles.map((row) => [row.id, row]))
  const byEpisode = new Map(
    episodes.map((row) => [
      episodeKey(row.titleId, row.seasonNumber, row.episodeNumber),
      row,
    ]),
  )
  return rows.map((row) =>
    toItem(
      row,
      byItem.get(row.id),
      row.titleId ? byTitle.get(row.titleId) : undefined,
      row.titleId && row.seasonNumber !== null && row.episodeNumber !== null
        ? byEpisode.get(
            episodeKey(row.titleId, row.seasonNumber, row.episodeNumber),
          )
        : undefined,
    ),
  )
}
