import type { FeaturedTitle } from "@matinee/contracts"
import { mediaItem, title, type TitleRow, watchProgress } from "@matinee/db"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  max,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm"

import { anyOf, arg, db } from "../db"
import { releaseSession } from "../media/hls"
import {
  episodeOrder,
  inSeason,
  nextItem,
  publicItems,
  reverseEpisodeOrder,
} from "../media/items"
import { playbackOptions } from "../media/playback-options"
import { markUnwatched, markWatched } from "../media/watched"
import { recordReport } from "../stats/sessions"
import { authed, notFound } from "./base"

// Titles rated at least this, out of 10, can be featured on Home.
const FEATURED_MIN_RATING = 7.5

// Past this share of the runtime, a file counts as watched.
const WATCHED_RATIO = 0.92
// Below this, a start doesn't count, so stray clicks stay out of
// "continue watching". Short clips use a share of their length instead.
const RESUME_MIN_SECONDS = 30

function resumeThreshold(duration: number | null): number {
  return duration
    ? Math.min(RESUME_MIN_SECONDS, duration * 0.1)
    : RESUME_MIN_SECONDS
}

// Files without numbers sort after the numbered ones.
const LAST = 2147483647

/** A file's place in its title: season, episode, then path. */
const position = sql`(coalesce(${mediaItem.seasonNumber}, ${LAST}), coalesce(${mediaItem.episodeNumber}, ${LAST}), ${mediaItem.relativePath})`

export const playback = {
  report: authed.playback.report.handler(async ({ context, input }) => {
    const [item] = await db
      .select()
      .from(mediaItem)
      .where(eq(mediaItem.id, input.itemId))
    if (!item) throw notFound("This title isn't in any library.")

    // The player knows the real runtime; keep it for progress bars.
    const reported = input.durationSeconds
    if (
      reported &&
      (item.durationSeconds === null ||
        Math.abs(item.durationSeconds - reported) > 1)
    ) {
      await db
        .update(mediaItem)
        .set({ durationSeconds: reported })
        .where(eq(mediaItem.id, item.id))
    }
    const duration = reported ?? item.durationSeconds
    const completed =
      duration !== null && input.positionSeconds / duration >= WATCHED_RATIO

    if (input.sessionId && input.closed) releaseSession(input.sessionId)
    if (input.sessionId && input.playedSeconds !== undefined) {
      await recordReport(
        {
          id: input.sessionId,
          userId: context.user.id,
          item,
          userAgent: context.hono.req.header("user-agent"),
        },
        {
          positionSeconds: input.positionSeconds,
          playedSeconds: input.playedSeconds,
          completed,
          paused: input.paused ?? false,
          closed: input.closed ?? false,
        },
      )
    }
    if (!completed && input.positionSeconds < resumeThreshold(duration)) return

    await db
      .insert(watchProgress)
      .values({
        userId: context.user.id,
        mediaItemId: item.id,
        positionSeconds: input.positionSeconds,
        completed,
      })
      .onConflictDoUpdate({
        target: [watchProgress.userId, watchProgress.mediaItemId],
        set: {
          positionSeconds: input.positionSeconds,
          // Rewatching part of a finished file keeps it watched.
          completed: sql`${watchProgress.completed} or excluded.completed`,
          updatedAt: new Date(),
        },
      })
  }),

  options: authed.playback.options.handler(() => playbackOptions()),

  setWatched: authed.playback.setWatched.handler(async ({ context, input }) => {
    const [item] = await db
      .select({ id: mediaItem.id })
      .from(mediaItem)
      .where(eq(mediaItem.id, input.itemId))
    if (!item) throw notFound("This title isn't in any library.")
    const files = eq(mediaItem.id, item.id)
    if (input.watched) {
      await markWatched(context.user.id, files, input.watchedAt)
    } else {
      await markUnwatched(context.user.id, files)
    }
  }),

  setTitleWatched: authed.playback.setTitleWatched.handler(
    async ({ context, input }) => {
      const [row] = await db
        .select({ id: title.id })
        .from(title)
        .where(eq(title.id, input.titleId))
      if (!row) {
        throw notFound("This title isn't in any library. Reload the page.")
      }
      const files = and(eq(mediaItem.titleId, row.id), inSeason(input.season))
      if (input.watched) {
        await markWatched(context.user.id, files, input.watchedAt)
      } else {
        await markUnwatched(context.user.id, files)
      }
    },
  ),
}

// Prepared once; Home asks them on every visit.
const inProgress = db
  .select({ item: mediaItem })
  .from(watchProgress)
  .innerJoin(mediaItem, eq(mediaItem.id, watchProgress.mediaItemId))
  .where(
    and(
      eq(watchProgress.userId, arg("userId")),
      eq(watchProgress.completed, false),
    ),
  )
  .orderBy(desc(watchProgress.updatedAt))
  .limit(arg("limit"))
  .prepare("continue_watching")

// The most recently finished file of each show or folder. Movies have
// nothing after them.
const lastFinished = db
  .selectDistinctOn([mediaItem.titleId], {
    titleId: mediaItem.titleId,
    seasonNumber: mediaItem.seasonNumber,
    episodeNumber: mediaItem.episodeNumber,
    relativePath: mediaItem.relativePath,
    updatedAt: watchProgress.updatedAt,
  })
  .from(watchProgress)
  .innerJoin(mediaItem, eq(mediaItem.id, watchProgress.mediaItemId))
  .innerJoin(title, eq(title.id, mediaItem.titleId))
  .where(
    and(
      eq(watchProgress.userId, arg("userId")),
      eq(watchProgress.completed, true),
      ne(title.kind, "movie"),
    ),
  )
  .orderBy(
    mediaItem.titleId,
    desc(watchProgress.updatedAt),
    ...reverseEpisodeOrder,
  )
  .prepare("last_finished")

// The files after a position in a title. A few extra skip over any the
// user already watched or started.
const filesAfter = db
  .select()
  .from(mediaItem)
  .where(
    and(
      eq(mediaItem.titleId, arg("titleId")),
      sql`${position} > (${arg("season")}::int, ${arg("episode")}::int, ${arg("path")}::text)`,
    ),
  )
  .orderBy(...episodeOrder)
  .limit(10)
  .prepare("files_after")

const startedOf = db
  .select({
    id: watchProgress.mediaItemId,
    completed: watchProgress.completed,
  })
  .from(watchProgress)
  .where(
    and(
      eq(watchProgress.userId, arg("userId")),
      anyOf(watchProgress.mediaItemId, arg("ids"), "uuid"),
    ),
  )
  .prepare("started_of")

export const home = {
  continueWatching: authed.home.continueWatching.handler(
    async ({ context, input }) => {
      const rows = await inProgress.execute({
        userId: context.user.id,
        limit: input.limit,
      })
      return publicItems(
        rows.map((row) => row.item),
        context.user.id,
      )
    },
  ),

  nextUp: authed.home.nextUp.handler(async ({ context, input }) => {
    const finished = await lastFinished.execute({ userId: context.user.id })
    finished.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    const next = []
    for (const row of finished) {
      if (next.length >= input.limit) break
      if (!row.titleId) continue
      const candidates = await filesAfter.execute({
        titleId: row.titleId,
        season: row.seasonNumber ?? LAST,
        episode: row.episodeNumber ?? LAST,
        path: row.relativePath,
      })
      if (candidates.length === 0) continue
      const started = await startedOf.execute({
        userId: context.user.id,
        ids: candidates.map((candidate) => candidate.id),
      })
      const state = new Map(started.map((s) => [s.id, s.completed]))
      for (const candidate of candidates) {
        const completed = state.get(candidate.id)
        if (completed === true) continue
        // An episode in progress already shows under "continue watching".
        if (completed === undefined) next.push(candidate)
        break
      }
    }
    return publicItems(next, context.user.id)
  }),

  featured: authed.home.featured.handler(async ({ context, input }) => {
    const userId = context.user.id
    const files = count(mediaItem.id)
    // When the user last watched each title they started.
    const watched = db
      .select({
        titleId: mediaItem.titleId,
        at: max(watchProgress.updatedAt).as("watched_at"),
      })
      .from(watchProgress)
      .innerJoin(mediaItem, eq(mediaItem.id, watchProgress.mediaItemId))
      .where(eq(watchProgress.userId, userId))
      .groupBy(mediaItem.titleId)
      .as("watched")
    // Titles the user hasn't started, and shows that got a file since they
    // last watched. What they're watching has its own rows on Home.
    const unseen = or(
      isNull(watched.at),
      and(ne(title.kind, "movie"), lt(watched.at, title.addedAt)),
    )
    // Twice the slides, to replace shows whose new file isn't the next one.
    const candidates = (where: SQL | undefined, order: SQL[]) =>
      db
        .select({ row: title, files, watchedAt: watched.at })
        .from(title)
        .innerJoin(mediaItem, eq(mediaItem.titleId, title.id))
        .leftJoin(watched, eq(watched.titleId, title.id))
        .where(and(unseen, where))
        .groupBy(title.id, watched.at)
        .orderBy(...order)
        .limit(input.limit * 2)
    const [newest, rated] = await Promise.all([
      candidates(undefined, [desc(title.addedAt), asc(title.sortName)]),
      // Random, so each visit features different ones. Only titles with
      // art: a frame from the file looks poor at banner size.
      candidates(
        and(
          gte(title.rating, FEATURED_MIN_RATING),
          isNotNull(title.backdropId),
        ),
        [sql`random()`],
      ),
    ])
    // Alternate new and well-rated, each title once.
    const picks: { row: TitleRow; files: number; watchedAt: Date | null }[] = []
    const seen = new Set<string>()
    for (let i = 0; i < Math.max(newest.length, rated.length); i++) {
      for (const pick of [newest[i], rated[i]]) {
        if (!pick || seen.has(pick.row.id)) continue
        seen.add(pick.row.id)
        picks.push(pick)
      }
    }

    const entry = async ({
      row,
      files,
      watchedAt,
    }: (typeof picks)[number]): Promise<FeaturedTitle[]> => {
      const item = await nextItem(row, userId)
      if (!item?.title) return []
      // A show the user watched comes back only for its next episode, once
      // that arrives after they last watched.
      if (
        watchedAt &&
        (item.progress !== null || !(await addedSince(item.id, watchedAt)))
      ) {
        return []
      }
      // The file's title is the row's, summarized already.
      return [{ title: item.title, item, count: files }]
    }
    const featured: FeaturedTitle[] = []
    let rest = picks
    while (featured.length < input.limit && rest.length > 0) {
      const batch = rest.slice(0, input.limit - featured.length)
      rest = rest.slice(batch.length)
      const entries = await Promise.all(batch.map(entry))
      featured.push(...entries.flat())
    }
    return featured
  }),
}

/** The file arrived after `since`. */
async function addedSince(itemId: string, since: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: mediaItem.id })
    .from(mediaItem)
    .where(and(eq(mediaItem.id, itemId), gt(mediaItem.createdAt, since)))
  return row !== undefined
}
