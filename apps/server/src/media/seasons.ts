import type { Season } from "@matinee/contracts"
import { favoriteSeason, mediaItem, season, watchProgress } from "@matinee/db"
import { and, count, eq, sql } from "drizzle-orm"

import { anyOf, arg, db } from "../db"
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

// Prepared once, for every show on Home and every title page.
// ACCESS: Counts are keyed by the visible titles supplied to seasonsByTitle.
const seasonCounts = db
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
      eq(watchProgress.userId, arg("userId")),
    ),
  )
  .where(anyOf(mediaItem.titleId, arg("ids"), "uuid"))
  .groupBy(mediaItem.titleId, mediaItem.seasonNumber)
  .orderBy(sql`${mediaItem.seasonNumber} asc nulls last`)
  .prepare("season_counts")

const seasonRows = db
  .select()
  .from(season)
  .where(anyOf(season.titleId, arg("ids"), "uuid"))
  .prepare("season_rows")

const likedSeasons = db
  .select({
    titleId: favoriteSeason.titleId,
    number: favoriteSeason.seasonNumber,
  })
  .from(favoriteSeason)
  .where(
    and(
      eq(favoriteSeason.userId, arg("userId")),
      anyOf(favoriteSeason.titleId, arg("ids"), "uuid"),
    ),
  )
  .prepare("liked_seasons")

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
  const [counts, meta, liked] = await Promise.all([
    seasonCounts.execute({ userId, ids: titleIds }),
    seasonRows.execute({ ids: titleIds }),
    likedSeasons.execute({ userId, ids: titleIds }),
  ])
  const info = new Map(meta.map((s) => [`${s.titleId}/${s.number}`, s]))
  const favorites = new Set(liked.map((s) => `${s.titleId}/${s.number}`))
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
      favorite: c.number !== null && favorites.has(`${c.titleId}/${c.number}`),
    })
    bySeason.set(c.titleId, seasons)
  }
  return bySeason
}
