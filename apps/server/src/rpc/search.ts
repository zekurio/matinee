import type { PersonSummary } from "@matinee/contracts"
import { credit, title, user } from "@matinee/db"
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"

import { type Seer, visibleTitles } from "../access/visible"
import { profileUser } from "../auth/session"
import { db } from "../db"
import { placeholders, toArtwork } from "../media/artwork"
import { toSummaries } from "../media/items"
import { authed } from "./base"
import { tagCounts } from "./browse"
import { escapeLike } from "./like"

/**
 * Cast and crew whose name contains `escaped`: those it starts, then those
 * with a word it starts, like a family name, then the rest. Among those,
 * people with more titles first.
 */
async function findPeople(
  viewer: Seer,
  escaped: string,
  limit: number,
): Promise<PersonSummary[]> {
  const titleCount = sql<number>`count(distinct ${credit.titleId})`.mapWith(
    Number,
  )
  const rows = await db
    .select({
      name: credit.name,
      // Ties go to the first kind in order, which matches `CREDIT_KINDS`.
      kind: sql`mode() within group (order by ${credit.kind})`.mapWith(
        credit.kind,
      ),
      // The portrait from the credit billed highest.
      photoId: sql<
        string | null
      >`(array_agg(${credit.photoId} order by ${credit.position}) filter (where ${credit.photoId} is not null))[1]`,
      titleCount,
    })
    .from(credit)
    .innerJoin(title, eq(title.id, credit.titleId))
    .where(and(visibleTitles(viewer), ilike(credit.name, `%${escaped}%`)))
    .groupBy(credit.name)
    .orderBy(
      sql`${credit.name} ilike ${`${escaped}%`} desc`,
      sql`${credit.name} ilike ${`% ${escaped}%`} desc`,
      desc(titleCount),
      asc(credit.name),
    )
    .limit(limit)
  const art = await placeholders(rows.map((row) => row.photoId))
  return rows.map(({ photoId, ...row }) => ({
    ...row,
    photo: toArtwork(photoId, art),
  }))
}

export const search = {
  /**
   * Each kind of result is its own query, run side by side. Everyone on the
   * server can see each other's profiles, so people are fair game.
   */
  query: authed.search.query.handler(async ({ context, input }) => {
    const escaped = escapeLike(input.query)
    const anywhere = `%${escaped}%`
    const start = `${escaped}%`
    const [titles, users, people, genres, studios] = await Promise.all([
      // The path matches too much across every library; a library's own
      // search still looks there.
      db
        .select()
        .from(title)
        .where(
          and(
            visibleTitles(context.user),
            or(
              ilike(title.name, anywhere),
              ilike(title.originalName, anywhere),
            ),
          ),
        )
        .orderBy(
          sql`${title.name} ilike ${start} desc`,
          asc(title.sortName),
          asc(title.year),
        )
        .limit(input.limit),
      db
        .select()
        .from(user)
        .where(
          or(ilike(user.username, anywhere), ilike(user.displayName, anywhere)),
        )
        .orderBy(
          sql`(${user.username} ilike ${start} or coalesce(${user.displayName}, '') ilike ${start}) desc`,
          asc(sql`lower(${user.username})`),
        )
        .limit(input.limit),
      findPeople(context.user, escaped, input.limit),
      tagCounts(context.user, title.genres, {
        match: input.query,
        limit: input.limit,
      }),
      tagCounts(context.user, title.studios, {
        match: input.query,
        limit: input.limit,
      }),
    ])
    return {
      titles: await toSummaries(titles, context.user.id),
      users: users.map(profileUser),
      people,
      genres,
      studios,
    }
  }),
}
