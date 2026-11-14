import type { Availability, CatalogRef } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  mediaItem,
  request,
  requestFollower,
  requestSeason,
  title,
  user,
} from "@matinee/db"
import { and, eq, gt, inArray, ne, or, sql } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { inLibraries, visibleItems, visibleTitles } from "../access/visible"
import { db } from "../db"
import { defaultDestination, destinations } from "./destinations"
import { getProgress } from "./progress"
import { requestAction, requestLimit, undoable } from "./rules"

export const ExternalIds = t.record(t.string(), t.string())
export type AvailabilityInput = {
  ref: CatalogRef
  libraryId?: string
  externalIds?: t.infer<typeof ExternalIds>
  seasons?: { number: number; episodesAired: number; airDate: string | null }[]
  releaseDate?: string | null
  /** A provider called it anime, in details already read. */
  anime?: boolean
}

/** All holdings and requests are batched, including external-id containment matches. */
export async function availability(
  viewer: Viewer,
  inputs: AvailabilityInput[],
) {
  if (!inputs.length) return []
  const [movies, shows] = await Promise.all([
    destinations(viewer, "movie"),
    destinations(viewer, "show"),
  ])
  const identities = inputs.map((input) =>
    and(
      eq(title.kind, input.ref.kind),
      or(
        and(
          eq(title.provider, input.ref.provider),
          eq(title.providerId, input.ref.providerId),
        ),
        ...Object.entries(
          ExternalIds.parse({
            ...input.externalIds,
            [input.ref.provider]: input.ref.providerId,
          }),
        ).map(
          ([site, id]) =>
            sql`${title.externalIds} @> ${JSON.stringify({ [site]: id })}::jsonb`,
        ),
      ),
    ),
  )
  // Holdings only count when playable and visible. A hidden copy must not change a card.
  const holdings = await db
    .select({
      titleId: title.id,
      kind: title.kind,
      provider: title.provider,
      providerId: title.providerId,
      externalIds: title.externalIds,
      season: mediaItem.seasonNumber,
      episode: mediaItem.episodeNumber,
    })
    .from(title)
    .innerJoin(mediaItem, eq(mediaItem.titleId, title.id))
    .where(and(visibleTitles(viewer), visibleItems(viewer), or(...identities)))
  const requests = await db
    .select()
    .from(request)
    .where(
      and(
        inLibraries(viewer, request.libraryId),
        or(
          ...inputs.map((input) =>
            and(
              eq(request.kind, input.ref.kind),
              or(
                and(
                  eq(request.provider, input.ref.provider),
                  eq(request.providerId, input.ref.providerId),
                ),
                ...Object.entries(
                  ExternalIds.parse({
                    ...input.externalIds,
                    [input.ref.provider]: input.ref.providerId,
                  }),
                ).map(
                  ([site, id]) =>
                    sql`${request.externalIds} @> ${JSON.stringify({ [site]: id })}::jsonb`,
                ),
              ),
            ),
          ),
        ),
      ),
    )
  const ids = requests.map((row) => row.id)
  const followers = ids.length
    ? await db
        .select({
          requestId: requestFollower.requestId,
          userId: requestFollower.userId,
          asked: requestFollower.asked,
          createdAt: requestFollower.createdAt,
          name: user.displayName,
          username: user.username,
        })
        .from(requestFollower)
        .innerJoin(user, eq(user.id, requestFollower.userId))
        .where(inArray(requestFollower.requestId, ids))
    : []
  const scopes = ids.length
    ? await db
        .select()
        .from(requestSeason)
        .where(inArray(requestSeason.requestId, ids))
    : []
  // Only the rolling window affects quota. Do not load a viewer's full history.
  const usage = viewer.access.requestLimit
    ? await db
        .select({ at: requestFollower.createdAt })
        .from(requestFollower)
        .innerJoin(request, eq(request.id, requestFollower.requestId))
        .where(
          and(
            eq(requestFollower.userId, viewer.id),
            eq(requestFollower.asked, true),
            ne(request.status, "declined"),
            gt(
              requestFollower.createdAt,
              new Date(Date.now() - viewer.access.requestLimit.days * 86400000),
            ),
          ),
        )
    : []
  const limit = requestLimit(
    viewer.access.requestLimit,
    usage.map((row) => row.at),
  )
  return inputs.map((input) => {
    const externalIds = ExternalIds.parse({
      ...input.externalIds,
      [input.ref.provider]: input.ref.providerId,
    })
    const owned = holdings.filter(
      (row) =>
        row.kind === input.ref.kind &&
        ((row.provider === input.ref.provider &&
          row.providerId === input.ref.providerId) ||
          Object.entries(ExternalIds.parse(row.externalIds)).some(
            ([site, id]) => externalIds[site] === id,
          )),
    )
    const row = requests.find(
      (row) =>
        row.kind === input.ref.kind &&
        ((row.provider === input.ref.provider &&
          row.providerId === input.ref.providerId) ||
          Object.entries(ExternalIds.parse(row.externalIds)).some(
            ([site, id]) => externalIds[site] === id,
          )),
    )
    const people = followers.filter((f) => f.requestId === row?.id)
    const candidates = input.ref.kind === "movie" ? movies : shows
    const selected = input.libraryId
      ? candidates.find((library) => library.id === input.libraryId)
      : defaultDestination(candidates, {
          anime: input.anime ?? false,
          requestedIn: row ? [row.libraryId] : [],
          provider: input.ref.provider,
        })?.library
    const context = {
      row,
      people,
      destination: !!selected,
      limit,
    }
    return {
      ref: input.ref,
      libraryId: selected?.id ?? null,
      availability: availabilityForScope(
        viewer,
        context,
        owned[0]?.titleId ?? null,
        true,
        input.releaseDate ?? null,
      ),
      seasons: (input.seasons ?? []).map((season) => {
        const files = owned.filter((file) => file.season === season.number)
        const covered =
          !!row &&
          (scopes.some(
            (scope) =>
              scope.requestId === row.id && scope.number === season.number,
          ) ||
            // "New seasons as they air" covers the seasons that started
            // airing after the ask, not ones left out of it that had aired.
            (row.future &&
              season.number > 0 &&
              (season.airDate === null ||
                season.airDate >= row.createdAt.toISOString().slice(0, 10))))
        return {
          ...availabilityForScope(
            viewer,
            context,
            files[0]?.titleId ?? null,
            covered,
            season.airDate,
            new Set(files.map((file) => file.episode)).size <
              season.episodesAired,
            season.number,
          ),
          number: season.number,
          episodesHere: new Set(files.map((file) => file.episode)).size,
          episodesAired: season.episodesAired,
        }
      }),
    }
  })
}

// Playable holdings win over request history. A declined title is
// unavailable to everyone, the whole of it, until an admin lifts the
// decline; only its followers hear why.
function availabilityState(
  here: string | null,
  status: "asked" | "approved" | "declined" | null,
  declined: boolean,
  waiting: boolean,
  releaseDate: string | null,
): Availability["state"] {
  if (here) return "here"
  if (declined) return "unavailable"
  if (status === "asked") return "asked"
  if (status === "approved") {
    if (
      waiting ||
      (releaseDate && releaseDate > new Date().toISOString().slice(0, 10))
    )
      return "release"
    return "coming"
  }
  return "none"
}

/** One policy evaluation serves title cards and season cards, including partial holdings. */
function availabilityForScope(
  viewer: Viewer,
  context: {
    row: typeof request.$inferSelect | undefined
    people: (typeof requestFollower.$inferSelect & {
      name: string | null
      username: string
    })[]
    destination: boolean
    limit: Availability["limit"]
  },
  here: string | null,
  covered: boolean,
  releaseDate: string | null,
  /**
   * Some of a season's aired episodes are here and some aren't. It still
   * plays, and the state and the action are about the rest of it.
   */
  incomplete = false,
  /** The season to read progress for. Null for the title as a whole. */
  season: number | null = null,
): Availability {
  const { row, people, destination, limit } = context
  const self = people.find((person) => person.userId === viewer.id)
  const progress = row ? getProgress(row.id, season) : undefined
  const status = covered ? (row?.status ?? null) : null
  const declined = row?.status === "declined"
  const action = requestAction(viewer, {
    destination: destination,
    existingTitle:
      !!self?.asked && (row?.status === "asked" || row?.status === "approved"),
    approvedTitle: row?.status === "approved",
    declined,
    limit,
    status,
    following: !!self,
    asked: self?.asked ?? false,
    undoable:
      !!row && undoable(row, people.filter((person) => person.asked).length),
    // An incomplete season still plays, but can ask for its missing episodes.
    here: !!here && !incomplete,
  })
  // Who else asked is part of a request's story, so only someone it is
  // told to hears it: nobody hears who asked for a declined title unless
  // they asked or follow it too.
  const others =
    row && (row.status !== "declined" || self)
      ? people.filter((f) => f.asked && f.userId !== viewer.id)
      : []
  const state = availabilityState(
    incomplete ? null : here,
    status,
    declined,
    progress?.waitingForRelease ?? false,
    releaseDate,
  )
  return {
    state,
    ...action,
    progress: state === "coming" ? (progress?.progress ?? null) : null,
    etaSeconds: state === "coming" ? (progress?.etaSeconds ?? null) : null,
    stillLooking: state === "coming" && (progress?.stillLooking ?? false),
    releaseDate,
    // The reason and the note are an answer to the people who requested
    // or follow it, and only they hear it:
    // "Already have it" could point at a library someone can't see.
    reason:
      state === "unavailable" && row && self
        ? {
            kind: "declined",
            code: row.declineReason,
            note: row.declineNote,
          }
        : null,
    askedBySelf: self?.asked ?? false,
    following: !!self,
    requestId: row?.id ?? null,
    others: {
      count: others.length,
      names: others.slice(0, 3).map((f) => f.name ?? f.username),
    },
    limit,
    libraryTitleId: here,
  }
}
