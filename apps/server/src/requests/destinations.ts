import type { CatalogRef } from "@matinee/contracts"
import { library, request, requestFollower, user } from "@matinee/db"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"

import { accessOf } from "../access/groups"
import type { Access } from "../access/policy"
import type { Viewer } from "../access/viewer"
import { inLibraries, seesLibrary, visibleLibraries } from "../access/visible"
import { db } from "../db"
import { allMappings } from "./fulfilment/connections"

export type Destination = typeof library.$inferSelect & {
  /** The name of the connection that fills it. */
  connection: string
  /**
   * It has a mapping of its own, so any title of its kind can go here.
   * Without one, only anime reaches it, through another library's.
   */
  own: boolean
  /** Where anime that would come here goes instead, possibly here. */
  animeTo: string | null
  /** The libraries whose options for anime land here, by name. */
  animeFrom: string[]
}

/** A destination, and whose options for anime send a request there. */
export type Route<T extends Destination = Destination> = {
  library: T
  /** The library whose mapping's anime options it takes, or null. */
  animeFrom: string | null
}

/**
 * The libraries of a kind the viewer can ask into, by name: they can see
 * it, it has a metadata provider, and a connection that fetches the kind
 * fills it, through its own mapping or another's options for anime.
 */
export async function destinations(
  viewer: Viewer,
  kind: CatalogRef["kind"],
): Promise<Destination[]> {
  const [mappings, rows] = await Promise.all([
    allMappings(),
    db
      .select()
      .from(library)
      .where(visibleLibraries(viewer))
      .orderBy(asc(library.name), asc(library.id)),
  ])
  const fitting = mappings.filter((entry) => entry.source.kinds.includes(kind))
  return rows.flatMap((row) => {
    if (
      !row.metadataProvider ||
      (row.kind === "movies" ? kind !== "movie" : kind !== "show")
    )
      return []
    const own = fitting.find((entry) => entry.library.id === row.id)
    const from = fitting.filter((entry) => entry.anime?.library?.id === row.id)
    const filler = own ?? from[0]
    if (!filler) return []
    return [
      {
        ...row,
        connection: filler.connection.name,
        own: !!own,
        animeTo: own?.anime?.library?.id ?? null,
        animeFrom: from.map((entry) => entry.library.id),
      },
    ]
  })
}

/**
 * How a title goes to a library: anime with the options for anime that
 * land there, its own mapping's first, and anything else with the
 * library's own mapping. A library only anime reaches takes whatever
 * goes there as anime, as when an admin moves a request into it.
 */
export function routeTo<T extends Destination>(
  library: T,
  anime: boolean,
): Route<T> {
  if (library.own)
    return {
      library,
      animeFrom: anime && library.animeTo === library.id ? library.id : null,
    }
  return { library, animeFrom: library.animeFrom[0] ?? null }
}

/**
 * The libraries a viewer may choose between for a title: any with a
 * mapping of its own, and for anime, those its options for anime reach.
 */
export function choices<T extends Destination>(
  candidates: T[],
  anime: boolean,
): T[] {
  return candidates.filter((row) => row.own || (anime && row.animeFrom.length))
}

/**
 * Where a title goes when nobody chose. The library its request already
 * sits in, if the viewer can ask into it. Else the library a title that
 * isn't anime goes to, the first by name with a mapping of its own, one
 * on the title's own provider first; for anime, where that library's
 * options for anime land instead, when it has them and the viewer can
 * ask into it. Every default destination comes from here, so a card, a
 * title's page, and an ask agree. `candidates` is what `destinations`
 * gave for the title's kind.
 */
export function defaultDestination<T extends Destination>(
  candidates: T[],
  title: {
    anime: boolean
    /** Libraries holding a request for the title. */
    requestedIn?: readonly string[]
    provider?: CatalogRef["provider"]
  },
): Route<T> | undefined {
  const requested = candidates.find((row) =>
    title.requestedIn?.includes(row.id),
  )
  if (requested) return routeTo(requested, title.anime)
  const own = candidates.filter((row) => row.own)
  const base =
    own.find((row) => row.metadataProvider === title.provider) ?? own[0]
  if (!title.anime) return base && { library: base, animeFrom: null }
  const home = candidates.find((row) => row.id === base?.animeTo)
  if (base && home) return { library: home, animeFrom: base.id }
  if (base) return { library: base, animeFrom: null }
  // No library of its own for the viewer, but one anime reaches.
  const reached = candidates.find((row) => row.animeFrom.length)
  return reached && routeTo(reached, true)
}

/**
 * The language to read a title's details in before its destination is
 * known: that of the library it would go to if it isn't anime. It keys
 * the provider cache, so a card, its page, and its ask read one entry.
 */
export function lookupLanguage(
  candidates: Destination[],
  provider: CatalogRef["provider"],
) {
  return (
    defaultDestination(candidates, { anime: false, provider })?.library
      .metadataLanguage ?? "en-US"
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
