import type { ShelfAdditions, ShelfEntry } from "@matinee/contracts"
import { mediaItem, type MediaItemRow, title } from "@matinee/db"
import { and, asc, count, desc, eq, max, sql } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { inLibrariesArg, libraryArgs } from "../access/visible"
import { anyOf, arg, db } from "../db"
import { episodeOrder, publicItems, shownFilesArg } from "./items"
import { seasonsByTitle } from "./seasons"

/** A show's newest files, from {@link latestAdditions}. */
type Batch = {
  /** The first of them in episode order. */
  item: MediaItemRow
  count: number
  /** True when they all share a season, or all lack one. */
  oneSeason: boolean
}

// Prepared once each; Home asks for a shelf per library.
const newestTitles = db
  .select({ row: title, n: count(mediaItem.id) })
  .from(title)
  .innerJoin(mediaItem, eq(mediaItem.titleId, title.id))
  .where(
    and(inLibrariesArg(title.libraryId), eq(title.libraryId, arg("libraryId"))),
  )
  .groupBy(title.id)
  .orderBy(desc(title.addedAt), asc(title.sortName))
  .limit(arg("limit"))
  .prepare("shelf_titles")

// Each title's first file, which is what Play starts. Hidden specials go
// after the rest, so they're first only in a show with nothing else.
// ACCESS: First files are keyed by the visible titles selected by newestTitles.
const firstFiles = db
  .selectDistinctOn([mediaItem.titleId])
  .from(mediaItem)
  .where(anyOf(mediaItem.titleId, arg("ids"), "uuid"))
  .orderBy(mediaItem.titleId, sql`not ${shownFilesArg}`, ...episodeOrder)
  .prepare("shelf_first_files")

// ACCESS: Newest dates are keyed by the visible titles selected by newestTitles.
const newestByTitle = db
  .select({
    titleId: mediaItem.titleId,
    at: max(mediaItem.createdAt).as("newest_at"),
  })
  .from(mediaItem)
  .where(anyOf(mediaItem.titleId, arg("ids"), "uuid"))
  .groupBy(mediaItem.titleId)
  .as("newest")
// The window runs before DISTINCT ON, so it sees every file in the batch.
const batchWindow = sql`over (partition by ${mediaItem.titleId})`
// No season sorts as -1, below the specials' 0.
const seasonOrNone = sql`coalesce(${mediaItem.seasonNumber}, -1)`
// ACCESS: Batches join newestByTitle, keyed by the visible titles from newestTitles.
const latestBatches = db
  .selectDistinctOn([mediaItem.titleId], {
    item: mediaItem,
    count: sql<number>`count(*) ${batchWindow}`.mapWith(Number),
    oneSeason: sql<boolean>`min(${seasonOrNone}) ${batchWindow} = max(${seasonOrNone}) ${batchWindow}`,
  })
  .from(mediaItem)
  .innerJoin(newestByTitle, eq(newestByTitle.titleId, mediaItem.titleId))
  .where(sql`${mediaItem.createdAt} > ${newestByTitle.at} - interval '1 day'`)
  .orderBy(mediaItem.titleId, ...episodeOrder)
  .prepare("shelf_latest_batches")

/**
 * Each show's files added within a day of its newest. A day takes in a
 * season downloaded over an evening, and a library's first scan.
 */
async function latestAdditions(titleIds: string[]): Promise<Batch[]> {
  if (titleIds.length === 0) return []
  return latestBatches.execute({ ids: titleIds })
}

/**
 * The newest titles in a library, each with its first file, and for a
 * show the files it got last when those aren't all it has.
 */
export async function shelf(
  libraryId: string,
  limit: number,
  viewer: Viewer,
): Promise<ShelfEntry[]> {
  const userId = viewer.id
  const titles = await newestTitles.execute({
    libraryId,
    limit,
    ...libraryArgs(viewer),
  })
  if (titles.length === 0) return []
  const totals = new Map(titles.map(({ row, n }) => [row.id, n]))
  const [firsts, latest] = await Promise.all([
    firstFiles.execute({
      ids: [...totals.keys()],
      specials: viewer.showSpecials,
    }),
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
    // New specials alone aren't news to someone who hides them.
    if (!viewer.showSpecials && batch.oneSeason && item.seasonNumber === 0)
      return null
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
