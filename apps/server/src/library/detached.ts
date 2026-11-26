import {
  detachedWatchState,
  favoriteItem,
  mediaItem,
  playbackSession,
  title,
  watchProgress,
} from "@matinee/db"
import { lt, type SQL, sql } from "drizzle-orm"

import type { Tx } from "../auth/users"
import { db } from "../db"

/*
 * Watch state that outlives its file, as Jellyfin keeps it. Progress,
 * favorites, and plays belong to a file's row, so deleting the row would
 * take them along, and an upgraded release is a new file with a new row.
 * Before a file goes, what users had on it is parked under the keys of
 * what it was (see `detachedWatchState`), and a file that comes with one
 * of those keys, in the same scan or months later, takes it back.
 */

/** How long parked state waits for its file to come back. */
export const DETACHED_DAYS = 90

/**
 * An episode's numbers, as a key's suffix: empty for a movie, null for an
 * episode without numbers, which no other file could be told apart by.
 */
const suffix = sql`(case when ${title.kind} = 'show' then '/' || ${mediaItem.seasonNumber} || 'x' || ${mediaItem.episodeNumber} else '' end)`

/**
 * A file's keys, from its title's match and the ids it has at other
 * sites, in a query that joins `media_item` with its `title`.
 */
const keys = sql`(
  select coalesce(array_agg(distinct ids.site || ':' || ids.id || ${suffix}), '{}'::text[])
  from (
    select ${title.provider} as site, ${title.providerId} as id
    where ${title.provider} is not null and ${title.providerId} is not null
    union all
    select site.key, site.value from jsonb_each_text(${title.externalIds}) as site
  ) as ids
  where ${suffix} is not null
)`

/**
 * Park what users had on the files `items` selects, a condition on
 * `media_item` and its `title`. Call it in the transaction that deletes
 * them, before the delete.
 */
export async function detachWatchState(tx: Tx, items: SQL): Promise<void> {
  await tx.execute(sql`
    insert into ${detachedWatchState}
      (user_id, keys, position_seconds, completed, progress_at, favorite, session_ids)
    select
      users.user_id,
      gone.keys,
      progress.position_seconds,
      coalesce(progress.completed, false),
      progress.updated_at,
      liked.user_id is not null,
      coalesce(plays.ids, '{}'::uuid[])
    from (
      select ${mediaItem.id} as id, ${keys} as keys
      from ${mediaItem} join ${title} on ${title.id} = ${mediaItem.titleId}
      where ${items}
    ) as gone
    cross join lateral (
      select user_id from ${watchProgress} where media_item_id = gone.id
      union
      select user_id from ${favoriteItem} where media_item_id = gone.id
      union
      select user_id from ${playbackSession} where media_item_id = gone.id
    ) as users
    left join ${watchProgress} as progress
      on progress.media_item_id = gone.id and progress.user_id = users.user_id
    left join ${favoriteItem} as liked
      on liked.media_item_id = gone.id and liked.user_id = users.user_id
    left join lateral (
      select array_agg(s.id) as ids from ${playbackSession} as s
      where s.media_item_id = gone.id and s.user_id = users.user_id
    ) as plays on true
    where cardinality(gone.keys) > 0
  `)
}

/**
 * Give the files `scope` selects, a condition on `media_item` and its
 * `title`, the parked state that shares a key with them. Each parked row
 * goes to one file, the newest, so other versions of a movie don't turn
 * watched. Where the user has progress on that file too, the later one
 * stays. Returns how many parked rows found their file.
 */
export async function reattachWatchState(scope: SQL): Promise<number> {
  const [parked] = await db
    .select({ id: detachedWatchState.id })
    .from(detachedWatchState)
    .limit(1)
  if (!parked) return 0
  const claimed = await db.execute(sql`
    with live as (
      select ${mediaItem.id} as id, ${mediaItem.titleId} as title_id,
        ${mediaItem.createdAt} as created_at, ${keys} as keys
      from ${mediaItem} join ${title} on ${title.id} = ${mediaItem.titleId}
      where ${scope}
    ),
    claims as (
      select distinct on (d.id)
        d.id, d.user_id, live.id as item_id, live.title_id,
        d.position_seconds, d.completed, d.progress_at, d.favorite, d.session_ids
      from ${detachedWatchState} as d
      join live on d.keys && live.keys
      order by d.id, live.created_at desc
    ),
    progress as (
      insert into ${watchProgress}
        (user_id, media_item_id, position_seconds, completed, updated_at)
      select distinct on (user_id, item_id)
        user_id, item_id, position_seconds, completed, progress_at
      from claims
      where position_seconds is not null
      order by user_id, item_id, progress_at desc
      on conflict (user_id, media_item_id) do update set
        position_seconds = excluded.position_seconds,
        completed = excluded.completed,
        updated_at = excluded.updated_at
      where ${watchProgress}.updated_at < excluded.updated_at
    ),
    favorites as (
      insert into ${favoriteItem} (user_id, media_item_id)
      select distinct user_id, item_id from claims where favorite
      on conflict (user_id, media_item_id) do nothing
    ),
    plays as (
      update ${playbackSession} as s set
        media_item_id = claims.item_id,
        title_id = coalesce(s.title_id, claims.title_id)
      from claims
      where s.id = any(claims.session_ids) and s.media_item_id is null
    )
    delete from ${detachedWatchState}
    where id in (select id from claims)
    returning id
  `)
  return claimed.rowCount ?? 0
}

/** Drop parked state whose file didn't come back in time. */
export async function forgetDetachedWatchState(): Promise<void> {
  const before = new Date(Date.now() - DETACHED_DAYS * 24 * 60 * 60_000)
  await db
    .delete(detachedWatchState)
    .where(lt(detachedWatchState.detachedAt, before))
}
