import type {
  Favorite,
  Favorites,
  FavoriteSeason,
  MediaItem,
  TitleKind,
  TitleSummary,
} from "@matinee/contracts"
import {
  favorite,
  favoriteItem,
  favoriteSeason,
  mediaItem,
  title,
  user,
  type UserRow,
} from "@matinee/db"
import { and, desc, eq, sql } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import {
  itemFor,
  titleFor,
  visibleItems,
  visibleTitles,
} from "../access/visible"
import { profileUser } from "../auth/session"
import { db } from "../db"
import { publicItems, toSummaries } from "../media/items"
import { seasonsByTitle } from "../media/seasons"
import { recentlyWatched, watchStats } from "../stats/queries"
import { authed, badRequest, notFound } from "./base"

// How many favorites of every kind together a profile shows.
const PROFILE_FAVORITES = 40

async function findUser(username: string): Promise<UserRow> {
  const [row] = await db
    .select()
    .from(user)
    .where(sql`lower(${user.username}) = lower(${username})`)
  if (!row) throw notFound("Nobody on this server has that username.")
  return row
}

/** A favorite with when it was marked, for putting kinds in one order. */
type Marked<T> = { at: Date; value: T }

/**
 * The owner's favorite titles, newest first, as the viewer sees them:
 * movies and shows, or only the kind given.
 */
async function favoriteTitles(
  ownerId: string,
  viewer: Viewer,
  limit: number,
  kind?: TitleKind,
): Promise<Marked<TitleSummary>[]> {
  const rows = await db
    .select({ row: title, at: favorite.createdAt })
    .from(favorite)
    .innerJoin(title, eq(title.id, favorite.titleId))
    .where(
      and(
        visibleTitles(viewer),
        eq(favorite.userId, ownerId),
        kind ? eq(title.kind, kind) : undefined,
      ),
    )
    .orderBy(desc(favorite.createdAt))
    .limit(limit)
  const summaries = await toSummaries(
    rows.map((entry) => entry.row),
    viewer.id,
  )
  return summaries.map((value, i) => ({
    at: rows[i]?.at ?? new Date(0),
    value,
  }))
}

/**
 * The owner's favorite seasons, newest first, as the viewer sees them. A
 * season whose files are all gone drops out.
 */
async function favoriteSeasons(
  ownerId: string,
  viewer: Viewer,
  limit: number,
): Promise<Marked<FavoriteSeason>[]> {
  const rows = await db
    .select({
      row: title,
      number: favoriteSeason.seasonNumber,
      at: favoriteSeason.createdAt,
    })
    .from(favoriteSeason)
    .innerJoin(title, eq(title.id, favoriteSeason.titleId))
    .where(
      and(
        visibleTitles(viewer),
        eq(favoriteSeason.userId, ownerId),
        eq(title.kind, "show"),
      ),
    )
    .orderBy(desc(favoriteSeason.createdAt))
    .limit(limit)
  const shows = [...new Map(rows.map((entry) => [entry.row.id, entry.row]))]
  const [summaries, seasons] = await Promise.all([
    toSummaries(
      shows.map(([, row]) => row),
      viewer.id,
    ),
    seasonsByTitle(
      shows.map(([id]) => id),
      viewer.id,
    ),
  ])
  const byId = new Map(summaries.map((summary) => [summary.id, summary]))
  return rows.flatMap((entry) => {
    const show = byId.get(entry.row.id)
    const season = seasons
      .get(entry.row.id)
      ?.find((candidate) => candidate.number === entry.number)
    if (!show || !season) return []
    return [{ at: entry.at, value: { title: show, season } }]
  })
}

/**
 * The owner's favorite episodes, newest first, as the viewer sees them. A
 * movie is a favorite through its title, so a movie's file stays out.
 */
async function favoriteEpisodes(
  ownerId: string,
  viewer: Viewer,
  limit: number,
): Promise<Marked<MediaItem>[]> {
  const rows = await db
    .select({ row: mediaItem, at: favoriteItem.createdAt })
    .from(favoriteItem)
    .innerJoin(mediaItem, eq(mediaItem.id, favoriteItem.mediaItemId))
    .leftJoin(title, eq(title.id, mediaItem.titleId))
    .where(
      and(
        visibleItems(viewer),
        eq(favoriteItem.userId, ownerId),
        sql`${title.kind} is distinct from 'movie'`,
      ),
    )
    .orderBy(desc(favoriteItem.createdAt))
    .limit(limit)
  const items = await publicItems(
    rows.map((entry) => entry.row),
    viewer.id,
  )
  return items.map((value, i) => ({ at: rows[i]?.at ?? new Date(0), value }))
}

const values = <T>(marked: Marked<T>[]): T[] => marked.map((m) => m.value)

/** The owner's favorites by kind, up to `limit` of each. */
async function favoritesByKind(
  ownerId: string,
  viewer: Viewer,
  limit: number,
): Promise<Favorites> {
  const [shows, seasons, episodes, movies] = await Promise.all([
    favoriteTitles(ownerId, viewer, limit, "show"),
    favoriteSeasons(ownerId, viewer, limit),
    favoriteEpisodes(ownerId, viewer, limit),
    favoriteTitles(ownerId, viewer, limit, "movie"),
  ])
  return {
    shows: values(shows),
    seasons: values(seasons),
    episodes: values(episodes),
    movies: values(movies),
  }
}

/** The owner's latest favorites of every kind together, newest first. */
async function latestFavorites(
  ownerId: string,
  viewer: Viewer,
  limit: number,
): Promise<Favorite[]> {
  const [titles, seasons, episodes] = await Promise.all([
    favoriteTitles(ownerId, viewer, limit),
    favoriteSeasons(ownerId, viewer, limit),
    favoriteEpisodes(ownerId, viewer, limit),
  ])
  const all = [
    ...titles.map(({ at, value }): Marked<Favorite> => ({
      at,
      value: { kind: value.kind, title: value },
    })),
    ...seasons.map(({ at, value }): Marked<Favorite> => ({
      at,
      value: { kind: "showSeason", ...value },
    })),
    ...episodes.map(({ at, value }): Marked<Favorite> => ({
      at,
      value: { kind: "episode", item: value },
    })),
  ]
  return values(
    all.toSorted((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit),
  )
}

export const favorites = {
  set: authed.favorites.set.handler(async ({ context, input }) => {
    const row = await titleFor(context.user, input.titleId)
    if (!row) {
      throw notFound("This title isn't in any library. Reload the page.")
    }
    if (!input.favorite) {
      await db
        .delete(favorite)
        .where(
          and(
            eq(favorite.userId, context.user.id),
            eq(favorite.titleId, input.titleId),
          ),
        )
      return
    }
    await db
      .insert(favorite)
      .values({ userId: context.user.id, titleId: row.id })
      .onConflictDoNothing()
  }),

  setSeason: authed.favorites.setSeason.handler(async ({ context, input }) => {
    const row = await titleFor(context.user, input.titleId)
    if (!row) {
      throw notFound("This title isn't in any library. Reload the page.")
    }
    if (!input.favorite) {
      await db
        .delete(favoriteSeason)
        .where(
          and(
            eq(favoriteSeason.userId, context.user.id),
            eq(favoriteSeason.titleId, row.id),
            eq(favoriteSeason.seasonNumber, input.season),
          ),
        )
      return
    }
    if (row.kind !== "show") throw badRequest("Only a show has seasons.")
    // ACCESS: Files of the visible title found above.
    const [file] = await db
      .select({ id: mediaItem.id })
      .from(mediaItem)
      .where(
        and(
          eq(mediaItem.titleId, row.id),
          eq(mediaItem.seasonNumber, input.season),
        ),
      )
      .limit(1)
    if (!file) {
      throw notFound("This season has no files anymore. Reload the page.")
    }
    await db
      .insert(favoriteSeason)
      .values({
        userId: context.user.id,
        titleId: row.id,
        seasonNumber: input.season,
      })
      .onConflictDoNothing()
  }),

  setItem: authed.favorites.setItem.handler(async ({ context, input }) => {
    const row = await itemFor(context.user, input.itemId)
    if (!row) {
      throw notFound("This file isn't in any library. Reload the page.")
    }
    if (!input.favorite) {
      await db
        .delete(favoriteItem)
        .where(
          and(
            eq(favoriteItem.userId, context.user.id),
            eq(favoriteItem.mediaItemId, input.itemId),
          ),
        )
      return
    }
    await db
      .insert(favoriteItem)
      .values({ userId: context.user.id, mediaItemId: row.id })
      .onConflictDoNothing()
  }),
}

export const profiles = {
  get: authed.profiles.get.handler(async ({ context, input }) => {
    const row = await findUser(input.username)
    const self = row.id === context.user.id
    const showFavorites = self || row.shareFavorites
    const [shownFavorites, recent] = await Promise.all([
      showFavorites
        ? latestFavorites(row.id, context.user, PROFILE_FAVORITES)
        : null,
      self || row.shareStats ? recentlyWatched(row.id, context.user) : null,
    ])
    return {
      user: profileUser(row),
      self,
      sharing: { favorites: row.shareFavorites, stats: row.shareStats },
      favorites: shownFavorites,
      recent,
    }
  }),

  stats: authed.profiles.stats.handler(async ({ context, input }) => {
    const row = await findUser(input.username)
    if (row.id !== context.user.id && !row.shareStats) return null
    return watchStats(input, row.id, context.user)
  }),

  recent: authed.profiles.recent.handler(async ({ context, input }) => {
    const row = await findUser(input.username)
    if (row.id !== context.user.id && !row.shareStats) return null
    return recentlyWatched(row.id, context.user, input.limit)
  }),

  favorites: authed.profiles.favorites.handler(async ({ context, input }) => {
    const row = await findUser(input.username)
    if (row.id !== context.user.id && !row.shareFavorites) return null
    return favoritesByKind(row.id, context.user, input.limit)
  }),
}
