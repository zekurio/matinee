import type { MediaItem, TitleSummary } from "@matinee/contracts"
import {
  favorite,
  favoriteItem,
  mediaItem,
  title,
  user,
  type UserRow,
} from "@matinee/db"
import { and, desc, eq, sql } from "drizzle-orm"

import { profileUser } from "../auth/session"
import { db } from "../db"
import { publicItems, toSummaries } from "../media/items"
import { recentlyWatched, watchStats } from "../stats/queries"
import { authed, notFound } from "./base"

// What a profile shows of the owner's favorites.
const PROFILE_FAVORITES = 60

async function findUser(username: string): Promise<UserRow> {
  const [row] = await db
    .select()
    .from(user)
    .where(sql`lower(${user.username}) = lower(${username})`)
  if (!row) throw notFound("Nobody on this server has that username.")
  return row
}

/** The owner's favorite titles, newest first, as the viewer sees them. */
async function favoriteTitles(
  ownerId: string,
  viewerId: string,
  limit: number,
): Promise<TitleSummary[]> {
  const rows = await db
    .select({ row: title })
    .from(favorite)
    .innerJoin(title, eq(title.id, favorite.titleId))
    .where(eq(favorite.userId, ownerId))
    .orderBy(desc(favorite.createdAt))
    .limit(limit)
  return toSummaries(
    rows.map((entry) => entry.row),
    viewerId,
  )
}

/** The owner's favorite files, newest first, as the viewer sees them. */
async function favoriteFiles(
  ownerId: string,
  viewerId: string,
  limit: number,
): Promise<MediaItem[]> {
  const rows = await db
    .select({ row: mediaItem })
    .from(favoriteItem)
    .innerJoin(mediaItem, eq(mediaItem.id, favoriteItem.mediaItemId))
    .where(eq(favoriteItem.userId, ownerId))
    .orderBy(desc(favoriteItem.createdAt))
    .limit(limit)
  return publicItems(
    rows.map((entry) => entry.row),
    viewerId,
  )
}

export const favorites = {
  list: authed.favorites.list.handler(({ context, input }) =>
    favoriteTitles(context.user.id, context.user.id, input.limit),
  ),

  items: authed.favorites.items.handler(({ context, input }) =>
    favoriteFiles(context.user.id, context.user.id, input.limit),
  ),

  set: authed.favorites.set.handler(async ({ context, input }) => {
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
    const [row] = await db
      .select({ id: title.id })
      .from(title)
      .where(eq(title.id, input.titleId))
    if (!row) {
      throw notFound("This title isn't in any library. Reload the page.")
    }
    await db
      .insert(favorite)
      .values({ userId: context.user.id, titleId: row.id })
      .onConflictDoNothing()
  }),

  setItem: authed.favorites.setItem.handler(async ({ context, input }) => {
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
    const [row] = await db
      .select({ id: mediaItem.id })
      .from(mediaItem)
      .where(eq(mediaItem.id, input.itemId))
    if (!row) {
      throw notFound("This file isn't in any library. Reload the page.")
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
    const [shownFavorites, shownItems, recent] = await Promise.all([
      showFavorites
        ? favoriteTitles(row.id, context.user.id, PROFILE_FAVORITES)
        : null,
      showFavorites
        ? favoriteFiles(row.id, context.user.id, PROFILE_FAVORITES)
        : null,
      self || row.shareStats ? recentlyWatched(row.id, context.user.id) : null,
    ])
    return {
      user: profileUser(row),
      self,
      sharing: { favorites: row.shareFavorites, stats: row.shareStats },
      favorites: shownFavorites,
      favoriteItems: shownItems,
      recent,
    }
  }),

  stats: authed.profiles.stats.handler(async ({ context, input }) => {
    const row = await findUser(input.username)
    if (row.id !== context.user.id && !row.shareStats) return null
    return watchStats(input, row.id, context.user.id)
  }),

  recent: authed.profiles.recent.handler(async ({ context, input }) => {
    const row = await findUser(input.username)
    if (row.id !== context.user.id && !row.shareStats) return null
    return recentlyWatched(row.id, context.user.id, input.limit)
  }),
}
