import { eventIterator } from "@orpc/contract"

import { CatalogTitleSummary } from "./catalog"
import { get, post } from "./contract-routes"
import { t } from "./schema"
export const NotificationKind = t.enum([
  "ready",
  "unavailable",
  "waiting",
  "needsAttention",
])

export const Notification = t.object({
  id: t.uuid(),
  kind: NotificationKind,
  /** Null for an admin summary, or once the request is gone. */
  title: CatalogTitleSummary.nullable(),
  /** The season that is ready. Null for a film or a summary. */
  season: t.number().int().min(0).nullable(),
  /** How many requests an admin summary covers. */
  count: t.number().int().min(1),
  createdAt: t.date(),
  readAt: t.date().nullable(),
})

export const NotificationPage = t.object({
  items: t.array(Notification),
  nextCursor: t.string().nullable(),
})

export const PushSubscriptionInput = t.object({
  endpoint: t.string().url().max(4096),
  keys: t.object({
    p256dh: t.string().min(1).max(512),
    auth: t.string().min(1).max(512),
  }),
})

export const notificationsContract = {
  list: get("/notifications")
    .input(
      t.object({
        cursor: t.string().max(512).optional(),
        limit: t.number().int().min(1).max(100).$default(40),
      }),
    )
    .output(NotificationPage),
  markRead: post("/notifications/read")
    .input(
      t.object({
        ids: t.array(t.uuid()).max(500),
        all: t.boolean().$default(false),
      }),
    )
    .output(t.void()),
  unreadCount: get("/notifications/unread").output(
    eventIterator(t.object({ count: t.number().int().min(0) })),
  ),
  pushPublicKey: get("/notifications/push-key").output(
    t.object({ publicKey: t.string().nullable() }),
  ),
  subscribe: post("/notifications/subscribe")
    .input(PushSubscriptionInput)
    .output(t.void()),
  unsubscribe: post("/notifications/unsubscribe")
    .input(t.object({ endpoint: t.string().max(4096) }))
    .output(t.void()),
}
