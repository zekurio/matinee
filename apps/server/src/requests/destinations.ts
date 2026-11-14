import type { CatalogRef } from "@matinee/contracts"
import { library, request, requestFollower, user } from "@matinee/db"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"

import { accessOf } from "../access/groups"
import type { Access } from "../access/policy"
import type { Viewer } from "../access/viewer"
import { inLibraries, seesLibrary, visibleLibraries } from "../access/visible"
import { db } from "../db"
import { loadRouting, type Plan, type Routing } from "./fulfilment/connections"
import type { TitleFacts } from "./fulfilment/types"

export type Destination = typeof library.$inferSelect & {
  /** The name of the first connection whose settings land in it. */
  connection: string
  /** Titles no rule picks out go here through the default connection. */
  home: boolean
}

/**
 * The libraries of a kind the viewer can ask into, by name: they can see
 * it, it has a metadata provider, and some connection's settings, anime
 * fields, or override rules send titles of the kind to a folder in it.
 */
export async function destinations(
  viewer: Viewer,
  kind: CatalogRef["kind"],
  routing?: Routing,
): Promise<Destination[]> {
  const [routes, rows] = await Promise.all([
    routing ?? loadRouting(),
    db
      .select()
      .from(library)
      .where(visibleLibraries(viewer))
      .orderBy(asc(library.name), asc(library.id)),
  ])
  const reached = routes.reached(kind)
  const home = routes.defaultLibrary(kind)?.id
  return rows.flatMap((row) => {
    const connection = reached.get(row.id)
    if (
      !connection ||
      !row.metadataProvider ||
      (row.kind === "movies" ? kind !== "movie" : kind !== "show")
    )
      return []
    return [{ ...row, connection, home: row.id === home }]
  })
}

/** A destination, and how a title is sent there, when it can be. */
export type Route<T extends Destination = Destination> = {
  library: T
  plan: Plan | null
}

/**
 * Where a title goes when nobody chose. The library its request already
 * sits in, if the viewer can ask into it. Else where the default
 * connection for its kind sends it, with its anime fields and override
 * rules, and failing that, when the viewer can't see that library, the
 * first they can ask into. Nowhere without a default connection. Every
 * default destination comes from here, so a card, a title's page, and an
 * ask agree. `candidates` is what `destinations` gave for the kind.
 */
export function defaultDestination<T extends Destination>(
  routing: Routing,
  candidates: T[],
  title: {
    facts: TitleFacts
    /** Who asks, for rules on users. */
    user: string | null
    /** Libraries holding a request for the title. */
    requestedIn?: readonly string[]
  },
): Route<T> | undefined {
  const into = (row: T) => ({
    library: row,
    plan: routing.into(row.id, title.facts, title.user),
  })
  const requested = candidates.find((row) =>
    title.requestedIn?.includes(row.id),
  )
  if (requested) return into(requested)
  const plan = routing.resolve(title.facts, title.user)
  if (!plan) return undefined
  const chosen = candidates.find((row) => row.id === plan.library.id)
  if (chosen) return { library: chosen, plan }
  const first = candidates[0]
  return first && into(first)
}

/**
 * The language to read a title's details in before its destination is
 * known: that of the library the default connection sends a title to
 * that no rule picks out. It keys the provider cache, so a card, its
 * page, and its ask read one entry.
 */
export function lookupLanguage(candidates: Destination[]) {
  return (
    candidates.find((row) => row.home)?.metadataLanguage ??
    candidates[0]?.metadataLanguage ??
    "en-US"
  )
}

/**
 * The libraries the viewer can see that hold a request for the title,
 * matched as availability matches one: by the reference or any other id.
 */
export async function requestedIn(
  viewer: Viewer,
  ref: CatalogRef,
  externalIds: Record<string, string>,
): Promise<string[]> {
  const ids = { ...externalIds, [ref.provider]: ref.providerId }
  const rows = await db
    .select({ libraryId: request.libraryId })
    .from(request)
    .where(
      and(
        inLibraries(viewer, request.libraryId),
        eq(request.kind, ref.kind),
        or(
          and(
            eq(request.provider, ref.provider),
            eq(request.providerId, ref.providerId),
          ),
          ...Object.entries(ids).map(
            ([site, id]) =>
              sql`${request.externalIds} @> ${JSON.stringify({ [site]: id })}::jsonb`,
          ),
        ),
      ),
    )
  return rows.map((row) => row.libraryId)
}

/**
 * What each request's followers may open, by request id, for keeping a
 * moved request where all of them can still see it. One moved into a
 * library someone who asked can't see would drop out of their list and
 * never tell them it arrived.
 */
export async function followerAccess(
  requestIds: readonly string[],
): Promise<Map<string, Access[]>> {
  const found = new Map<string, Access[]>()
  if (!requestIds.length) return found
  const rows = await db
    .select({
      requestId: requestFollower.requestId,
      id: user.id,
      role: user.role,
      accessOverride: user.accessOverride,
    })
    .from(requestFollower)
    .innerJoin(user, eq(user.id, requestFollower.userId))
    .where(inArray(requestFollower.requestId, [...requestIds]))
  for (const row of rows)
    found.set(row.requestId, [
      ...(found.get(row.requestId) ?? []),
      await accessOf(row),
    ])
  return found
}

/** Of a request's candidate libraries, those all its followers can see. */
export function seenByAll<T extends { id: string }>(
  candidates: readonly T[],
  followers: readonly Access[] | undefined,
): T[] {
  return candidates.filter((library) =>
    (followers ?? []).every((access) => seesLibrary({ access }, library.id)),
  )
}
