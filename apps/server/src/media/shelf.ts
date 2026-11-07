import type { ShelfAdditions, ShelfEntry } from "@matinee/contracts"
import { mediaItem, type MediaItemRow, title } from "@matinee/db"
import { asc, count, desc, eq, inArray, max, sql } from "drizzle-orm"

import { db } from "../db"
import { episodeOrder, publicItems } from "./items"
import { seasonsByTitle } from "./seasons"

/** A show's newest files, from {@link latestAdditions}. */
type Batch = {
  /** The first of them in episode order. */
  item: MediaItemRow
  count: number
  /** True when they all share a season, or all lack one. */
  oneSeason: boolean
}

/**
 * Each show's files added within a day of its newest. A day takes in a
 * season downloaded over an evening, and a library's first scan.
 */
async function latestAdditions(titleIds: string[]): Promise<Batch[]> {
  if (titleIds.length === 0) return []
  const newest = db
    .select({
      titleId: mediaItem.titleId,
      at: max(mediaItem.createdAt).as("newest_at"),
    })
    .from(mediaItem)
    .where(inArray(mediaItem.titleId, titleIds))
    .groupBy(mediaItem.titleId)
    .as("newest")
  // The window runs before DISTINCT ON, so it sees every file in the batch.
  const batch = sql`over (partition by ${mediaItem.titleId})`
  // No season sorts as -1, below the specials' 0.
  const season = sql`coalesce(${mediaItem.seasonNumber}, -1)`
  return db
    .selectDistinctOn([mediaItem.titleId], {
      item: mediaItem,
      count: sql<number>`count(*) ${batch}`.mapWith(Number),
      oneSeason: sql<boolean>`min(${season}) ${batch} = max(${season}) ${batch}`,
    })
    .from(mediaItem)
    .innerJoin(newest, eq(newest.titleId, mediaItem.titleId))
    .where(sql`${mediaItem.createdAt} > ${newest.at} - interval '1 day'`)
    .orderBy(mediaItem.titleId, ...episodeOrder)
}

/**
 * The newest titles in a library, each with its first file, and for a
 * show the files it got last when those aren't all it has.
 */
export async function shelf(
  libraryId: string,
  limit: number,
  userId: string,
): Promise<ShelfEntry[]> {
  const titles = await db
    .select({ row: title, n: count(mediaItem.id) })
    .from(title)
    .innerJoin(mediaItem, eq(mediaItem.titleId, title.id))
    .where(eq(title.libraryId, libraryId))
    .groupBy(title.id)
    .orderBy(desc(title.addedAt), asc(title.sortName))
    .limit(limit)
  if (titles.length === 0) return []
  const totals = new Map(titles.map(({ row, n }) => [row.id, n]))
  const [firsts, latest] = await Promise.all([
    // Each title's first file, which is what Play starts.
    db
      .selectDistinctOn([mediaItem.titleId])
      .from(mediaItem)
      .where(inArray(mediaItem.titleId, [...totals.keys()]))
      .orderBy(mediaItem.titleId, ...episodeOrder),
    latestAdditions(
      titles.flatMap(({ row }) => (row.kind === "show" ? [row.id] : [])),
    ),
  ])
  // A show whose files all came at once is new as a whole.
  const batches = new Map<string, Batch>()
  for (const batch of latest) {
    const id = batch.item.titleId
    if (id && batch.count < (totals.get(id) ?? 0)) batches.set(id, batch)
  }
  const [items, seasons] = await Promise.all([
    publicItems(
      [...firsts, ...[...batches.values()].map((batch) => batch.item)],
      userId,
    ),
    seasonsByTitle(
      [...batches].flatMap(([id, batch]) => (batch.oneSeason ? [id] : [])),
      userId,
    ),
  ])
  const byId = new Map(items.map((item) => [item.id, item]))
  const firstOf = new Map(firsts.map((row) => [row.titleId, row.id]))

  const additions = (id: string): ShelfAdditions | null => {
    const batch = batches.get(id)
    const item = batch && byId.get(batch.item.id)
    if (!batch || !item) return null
    const all = seasons.get(id) ?? []
    // A show's only season is the show, whose page lists the episodes.
    const season =
      batch.oneSeason && all.length > 1
        ? (all.find((s) => s.number === item.seasonNumber) ?? null)
        : null
    return { count: batch.count, item, season }
  }

  return titles.flatMap(({ row, n }) => {
    const first = firstOf.get(row.id)
    const item = first ? byId.get(first) : undefined
    // The file's title is the row's, summarized already.
    if (!item?.title) return []
    return [
      {
        title: item.title,
        item,
        count: n,
        addedAt: row.addedAt,
        added: additions(row.id),
      },
    ]
  })
}
