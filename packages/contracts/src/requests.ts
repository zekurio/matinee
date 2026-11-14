import { eventIterator } from "@orpc/contract"

import {
  CatalogRef,
  CatalogDestination,
  SeasonAvailability,
  Availability,
  CatalogInput,
  CatalogTitleSummary,
  DeclineReason,
  ShowScope,
  WaitingDeclineReason,
} from "./catalog"
import { get, post } from "./contract-routes"
import { t } from "./schema"
export const RequestStatus = t.enum(["asked", "approved", "declined"])

export const FulfilmentState = t.enum(["queued", "sent", "failed"])

export const RequestId = t.object({ id: t.uuid() })

export const RequestDestination = t.object({ id: t.uuid(), name: t.string() })

/** A library a waiting request could go to, for the admin's "Goes to". */
export const AdminRequestDestination = CatalogDestination.extend({
  /** The name of the connection that fills it. Null while nothing does. */
  connection: t.string().nullable(),
})

export const RequestItem = t.object({
  id: t.uuid(),
  title: CatalogTitleSummary,
  library: RequestDestination,
  scope: ShowScope.nullable(),
  createdAt: t.date(),
  arrivedAt: t.date().nullable(),
  availability: Availability,
  /**
   * For a show, the season it asked for that is furthest along and not
   * here yet, for a card's "Season 2 on its way". Null for a film, and
   * once every season asked for is here.
   */
  season: SeasonAvailability.nullable(),
})

export const RequestPage = t.object({
  items: t.array(RequestItem),
  nextCursor: t.string().nullable(),
})

export const RequestPageInput = t.object({
  cursor: t.string().max(512).optional(),
  limit: t.number().int().min(1).max(100).$default(40),
})

export const AdminRequestItem = RequestItem.extend({
  status: RequestStatus,
  fulfilmentState: FulfilmentState.nullable(),
  error: t.string().nullable(),
  reason: DeclineReason.nullable(),
  note: t.string().nullable(),
  /** When an admin declined it. Done lists arrivals and declines together. */
  declinedAt: t.date().nullable(),
  /** What fills the destination library now. Null while nothing does. */
  connection: t
    .object({
      id: t.uuid(),
      name: t.string(),
      /**
       * Whether it reports how far along a request is. A by-hand one
       * doesn't: once sent, its requests wait for someone to add the file.
       */
      reportsProgress: t.boolean(),
    })
    .nullable(),
  followers: t.array(
    t.object({
      id: t.uuid(),
      name: t.string(),
      /** Load it through `avatarPath()`. Null shows the initial instead. */
      avatarId: t.string().nullable(),
      asked: t.boolean(),
      createdAt: t.date(),
    }),
  ),
  destinationDescription: t.string(),
  /**
   * Where a waiting request could go instead, the one it goes to now
   * selected, for "Goes to" before Add: libraries of its kind that take
   * requests and that everyone following it can see. Empty once it no
   * longer waits, since only a waiting request can move.
   */
  destinations: t.array(AdminRequestDestination),
  remoteUrl: t.string().nullable(),
  diagnostics: t.array(t.object({ label: t.string(), value: t.string() })),
})
export type AdminRequestItem = t.infer<typeof AdminRequestItem>

export const RequestQueue = t.object({
  waiting: t.array(AdminRequestItem),
  needsAttention: t.array(AdminRequestItem),
  onTheWay: t.array(AdminRequestItem),
  done: t.array(AdminRequestItem),
  counts: t.object({
    waiting: t.number().int(),
    needsAttention: t.number().int(),
    onTheWay: t.number().int(),
    done: t.number().int(),
  }),
  nextCursor: t.string().nullable(),
})
export type RequestQueue = t.infer<typeof RequestQueue>

export const requestsContract = {
  /** Full snapshots on reconnect. Re-evaluate visibility for every viewer and update. */
  live: post("/requests/live")
    .input(t.object({ titles: t.array(CatalogInput).max(100) }))
    .output(
      eventIterator(
        t.array(
          t.object({
            ref: CatalogRef,
            availability: Availability,
            seasons: t.array(SeasonAvailability),
          }),
        ),
      ),
    ),
  ask: post("/requests/ask")
    .input(CatalogInput.extend({ scope: ShowScope.optional() }))
    .output(RequestItem),
  addSeasons: post("/requests/add-seasons")
    .input(RequestId.extend({ scope: ShowScope }))
    .output(RequestItem),
  cancel: post("/requests/cancel").input(RequestId).output(t.void()),
  follow: post("/requests/follow").input(RequestId).output(t.void()),
  unfollow: post("/requests/unfollow").input(RequestId).output(t.void()),
  mine: get("/requests/mine")
    .input(
      RequestPageInput.extend({
        filter: t.enum(["inProgress", "all"]).$default("inProgress"),
      }),
    )
    .output(RequestPage),
}

export const adminRequestsContract = {
  /**
   * Current work lists plus a cursor-paged done list: arrived and
   * declined requests, latest first. The cursor applies to done.
   */
  queue: get("/admin/requests").input(RequestPageInput).output(RequestQueue),
  live: get("/admin/requests/live")
    .input(RequestPageInput)
    .output(eventIterator(RequestQueue)),
  /**
   * With `libraryId`, the request moves to that library first, taking the
   * title's identity there and keeping its askers, seasons and dates.
   * Only a waiting request moves, and not into a library that already
   * has a request for the title.
   */
  approve: post("/admin/requests/approve")
    .input(RequestId.extend({ libraryId: t.uuid().optional() }))
    .output(t.void()),
  /** Explicit ids from the rendered waiting list, not unseen concurrent asks. */
  approveAll: post("/admin/requests/approve-all")
    .input(t.object({ ids: t.array(t.uuid()).min(1).max(500) }))
    .output(t.void()),
  /**
   * Declines a waiting request. A declined title can't be requested by
   * anyone until an admin allows requests for it again.
   */
  decline: post("/admin/requests/decline")
    .input(
      RequestId.extend({
        reason: WaitingDeclineReason,
        note: t.string().trim().max(2000).nullable(),
      }),
    )
    .output(t.void()),
  /**
   * Gives up on an accepted request that hasn't arrived: declines it with
   * "Can't find a copy" and tells its followers. Whatever the connection
   * holds for it is left alone, and if the file turns up anyway the
   * request counts as arrived.
   */
  giveUp: post("/admin/requests/give-up")
    .input(RequestId.extend({ note: t.string().trim().max(2000).nullable() }))
    .output(t.void()),
  /**
   * Lifts a decline by removing the declined request, so anyone may
   * request the title afresh. Nobody is told.
   */
  allowAgain: post("/admin/requests/allow-again")
    .input(RequestId)
    .output(t.void()),
  /**
   * Accepts a declined request as it stands, with its requesters,
   * followers and seasons, and sends it.
   */
  addAfterAll: post("/admin/requests/add-after-all")
    .input(RequestId)
    .output(t.void()),
  retry: post("/admin/requests/retry").input(RequestId).output(t.void()),
}
