import {
  CREDIT_KINDS,
  type CreditKind,
  type Person,
  type PersonCredit,
} from "@matinee/contracts"
import { credit, title, type TitleRow } from "@matinee/db"
import { asc, eq, sql } from "drizzle-orm"

import { db } from "../db"
import { placeholders, toArtwork } from "../media/artwork"
import { titleArtwork, toSummary, viewerStates } from "../media/items"
import { uniqueNames } from "../metadata/types"
import { authed, notFound } from "./base"

/** One title and kind of credit, with every part or job in it. */
type Grouped = { row: TitleRow; kind: CreditKind; roles: string[] }

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
        })
        .from(credit)
        .innerJoin(title, eq(title.id, credit.titleId))
        .where(eq(credit.name, input.name))
        .orderBy(
          sql`${title.year} desc nulls last`,
          asc(title.sortName),
          asc(credit.position),
        )
      if (rows.length === 0) {
        throw notFound("No movie or show in the libraries credits this person.")
      }

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

      // The portrait from the credit billed highest, as search picks it.
      const photoId =
        rows
          .filter((row) => row.photoId !== null)
          .toSorted((a, b) => a.position - b.position)[0]?.photoId ?? null
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
        kind: mainKind(grouped),
        titleCount: new Set(grouped.map((group) => group.row.id)).size,
        credits,
      }
    },
  ),
}
