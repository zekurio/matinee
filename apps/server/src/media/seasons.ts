import type { Season } from "@matinee/contracts"
import { mediaItem, season, watchProgress } from "@matinee/db"
import { and, count, eq, inArray, sql } from "drizzle-orm"

import { db } from "../db"
import { placeholders, toArtwork } from "./artwork"

/**
 * Seasons are labelled by number. Provider names disagree with each other
 * (the show's title, "Season 1", the original language) and read badly as
 * a row of chips.
 */
function seasonName(number: number | null): string {
  if (number === null) return "Other files"
  return number === 0 ? "Specials" : `Season ${number}`
}

/**
 * The seasons each title has files in, in order, with how many of them the
 * user finished. Files without a season number come last, as one season.
 */
export async function seasonsByTitle(
  titleIds: string[],
  userId: string,
): Promise<Map<string, Season[]>> {
  const bySeason = new Map<string, Season[]>()
  if (titleIds.length === 0) return bySeason
  const [counts, meta] = await Promise.all([
    db
      .select({
        titleId: mediaItem.titleId,
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
      .where(inArray(mediaItem.titleId, titleIds))
      .groupBy(mediaItem.titleId, mediaItem.seasonNumber)
      .orderBy(sql`${mediaItem.seasonNumber} asc nulls last`),
    db.select().from(season).where(inArray(season.titleId, titleIds)),
  ])
  const info = new Map(meta.map((s) => [`${s.titleId}/${s.number}`, s]))
  const art = await placeholders(meta.map((s) => s.posterId))
  for (const c of counts) {
    if (!c.titleId) continue
    const known =
      c.number === null ? undefined : info.get(`${c.titleId}/${c.number}`)
    const seasons = bySeason.get(c.titleId) ?? []
    seasons.push({
      number: c.number,
      name: seasonName(c.number),
      overview: known?.overview ?? null,
      poster: toArtwork(known?.posterId ?? null, art),
      itemCount: c.n,
      watchedCount: c.watched,
    })
    bySeason.set(c.titleId, seasons)
  }
  return bySeason
}
