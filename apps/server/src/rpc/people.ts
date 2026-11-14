import {
  CREDIT_KINDS,
  type CreditKind,
  type Person,
  type PersonCredit,
} from "@matinee/contracts"
import { credit, title, type TitleRow } from "@matinee/db"
import { and, asc, eq, isNull, ne, or, sql } from "drizzle-orm"

import { visibleTitles } from "../access/visible"
import { tmdbPerson } from "../catalog/people"
import { db } from "../db"
import { log } from "../log"
import { placeholders, toArtwork } from "../media/artwork"
import { titleArtwork, toSummary, viewerStates } from "../media/items"
import { ProviderError, uniqueNames } from "../metadata/types"
import { authed, notFound } from "./base"
import { catalogFailure } from "./catalog-errors"

/** One title and kind of credit, with every part or job in it. */
type Grouped = { row: TitleRow; kind: CreditKind; roles: string[] }

const NOBODY = "No movie or show in the libraries credits this person."

/** What TMDB says they're known for, as a kind of credit. */
const KNOWN_FOR = new Map<string, CreditKind>([
  ["acting", "actor"],
  ["directing", "director"],
  ["writing", "writer"],
  ["creator", "creator"],
])

/**
 * Their credits by name. With their TMDB id, a TMDB title's credits go by
 * the id instead, so a namesake's aren't theirs.
 */
function credited(name: string, tmdbId: string | undefined) {
  if (!tmdbId) return eq(credit.name, name)
  return or(
    and(eq(title.provider, "tmdb"), eq(credit.personId, tmdbId)),
    and(
      eq(credit.name, name),
      or(
        isNull(title.provider),
        ne(title.provider, "tmdb"),
        isNull(credit.personId),
      ),
    ),
  )
}

/** The kind with the most titles. A tie goes to the kind listed first. */
function mainKind(groups: Grouped[]): CreditKind {
  const tally = new Map<CreditKind, number>()
  for (const group of groups) {
    tally.set(group.kind, (tally.get(group.kind) ?? 0) + 1)
  }
  let best: CreditKind = "actor"
  let most = 0
  for (const kind of CREDIT_KINDS) {
    const n = tally.get(kind) ?? 0
    if (n > most) {
      best = kind
      most = n
    }
  }
  return best
}

export const people = {
  /**
   * Credits are matched on the name as the provider spells it, which is
   * what titles link to.
   */
  get: authed.people.get.handler(
    async ({ context, input }): Promise<Person> => {
      const rows = await db
        .select({
          title,
          kind: credit.kind,
          role: credit.role,
          position: credit.position,
          photoId: credit.photoId,
          personId: credit.personId,
        })
        .from(credit)
        .innerJoin(title, eq(title.id, credit.titleId))
        .where(
          and(visibleTitles(context.user), credited(input.name, input.tmdbId)),
        )
        .orderBy(
          sql`${title.year} desc nulls last`,
          asc(title.sortName),
          asc(credit.position),
        )
      const tmdb = await tmdbPerson(context.user, {
        name: input.name,
        tmdbId: input.tmdbId,
        titles: rows.map((row) => ({
          kind: row.title.kind,
          provider: row.title.provider,
          providerId: row.title.providerId,
          externalIds: row.title.externalIds,
          personId: row.personId,
        })),
      }).catch((cause: unknown) => {
        // The library's credits make a page without TMDB.
        if (rows.length === 0) {
          if (cause instanceof ProviderError && cause.status === 404)
            throw notFound(NOBODY)
          return catalogFailure(cause)
        }
        log.warn("Couldn't read a person from TMDB", cause)
        return null
      })
      if (rows.length === 0 && !tmdb) throw notFound(NOBODY)

      // An actor with two parts in a title has a credit for each.
      const groups = new Map<string, Grouped>()
      for (const row of rows) {
        const key = `${row.title.id}:${row.kind}`
        const group = groups.get(key)
        if (group) {
          if (row.role) group.roles.push(row.role)
        } else {
          groups.set(key, {
            row: row.title,
            kind: row.kind,
            roles: row.role ? [row.role] : [],
          })
        }
      }
      const grouped = [...groups.values()]

      // TMDB's portrait, else the one from the credit billed highest, as
      // search picks it.
      const photoId =
        tmdb?.photoId ??
        rows
          .filter((row) => row.photoId !== null)
          .toSorted((a, b) => a.position - b.position)[0]?.photoId ??
        null
      const [art, states] = await Promise.all([
        placeholders([
          photoId,
          ...grouped.flatMap((group) => titleArtwork(group.row)),
        ]),
        viewerStates(
          grouped.map((group) => group.row.id),
          context.user.id,
        ),
      ])
      const credits = grouped.map((group): PersonCredit => ({
        title: toSummary(group.row, art, states),
        kind: group.kind,
        role:
          group.roles.length > 0
            ? uniqueNames(group.roles).join(
                group.kind === "actor" ? " / " : ", ",
              )
            : null,
      }))
      return {
        name: input.name,
        photo: toArtwork(photoId, art),
        kind:
          grouped.length > 0
            ? mainKind(grouped)
            : (KNOWN_FOR.get(tmdb?.profile.knownFor ?? "") ?? "actor"),
        titleCount: new Set(grouped.map((group) => group.row.id)).size,
        credits,
        profile: tmdb?.profile ?? null,
        catalog: tmdb?.catalog ?? [],
        stale: tmdb?.stale ?? false,
      }
    },
  ),
}
