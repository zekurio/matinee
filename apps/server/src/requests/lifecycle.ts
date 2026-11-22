import type {
  CatalogRef,
  RemoteRef,
  RequestState,
  TitleKind,
  ShowScope,
  WaitingDeclineReason,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  fulfilmentConnection,
  library,
  request,
  requestFollower,
  requestSeason,
  title,
  user,
} from "@matinee/db"
import { ORPCError } from "@orpc/server"
import {
  and,
  asc,
  eq,
  ne,
  gt,
  desc,
  inArray,
  isNull,
  not,
  or,
  count,
  sql,
  type SQL,
} from "drizzle-orm"

import type { Access } from "../access/policy"
import { can, type Viewer } from "../access/viewer"
import { inLibraries, visibleTitles } from "../access/visible"
import { details, routedDetails } from "../catalog"
import { detailProvider } from "../catalog/cache"
import { db } from "../db"
import { placeholders, toArtwork } from "../media/artwork"
import { events } from "../realtime/events"
import { availability, ExternalIds } from "./availability"
import { withCachedDetails } from "./cached-details"
import { destinations, followerAccess, seenByAll } from "./destinations"
import { titleFacts } from "./facts"
import {
  loadRouting,
  type Plan,
  resolveConnection,
  type Routing,
} from "./fulfilment/connections"
import { sources } from "./fulfilment/sources"
import type { FulfilmentSource } from "./fulfilment/types"
import { clearProgress, getDiagnostics } from "./progress"
import { requestAction, requestLimit, undoable } from "./rules"

type Row = typeof request.$inferSelect
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Scope = t.infer<typeof ShowScope>

function unavailable(): never {
  throw new ORPCError("NOT_FOUND", { message: "This request isn't available." })
}

async function visibleRequest(
  viewer: Viewer,
  id: string,
  tx: Transaction | typeof db = db,
) {
  const [row] = await tx
    .select()
    .from(request)
    .where(and(eq(request.id, id), inLibraries(viewer, request.libraryId)))
    .for("update")
  if (!row) unavailable()
  return row
}

/** Lock the account in Postgres so two titles cannot both spend the last slot. */
async function quota(tx: Transaction, viewer: Viewer) {
  await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, viewer.id))
    .for("update")
  const limit = viewer.access.requestLimit
  if (!limit) return null
  const asks = await tx
    .select({ at: requestFollower.createdAt })
    .from(requestFollower)
    .innerJoin(request, eq(request.id, requestFollower.requestId))
    .where(
      and(
        eq(requestFollower.userId, viewer.id),
        ne(request.status, "declined"),
        gt(
          requestFollower.createdAt,
          new Date(Date.now() - limit.days * 86400000),
        ),
      ),
    )
  return requestLimit(
    limit,
    asks.map((row) => row.at),
  )
}

async function mergeScope(tx: Transaction, row: Row, scope: Scope | null) {
  if (!scope) return false
  const existing = await tx
    .select()
    .from(requestSeason)
    .where(eq(requestSeason.requestId, row.id))
  const numbers = [...new Set(scope.seasons)].filter(
    (number) => !existing.some((s) => s.number === number),
  )
  if (numbers.length)
    await tx
      .insert(requestSeason)
      .values(numbers.map((number) => ({ requestId: row.id, number })))
  return numbers.length > 0 || (scope.future && !row.future)
}

export async function ask(
  viewer: Viewer,
  input: { ref: CatalogRef; libraryId?: string; scope?: Scope },
) {
  const { detail, plan } = await routedDetails(viewer, input)
  const destination = detail.destinations.find((row) => row.selected)
  if (!destination) unavailable()
  // Provider payload, never client input, supplies external ids and artwork.
  const library = (await destinations(viewer, input.ref.kind)).find(
    (row) => row.id === destination.id,
  )
  const metadata = await detailProvider(
    detail.ref,
    library?.metadataLanguage ?? "en-US",
  )
  const scope =
    detail.ref.kind === "show" ? (input.scope ?? detail.defaultScope) : null
  if (
    scope?.seasons.some(
      (number) => !detail.seasons.some((season) => season.number === number),
    )
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose seasons listed for this show.",
    })
  }
  const result = await db.transaction(async (tx) => {
    const limit = await quota(tx, viewer)
    // The identity index arbitrates simultaneous first asks, including different users.
    const [inserted] = await tx
      .insert(request)
      .values({
        libraryId: destination.id,
        ...detail.ref,
        name: detail.name,
        year: detail.year,
        posterId: detail.poster?.id,
        externalIds: metadata.value.externalIds,
        // Kept as they were for a request already there, which may have
        // been sent with them.
        connectionId: plan?.connection.id ?? null,
        options: plan?.options ?? null,
      })
      .onConflictDoNothing()
      .returning()
    const [row] = await tx
      .select()
      .from(request)
      .where(
        and(
          eq(request.libraryId, destination.id),
          eq(request.provider, detail.ref.provider),
          eq(request.providerId, detail.ref.providerId),
        ),
      )
      .for("update")
    if (!row) unavailable()
    const [self] = await tx
      .select()
      .from(requestFollower)
      .where(
        and(
          eq(requestFollower.requestId, row.id),
          eq(requestFollower.userId, viewer.id),
        ),
      )
    const action = requestAction(viewer, {
      destination: true,
      declined: row.status === "declined",
      limit,
      status: null,
      asked: !!self,
      here: false,
      existingTitle: !!self,
      approvedTitle: row.status === "approved",
    })
    if (action.disabledReason === "declined")
      throw new ORPCError("FORBIDDEN", {
        message:
          "This title was declined, so it can't be requested until an admin allows it again.",
      })
    if (action.disabledReason)
      throw new ORPCError("FORBIDDEN", {
        message: "You can't request this title right now.",
      })
    const changed = await mergeScope(tx, row, scope)
    const approved =
      can(viewer, "request.autoApprove") || row.status === "approved"
    const status = approved ? "approved" : "asked"
    // One whose connection was deleted takes the one it would go to now.
    const replanned = !row.connectionId && plan
    await tx
      .update(request)
      .set({
        status,
        ...(replanned && {
          connectionId: plan.connection.id,
          options: plan.options,
        }),
        future: row.future || (scope?.future ?? false),
        fulfilmentState:
          approved && (inserted || changed || row.status !== "approved")
            ? "queued"
            : row.fulfilmentState,
        approvedAt: approved ? (row.approvedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(request.id, row.id))
    if (!self)
      await tx
        .insert(requestFollower)
        .values({ requestId: row.id, userId: viewer.id })
    return row.id
  })
  events.publish("requests", undefined)
  return itemById(viewer, result)
}

export async function addSeasons(
  viewer: Viewer,
  input: { id: string; scope: Scope },
) {
  const row = await visibleRequest(viewer, input.id)
  if (row.kind !== "show") unavailable()
  return ask(viewer, {
    ref: { kind: row.kind, provider: row.provider, providerId: row.providerId },
    libraryId: row.libraryId,
    scope: input.scope,
  })
}

/**
 * Takes the viewer's ask back, and the request with it once nobody asks.
 * Whoever runs the queue removes it outright.
 */
export async function cancel(viewer: Viewer, id: string) {
  await db.transaction(async (tx) => {
    const row = await visibleRequest(viewer, id, tx)
    const identity = and(
      eq(requestFollower.requestId, id),
      eq(requestFollower.userId, viewer.id),
    )
    const [self] = await tx.select().from(requestFollower).where(identity)
    if (can(viewer, "adminRequest.update")) {
      await tx.delete(request).where(eq(request.id, id))
      return
    }
    if (!self) unavailable()
    if (row.status !== "asked") {
      const askers = await tx
        .select({ id: requestFollower.userId })
        .from(requestFollower)
        .where(eq(requestFollower.requestId, id))
      if (!undoable(row, askers.length)) unavailable()
    }
    await tx.delete(requestFollower).where(identity)
    const [remaining] = await tx
      .select()
      .from(requestFollower)
      .where(eq(requestFollower.requestId, id))
      .limit(1)
    if (!remaining) await tx.delete(request).where(eq(request.id, id))
  })
  events.publish("requests", undefined)
}

async function items(viewer: Viewer, rows: Row[]) {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const scopes = await db
    .select()
    .from(requestSeason)
    .where(inArray(requestSeason.requestId, ids))
  // ACCESS: these libraries belong to request rows already filtered for the viewer.
  const libraries = await db
    .select()
    .from(library)
    .where(
      inArray(
        library.id,
        rows.map((row) => row.libraryId),
      ),
    )
  const art = await placeholders(
    rows.flatMap((row) => (row.posterId ? [row.posterId] : [])),
  )
  const states = await availability(
    viewer,
    await withCachedDetails(
      viewer,
      rows.map((row) => ({
        requestId: row.id,
        ref: {
          kind: row.kind,
          provider: row.provider,
          providerId: row.providerId,
        },
        libraryId: row.libraryId,
        externalIds: ExternalIds.parse(row.externalIds),
      })),
    ),
  )
  return rows.map((row, index) => {
    const state = states[index]
    const seasons = scopes.filter((scope) => scope.requestId === row.id)
    const destination = libraries.find(
      (library) => library.id === row.libraryId,
    )
    if (!state || !destination) unavailable()
    return {
      id: row.id,
      title: {
        ref: state.ref,
        name: row.name,
        year: row.year,
        poster: toArtwork(row.posterId, art),
        availability: state.availability,
      },
      library: { id: destination.id, name: destination.name },
      scope:
        row.kind === "show"
          ? {
              seasons: scopes
                .filter((scope) => scope.requestId === row.id)
                .map((scope) => scope.number),
              future: row.future,
            }
          : null,
      createdAt: row.createdAt,
      arrivedAt: arrivedAt(row, seasons),
      availability: state.availability,
      season: row.kind === "show" ? furthestSeason(state.seasons) : null,
      state: stateOf(row, seasons),
    }
  })
}

/**
 * When a request got here, as `arrived` and `arrivalTime` have it in
 * SQL: a film when it arrived, a show when the last season it asked for
 * did. A show still missing a season, or waiting for its first new one,
 * hasn't.
 */
function arrivedAt(
  row: Row,
  seasons: readonly { arrivedAt: Date | null }[],
): Date | null {
  if (row.kind === "movie") return row.arrivedAt
  let last: Date | null = null
  for (const season of seasons) {
    if (!season.arrivedAt) return null
    if (!last || season.arrivedAt > last) last = season.arrivedAt
  }
  return last
}

/**
 * Where a request stands, the same for whoever asked for it and for
 * whoever runs the queue: declined, here once it arrived, waiting while
 * nobody answered, needs attention when sending it failed, else on its
 * way.
 */
function stateOf(
  row: Row,
  seasons: readonly { arrivedAt: Date | null }[],
): RequestState {
  if (row.status === "declined") return "declined"
  if (arrivedAt(row, seasons)) return "here"
  if (row.status === "asked") return "waiting"
  return row.fulfilmentState === "failed" ? "needsAttention" : "onTheWay"
}

// How far along a season that isn't here is, for picking the one a
// show's card speaks of.
const STAGES = new Map<string, number>([
  ["coming", 4],
  ["release", 3],
  ["asked", 2],
  ["unavailable", 1],
])

/**
 * The season of a show's request furthest along that isn't here yet, the
 * earliest of equals: what "Season 2 on its way" on its card is about.
 */
function furthestSeason<T extends { number: number; state: string }>(
  seasons: T[],
): T | null {
  let pick: T | null = null
  for (const season of seasons) {
    const stage = STAGES.get(season.state) ?? 0
    if (stage === 0) continue
    const best = pick ? (STAGES.get(pick.state) ?? 0) : 0
    if (stage > best || (stage === best && pick && season.number < pick.number))
      pick = season
  }
  return pick
}

async function itemById(viewer: Viewer, id: string) {
  const row = await visibleRequest(viewer, id)
  const [item] = await items(viewer, [row])
  if (!item) unavailable()
  return item
}

const Cursor = t.object({
  at: t.string().datetime(),
  id: t.uuid(),
  /** In `mine`, whether the last row was in flight, which sort first. */
  open: t.boolean().optional(),
})
function decodeCursor(cursor: string) {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()))
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message: "Reload this list and try again.",
    })
  }
}
function cursorBefore(
  cursor: string | undefined,
  column: typeof request.createdAt | ReturnType<typeof sql>,
) {
  if (!cursor) return undefined
  const decoded = decodeCursor(cursor)
  return sql`(${column}, ${request.id}) < (${new Date(decoded.at)}, ${decoded.id})`
}
function encodeCursor(cursor: { at: Date; id: string; open?: boolean }) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}
function nextCursor(rows: Row[], limit: number, open?: boolean) {
  const last = rows[limit - 1]
  return rows.length > limit && last
    ? encodeCursor({ at: last.createdAt, id: last.id, open })
    : null
}

// How long a title that arrived or was declined stays in "in progress".
const SETTLED_MS = 3 * 86400000

/**
 * A request still in flight, or one that settled in the last three days:
 * a film that arrived or a declined title, so its asker sees how it ended.
 * A show is in flight while a season it asked for hasn't come, or has
 * only just, and also while it waits for its first new season.
 */
function inProgress() {
  const since = new Date(Date.now() - SETTLED_MS)
  const seasons = db
    .select({ one: sql`1` })
    .from(requestSeason)
    .where(
      and(
        eq(requestSeason.requestId, request.id),
        or(isNull(requestSeason.arrivedAt), gt(requestSeason.arrivedAt, since)),
      ),
    )
  const asked = db
    .select({ one: sql`1` })
    .from(requestSeason)
    .where(eq(requestSeason.requestId, request.id))
  return or(
    and(eq(request.status, "declined"), gt(request.declinedAt, since)),
    and(
      ne(request.status, "declined"),
      eq(request.kind, "movie"),
      or(isNull(request.arrivedAt), gt(request.arrivedAt, since)),
    ),
    and(
      ne(request.status, "declined"),
      ne(request.kind, "movie"),
      or(sql`exists ${seasons}`, sql`not exists ${asked}`),
    ),
  )
}

/**
 * A request that got here, as `arrivedAt` has it: a film that arrived,
 * or a show with seasons asked for that all did.
 */
function arrived() {
  const open = db
    .select({ one: sql`1` })
    .from(requestSeason)
    .where(
      and(
        eq(requestSeason.requestId, request.id),
        isNull(requestSeason.arrivedAt),
      ),
    )
  const asked = db
    .select({ one: sql`1` })
    .from(requestSeason)
    .where(eq(requestSeason.requestId, request.id))
  return or(
    and(eq(request.kind, "movie"), sql`${request.arrivedAt} is not null`),
    and(
      ne(request.kind, "movie"),
      sql`exists ${asked}`,
      sql`not exists ${open}`,
    ),
  )
}

/**
 * When a request that got here did, as `arrivedAt` has it: a film's
 * arrival, a show's last season's.
 */
function arrivalTime() {
  const last = db
    .select({ at: sql`max(${requestSeason.arrivedAt})` })
    .from(requestSeason)
    .where(eq(requestSeason.requestId, request.id))
  return sql`case when ${request.kind} = 'movie' then ${request.arrivedAt} else (${last}) end`
}

/** A request not finished yet: not declined, and not here. Waiting ones count. */
function inFlight() {
  return and(ne(request.status, "declined"), sql`not (${arrived()})`)
}

/** The requests in `state`, by `stateOf`'s rule, the one each card shows. */
function inState(state: RequestState) {
  const here = sql`(${arrived()})`
  const approved = eq(request.status, "approved")
  switch (state) {
    case "declined":
      return eq(request.status, "declined")
    case "here":
      return and(ne(request.status, "declined"), here)
    case "waiting":
      return and(eq(request.status, "asked"), not(here))
    case "needsAttention":
      return and(approved, eq(request.fulfilmentState, "failed"), not(here))
    case "onTheWay":
      return and(
        approved,
        // Not failed, which in SQL a null never is.
        or(
          isNull(request.fulfilmentState),
          ne(request.fulfilmentState, "failed"),
        ),
        not(here),
      )
  }
}

type ListFilter = { states: readonly RequestState[]; kind?: TitleKind }

/** Whether `filter` keeps `state`: an empty list keeps every one. */
function keeps(filter: ListFilter, state: RequestState) {
  return !filter.states.length || filter.states.includes(state)
}

/** The requests `filter` keeps, or nothing when it keeps them all. */
function kept(filter: ListFilter) {
  return and(
    filter.kind ? eq(request.kind, filter.kind) : undefined,
    filter.states.length
      ? or(...filter.states.map((state) => inState(state)))
      : undefined,
  )
}

/**
 * The rows after `cursor` in `mine`'s order: in flight first, then
 * finished, each newest first. A cursor from before that order counts
 * as in flight.
 */
function mineAfter(cursor: string | undefined, open: SQL) {
  if (!cursor) return undefined
  const decoded = decodeCursor(cursor)
  const older = sql`(${request.createdAt}, ${request.id}) < (${new Date(decoded.at)}, ${decoded.id})`
  return decoded.open === false
    ? and(sql`not ${open}`, older)
    : or(and(open, older), sql`not ${open}`)
}

/** The requests the viewer asked for or follows, among the libraries they see. */
function followedBy(viewer: Viewer) {
  return and(
    inLibraries(viewer, request.libraryId),
    eq(requestFollower.userId, viewer.id),
  )
}

export async function mine(
  viewer: Viewer,
  input: ListFilter & {
    cursor?: string
    limit: number
    filter: "inProgress" | "all"
  },
) {
  const open = sql`(${inFlight()})`
  const rows = await db
    .select({ request, open: sql<boolean>`${open}` })
    .from(request)
    .innerJoin(requestFollower, eq(requestFollower.requestId, request.id))
    .where(
      and(
        followedBy(viewer),
        mineAfter(input.cursor, open),
        input.filter === "inProgress" ? inProgress() : undefined,
        kept(input),
      ),
    )
    .orderBy(desc(open), desc(request.createdAt), desc(request.id))
    .limit(input.limit + 1)
  const requests = rows.map((row) => row.request)
  return {
    items: await items(viewer, requests.slice(0, input.limit)),
    nextCursor: nextCursor(requests, input.limit, rows[input.limit - 1]?.open),
  }
}

export async function queue(
  viewer: Viewer,
  input: ListFilter & { cursor?: string; limit: number },
) {
  const visible = and(
    inLibraries(viewer, request.libraryId),
    input.kind ? eq(request.kind, input.kind) : undefined,
  )
  // The lists are the states, by the rule a person's own list has, and
  // done is the two that end one. A state the filter leaves out is empty.
  const open = (["waiting", "needsAttention", "onTheWay"] as const).map(
    (state) => (keeps(input, state) ? and(visible, inState(state)) : null),
  )
  const ends = (["here", "declined"] as const).filter((state) =>
    keeps(input, state),
  )
  const done = ends.length
    ? and(visible, or(...ends.map((state) => inState(state))))
    : null
  // Done, latest first by when it got here or was declined.
  const declined = eq(request.status, "declined")
  const finishedAt =
    sql<Date>`case when ${declined} then ${request.declinedAt} else ${arrivalTime()} end`.mapWith(
      request.declinedAt,
    )
  const lists = await Promise.all(
    open.map(async (filter) =>
      filter
        ? await db
            .select()
            .from(request)
            .where(filter)
            .orderBy(desc(request.createdAt), desc(request.id))
            .limit(10000)
        : [],
    ),
  )
  const finished = done
    ? await db
        .select({ request, at: finishedAt })
        .from(request)
        .where(and(done, cursorBefore(input.cursor, finishedAt)))
        .orderBy(desc(finishedAt), desc(request.id))
        .limit(input.limit + 1)
    : []
  const totals = await Promise.all(
    [...open, done].map(async (filter) =>
      filter
        ? ((await db.select({ value: count() }).from(request).where(filter))[0]
            ?.value ?? 0)
        : 0,
    ),
  )
  // Each card's state is the list it's in, by the same rule.
  const decorate = async (rows: Row[]) => {
    const cards = await items(viewer, rows)
    if (!rows.length) return []
    const followers = await db
      .select({
        follower: requestFollower,
        name: user.displayName,
        username: user.username,
        avatarId: user.avatarId,
      })
      .from(requestFollower)
      .innerJoin(user, eq(user.id, requestFollower.userId))
      .where(
        inArray(
          requestFollower.requestId,
          rows.map((row) => row.id),
        ),
      )
    const connections = await db.select().from(fulfilmentConnection)
    const asked = rows.filter((row) => row.status === "asked")
    const routing = asked.length ? await loadRouting() : null
    const [movies, shows, following, held] = routing
      ? await Promise.all([
          destinations(viewer, "movie", routing),
          destinations(viewer, "show", routing),
          followerAccess(asked.map((row) => row.id)),
          heldInPlace(viewer, asked),
        ])
      : [[], [], new Map<string, Access[]>(), new Set<string>()]
    return cards.map((card, index) => {
      const row = rows[index]!
      // The connection it goes, or would go, through.
      const connection = connections.find(
        (entry) => entry.id === row.connectionId,
      )
      const source = connection && sources.get(connection.source)
      const choices = seenByAll(
        row.kind === "movie" ? movies : shows,
        following.get(row.id),
      )
      return {
        ...card,
        status: row.status,
        fulfilmentState: row.fulfilmentState,
        error: row.fulfilmentError,
        reason: row.declineReason,
        note: row.declineNote,
        declinedAt: row.declinedAt,
        connection: connection
          ? {
              id: connection.id,
              name: connection.name,
              sourceName: source?.name ?? connection.name,
              reportsProgress: !!source?.progress,
            }
          : null,
        followers: followers
          .filter((f) => f.follower.requestId === row.id)
          .map((f) => ({
            id: f.follower.userId,
            name: f.name ?? f.username,
            avatarId: f.avatarId,
            createdAt: f.follower.createdAt,
          })),
        destinationDescription: [card.library.name, connection?.name]
          .filter(Boolean)
          .join(" · "),
        // Its own library first if nothing fills that any more, so the
        // chooser still says where it is.
        destinations:
          row.status === "asked" && !held.has(row.id)
            ? [
                ...(choices.some((choice) => choice.id === row.libraryId)
                  ? []
                  : [{ ...card.library, connection: connection?.name }]),
                ...choices,
              ].map((choice) => ({
                id: choice.id,
                name: choice.name,
                connection: choice.connection ?? null,
                selected: choice.id === row.libraryId,
              }))
            : [],
        remoteUrl:
          connection && source?.link && row.remoteRef
            ? remoteUrl(connection, source, row.remoteRef)
            : null,
        diagnostics: getDiagnostics(row.id),
      }
    })
  }
  const lastDone = finished[input.limit - 1]
  return {
    waiting: await decorate(lists[0] ?? []),
    needsAttention: await decorate(lists[1] ?? []),
    onTheWay: await decorate(lists[2] ?? []),
    done: await decorate(
      finished.slice(0, input.limit).map((row) => row.request),
    ),
    counts: {
      waiting: totals[0] ?? 0,
      needsAttention: totals[1] ?? 0,
      onTheWay: totals[2] ?? 0,
      done: totals[3] ?? 0,
    },
    nextCursor:
      finished.length > input.limit && lastDone
        ? encodeCursor({ at: lastDone.at, id: lastDone.request.id })
        : null,
  }
}

/** Where a person opens a sent request in its connection's own app. */
function remoteUrl(
  connection: typeof fulfilmentConnection.$inferSelect,
  source: FulfilmentSource,
  ref: RemoteRef,
) {
  try {
    return source.link?.(resolveConnection(connection), ref) ?? null
  } catch {
    return null
  }
}

/**
 * What a request is now: its facts from its details, read through the
 * provider cache, and who asked for it first, whose request it counts as
 * for override rules on users.
 */
async function requestFacts(row: Row) {
  // ACCESS: the library of a request the caller has already loaded.
  const [own] = await db
    .select({ language: library.metadataLanguage })
    .from(library)
    .where(eq(library.id, row.libraryId))
  const ref = {
    kind: row.kind,
    provider: row.provider,
    providerId: row.providerId,
  }
  const detail = await detailProvider(ref, own?.language ?? "en-US")
    .then((result) => result.value)
    .catch(() => null)
  const facts = await titleFacts(row.kind, [
    detail,
    { externalIds: ExternalIds.parse(row.externalIds) },
  ])
  const [first] = await db
    .select({ userId: requestFollower.userId })
    .from(requestFollower)
    .where(eq(requestFollower.requestId, row.id))
    .orderBy(asc(requestFollower.createdAt))
    .limit(1)
  return { facts, user: first?.userId ?? null }
}

/**
 * How a request goes to a library now: the connection and the options
 * that land there for it, or null when nothing does.
 */
async function planInto(row: Row, libraryId: string, routing?: Routing) {
  const { facts, user } = await requestFacts(row)
  return (routing ?? (await loadRouting())).into(libraryId, facts, user)
}

/**
 * The waiting requests whose library already holds their title, as when
 * a show there asks for new seasons. Those stay with the show.
 */
async function heldInPlace(viewer: Viewer, rows: Row[]) {
  const found = await db
    .select({
      libraryId: title.libraryId,
      provider: title.provider,
      providerId: title.providerId,
    })
    .from(title)
    .where(
      and(
        visibleTitles(viewer),
        or(
          ...rows.map((row) =>
            and(
              eq(title.libraryId, row.libraryId),
              eq(title.provider, row.provider),
              eq(title.providerId, row.providerId),
            ),
          ),
        ),
      ),
    )
  return new Set(
    rows
      .filter((row) =>
        found.some(
          (entry) =>
            entry.libraryId === row.libraryId &&
            entry.provider === row.provider &&
            entry.providerId === row.providerId,
        ),
      )
      .map((row) => row.id),
  )
}

/**
 * Where a waiting request would move to: the title's identity in that
 * library, the provider and id there, resolved as its page resolves a
 * reference to another provider, and the connection and options that
 * send it there, worked out again for the title and its first asker.
 */
async function moveTarget(viewer: Viewer, id: string, libraryId: string) {
  const row = await visibleRequest(viewer, id)
  if (row.libraryId === libraryId) return null
  if (row.status !== "asked") notWaiting()
  if ((await heldInPlace(viewer, [row])).size) {
    const [own] = await db
      .select({ name: library.name })
      .from(library)
      // ACCESS: the library of a request in the queue the caller may run.
      .where(eq(library.id, row.libraryId))
    throw new ORPCError("CONFLICT", {
      message: `${own?.name ?? ""} already has this show, so its new seasons go there too.`,
    })
  }
  const target = seenByAll(
    await destinations(viewer, row.kind),
    (await followerAccess([row.id])).get(row.id),
  ).find((library) => library.id === libraryId)
  if (!target)
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose a library this title can go to.",
    })
  const ref = {
    kind: row.kind,
    provider: row.provider,
    providerId: row.providerId,
  }
  const detail =
    target.metadataProvider === row.provider
      ? null
      : await details(viewer, { ref, libraryId: target.id })
  const moved = detail?.ref ?? ref
  const metadata = detail
    ? (await detailProvider(moved, target.metadataLanguage)).value.externalIds
    : {}
  const plan = await planInto(row, target.id)
  if (!plan)
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose a library this title can go to.",
    })
  return {
    from: row,
    library: target,
    plan,
    provider: moved.provider,
    providerId: moved.providerId,
    externalIds: { ...ExternalIds.parse(row.externalIds), ...metadata },
  }
}

function notWaiting(): never {
  throw new ORPCError("CONFLICT", {
    message: "Only a waiting request can move to another library.",
  })
}

/** A unique index refused a write, as when the target already has the title. */
function duplicate(cause: unknown) {
  const error = t
    .object({
      code: t.string().optional(),
      cause: t.object({ code: t.string() }).optional(),
    })
    .safeParse(cause)
  return (
    error.success &&
    (error.data.code === "23505" || error.data.cause?.code === "23505")
  )
}

/**
 * Approves waiting requests, or retries one. Approving one with
 * `libraryId` moves it there first, in the same transaction: the title's
 * identity in that library, with its askers, seasons and dates as they
 * were.
 */
export async function moderate(
  viewer: Viewer,
  ids: string[],
  operation: "approve" | "retry",
  /** For approving one request: the library to move it to first. */
  libraryId?: string,
) {
  const [only] = ids
  const move =
    operation === "approve" && libraryId && only && ids.length === 1
      ? await moveTarget(viewer, only, libraryId)
      : null
  // One whose connection was deleted goes the way it would go now.
  const replans = new Map<string, Plan>()
  const orphans = await db
    .select()
    .from(request)
    .where(
      and(
        inArray(request.id, ids),
        inLibraries(viewer, request.libraryId),
        isNull(request.connectionId),
      ),
    )
  if (orphans.length) {
    const routing = await loadRouting()
    for (const row of orphans) {
      if (move && row.id === only) continue
      const plan = await planInto(row, row.libraryId, routing)
      if (plan) replans.set(row.id, plan)
    }
  }
  await db.transaction(async (tx) => {
    // Stable lock order prevents overlapping approve-all batches deadlocking.
    for (const id of [...new Set(ids)].sort()) {
      const row = await visibleRequest(viewer, id, tx)
      if (move) {
        if (row.status !== "asked") notWaiting()
        // Another admin moved it while its new identity was looked up.
        if (
          row.libraryId !== move.from.libraryId ||
          row.providerId !== move.from.providerId
        )
          throw new ORPCError("CONFLICT", {
            message: "This request changed. Reload the list and try again.",
          })
        const ids = ExternalIds.parse(move.externalIds)
        const [taken] = await tx
          .select({ id: request.id })
          .from(request)
          .where(
            and(
              eq(request.libraryId, move.library.id),
              eq(request.kind, row.kind),
              ne(request.id, row.id),
              or(
                and(
                  eq(request.provider, move.provider),
                  eq(request.providerId, move.providerId),
                ),
                ...Object.entries(ids).map(
                  ([site, value]) =>
                    sql`${request.externalIds} @> ${JSON.stringify({ [site]: value })}::jsonb`,
                ),
              ),
            ),
          )
          .limit(1)
        if (taken) alreadyThere(move.library.name)
        await tx
          .update(request)
          .set({
            libraryId: move.library.id,
            provider: move.provider,
            providerId: move.providerId,
            externalIds: ids,
            connectionId: move.plan.connection.id,
            options: move.plan.options,
            updatedAt: new Date(),
          })
          .where(eq(request.id, id))
          .catch((cause: unknown) => {
            if (duplicate(cause)) alreadyThere(move.library.name)
            throw cause
          })
      }
      if (operation === "approve" && row.status !== "asked") {
        if (ids.length === 1 && row.status === "declined")
          throw new ORPCError("CONFLICT", {
            message: "This request changed. Reload the list and try again.",
          })
        continue
      }
      if (
        operation === "retry" &&
        (row.status !== "approved" || row.fulfilmentState !== "failed")
      )
        throw new ORPCError("CONFLICT", {
          message: "This request isn't failing any more. Reload the list.",
        })
      const replan = replans.get(id)
      await tx
        .update(request)
        .set({
          status: "approved",
          fulfilmentState: "queued",
          fulfilmentError: null,
          ...(replan && {
            connectionId: replan.connection.id,
            options: replan.options,
          }),
          approvedAt: row.approvedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(request.id, id))
    }
  })
  events.publish("requests", undefined)
}

/**
 * An admin's no: declining a waiting request with a reason, or giving up
 * on an accepted one that hasn't come, which can only be for want of a
 * copy. Either closes the title for everyone until an admin lifts it.
 * Giving up leaves the connection alone; if the file turns up anyway, the
 * arrival check takes the decline back.
 */
export async function decline(
  viewer: Viewer,
  id: string,
  answer:
    | {
        operation: "decline"
        reason: WaitingDeclineReason
        note: string | null
      }
    | { operation: "giveUp"; note: string | null },
) {
  await db.transaction(async (tx) => {
    const row = await visibleRequest(viewer, id, tx)
    if (answer.operation === "decline" && row.status !== "asked")
      throw new ORPCError("CONFLICT", {
        message:
          "Only a waiting request can be declined. Give up on an accepted one instead.",
      })
    if (
      answer.operation === "giveUp" &&
      (row.status !== "approved" ||
        arrivedAt(
          row,
          await tx
            .select({ arrivedAt: requestSeason.arrivedAt })
            .from(requestSeason)
            .where(eq(requestSeason.requestId, row.id)),
        ) !== null)
    )
      throw new ORPCError("CONFLICT", {
        message:
          "Only an accepted request that hasn't arrived can be given up.",
      })
    await tx
      .update(request)
      .set({
        status: "declined",
        declineReason:
          answer.operation === "decline" ? answer.reason : "notFound",
        declineNote: answer.note || null,
        declinedBy: viewer.id,
        declinedAt: new Date(),
        fulfilmentState: null,
        fulfilmentError: null,
        updatedAt: new Date(),
      })
      .where(eq(request.id, id))
  })
  clearProgress(id)
  events.publish("requests", undefined)
}

/**
 * Lifts a decline. "Allow requests again" removes the declined request,
 * as Remove does, so the title can be requested afresh by anyone and
 * starts as a new request. "Add after all" accepts it as it stands, with
 * its requesters and seasons, and sends it.
 */
export async function reopen(
  viewer: Viewer,
  id: string,
  operation: "allowAgain" | "addAfterAll",
) {
  await db.transaction(async (tx) => {
    const row = await visibleRequest(viewer, id, tx)
    if (row.status !== "declined")
      throw new ORPCError("CONFLICT", {
        message: "This request isn't declined any more. Reload the list.",
      })
    if (operation === "allowAgain") {
      await tx.delete(request).where(eq(request.id, id))
      return
    }
    await tx
      .update(request)
      .set({
        status: "approved",
        fulfilmentState: "queued",
        fulfilmentError: null,
        approvedAt: new Date(),
        declineReason: null,
        declineNote: null,
        declinedBy: null,
        declinedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(request.id, id))
  })
  events.publish("requests", undefined)
}

function alreadyThere(library: string): never {
  throw new ORPCError("CONFLICT", {
    message: `${library} already has a request for this title. Leave this one where it is, or decline it.`,
  })
}
