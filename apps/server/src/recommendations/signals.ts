import type { TitleKind } from "@matinee/contracts"
import {
  favorite,
  favoriteSeason,
  favoriteItem,
  playbackSession,
  title,
  mediaItem,
  episode,
  userTitleSignal,
  type TitleRow,
} from "@matinee/db"
import { and, eq, desc } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleTitles } from "../access/visible"
import { lookupProvider } from "../catalog/cache"
import { db } from "../db"
import { ExternalIds } from "../requests/availability"
import { keyOf } from "./features"

/*
 * How much a viewer likes each title they played, from their sessions
 * and favorites. A sitting counts the share of the file it covered, a
 * marked one 0.6, and each fades by half every 90 days. A film tops out
 * at 1, plus half for each rewatch up to two; a show grows with the log
 * of the episodes watched, so a long one doesn't drown the rest. A
 * favorite adds 1, a favorite season or episode 0.3. A film left before
 * 15% for three days, or a show left in its first episode for two weeks,
 * counts against what it's about.
 */

/** A library title's TMDB id: its own, from its external ids, or looked up at TMDB. */
export async function tmdbId(row: TitleRow) {
  if (row.provider === "tmdb") return row.providerId
  const ids = ExternalIds.parse(row.externalIds)
  return (
    ids.tmdb ??
    (await lookupProvider({ provider: "tmdb", kind: row.kind }, "en-US", ids))
      .value
  )
}
/**
 * Replaces the viewer's `user_title_signal` rows and returns them, with
 * the newest session the rebuild saw. Only titles the viewer can still
 * see count.
 */
export async function rebuildSignals(viewer: Viewer) {
  const [latest] = await db
    .select({ at: playbackSession.updatedAt })
    .from(playbackSession)
    .where(eq(playbackSession.userId, viewer.id))
    .orderBy(desc(playbackSession.updatedAt))
    .limit(1)
  const signalsAt = latest?.at ?? null
  const rows = await db
    .select({ session: playbackSession, title, item: mediaItem, episode })
    .from(playbackSession)
    .innerJoin(title, eq(title.id, playbackSession.titleId))
    .leftJoin(mediaItem, eq(mediaItem.id, playbackSession.mediaItemId))
    .leftJoin(
      episode,
      and(
        eq(episode.titleId, title.id),
        eq(episode.seasonNumber, mediaItem.seasonNumber),
        eq(episode.episodeNumber, mediaItem.episodeNumber),
      ),
    )
    .where(and(eq(playbackSession.userId, viewer.id), visibleTitles(viewer)))
  const signals = new Map<
    string,
    {
      userId: string
      kind: TitleKind
      tmdbId: string
      titleId: string
      name: string
      score: number
      watchedSeconds: number
      plays: number
      completions: number
      lastWatchedAt: Date | null
      sum: number
      best: number
      episodes: Set<string>
    }
  >()
  const ids = new Map<string, string | null>()
  async function entry(row: TitleRow) {
    if (!ids.has(row.id)) ids.set(row.id, await tmdbId(row))
    const id = ids.get(row.id)
    if (!id) return null
    const key = keyOf({ kind: row.kind, tmdbId: id })
    let value = signals.get(key)
    if (!value) {
      value = {
        userId: viewer.id,
        kind: row.kind,
        tmdbId: id,
        titleId: row.id,
        name: row.name,
        score: 0,
        watchedSeconds: 0,
        plays: 0,
        completions: 0,
        lastWatchedAt: null,
        sum: 0,
        best: 0,
        episodes: new Set(),
      }
      signals.set(key, value)
    }
    return value
  }
  for (const row of rows) {
    const s = row.session
    const value = await entry(row.title)
    if (!value) continue
    const runtime =
      row.title.kind === "movie"
        ? (row.title.runtimeMinutes ?? 100) * 60
        : (row.item?.durationSeconds ??
          (row.episode?.runtimeMinutes ?? row.title.runtimeMinutes ?? 45) * 60)
    const fraction = s.marked
      ? 0.6
      : Math.min(1, s.watchedSeconds / Math.max(1, runtime))
    const age =
      s.precision === "none"
        ? 365
        : Math.max(0, (Date.now() - s.startedAt.getTime()) / 86400000)
    value.sum += fraction * Math.pow(0.5, age / 90)
    value.best = Math.max(value.best, fraction)
    value.watchedSeconds += s.watchedSeconds
    value.plays++
    value.completions += Number(s.completed)
    if (!value.lastWatchedAt || s.startedAt > value.lastWatchedAt)
      value.lastWatchedAt = s.startedAt
    if (s.watchedSeconds > 0 && s.mediaItemId) value.episodes.add(s.mediaItemId)
  }
  for (const value of signals.values()) {
    const age = value.lastWatchedAt
      ? (Date.now() - value.lastWatchedAt.getTime()) / 86400000
      : 0
    value.score =
      value.kind === "movie"
        ? Math.min(value.sum, 1) +
          0.5 * Math.min(Math.max(0, value.completions - 1), 2)
        : Math.log2(1 + value.sum)
    if (
      value.kind === "movie" &&
      !value.completions &&
      value.best < 0.15 &&
      age > 3
    )
      value.score = -0.5
    if (
      value.kind === "show" &&
      value.episodes.size <= 1 &&
      value.best < 0.5 &&
      age > 14
    )
      value.score = -0.3
  }
  const favorites = await db
    .select({ title })
    .from(favorite)
    .innerJoin(title, eq(title.id, favorite.titleId))
    .where(and(eq(favorite.userId, viewer.id), visibleTitles(viewer)))
  const seasons = await db
    .select({ title })
    .from(favoriteSeason)
    .innerJoin(title, eq(title.id, favoriteSeason.titleId))
    .where(and(eq(favoriteSeason.userId, viewer.id), visibleTitles(viewer)))
  const items = await db
    .select({ title })
    .from(favoriteItem)
    .innerJoin(mediaItem, eq(mediaItem.id, favoriteItem.mediaItemId))
    .innerJoin(title, eq(title.id, mediaItem.titleId))
    .where(and(eq(favoriteItem.userId, viewer.id), visibleTitles(viewer)))
  for (const [list, weight] of [
    [favorites, 1],
    [seasons, 0.3],
    [items, 0.3],
  ] satisfies [typeof favorites, number][])
    for (const row of list) {
      const value = await entry(row.title)
      if (value) value.score += weight
    }
  const values = [...signals.values()].map(
    ({ sum: _sum, best: _best, episodes: _episodes, name: _name, ...value }) =>
      value,
  )
  await db.transaction(async (tx) => {
    await tx
      .delete(userTitleSignal)
      .where(eq(userTitleSignal.userId, viewer.id))
    if (values.length) await tx.insert(userTitleSignal).values(values)
  })
  return { signals: [...signals.values()], signalsAt }
}
