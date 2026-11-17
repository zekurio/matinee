import { artwork, credit, episode, season, title } from "@matinee/db"
import { and, eq, exists, or, type SQL, sql } from "drizzle-orm"

import { db } from "../db"
import { type Seer, visibleTitles } from "./visible"

/*
 * Whether a viewer may load an image. An artwork id is the hash of the
 * provider's URL, which anyone can work out from the provider's own API,
 * so serving every id to everyone signed in would tell a viewer which
 * titles, episodes, and people the libraries they can't open hold. An
 * image is served when the catalog showed it, which anyone may browse,
 * or when a title the viewer sees uses it: as its poster, backdrop, or
 * logo, or through one of its seasons, episodes, or credits. The columns
 * each have an index for this.
 */

/** Whether `viewer` may load the artwork `id`. False for an id that doesn't exist. */
export async function seesArtwork(viewer: Seer, id: string): Promise<boolean> {
  const [row] = await db
    .select({ catalog: artwork.catalog })
    .from(artwork)
    .where(eq(artwork.id, id))
    .limit(1)
  if (!row) return false
  // Someone who opens every library sees every row that uses it.
  if (row.catalog || viewer.access.libraries === null) return true
  const [used] = await db
    .select({ used: sql<boolean>`${usedBySeen(viewer, id)}` })
    .from(artwork)
    .where(eq(artwork.id, id))
  return used?.used ?? false
}

function usedBySeen(viewer: Seer, id: string): SQL {
  const seen = visibleTitles(viewer)
  const titles = db
    .select({ id: title.id })
    .from(title)
    .where(
      and(
        or(
          eq(title.posterId, id),
          eq(title.backdropId, id),
          eq(title.logoId, id),
        ),
        seen,
      ),
    )
  const seasons = db
    .select({ id: title.id })
    .from(season)
    .innerJoin(title, eq(title.id, season.titleId))
    .where(and(eq(season.posterId, id), seen))
  const episodes = db
    .select({ id: title.id })
    .from(episode)
    .innerJoin(title, eq(title.id, episode.titleId))
    .where(and(eq(episode.stillId, id), seen))
  const credits = db
    .select({ id: title.id })
    .from(credit)
    .innerJoin(title, eq(title.id, credit.titleId))
    .where(and(eq(credit.photoId, id), seen))
  return sql`(${exists(titles)} or ${exists(seasons)} or ${exists(episodes)} or ${exists(credits)})`
}
