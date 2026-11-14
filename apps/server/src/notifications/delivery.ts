import { setTimeout } from "node:timers/promises"

import { t } from "@matinee/contracts/schema"
import { notification, user, webPushSubscription } from "@matinee/db"
import { eq } from "drizzle-orm"
import { sendNotification } from "web-push"

import { viewerOf } from "../access/viewer"
import { db } from "../db"
import { env } from "../env"
import { defineQueue } from "../jobs/queue"
import { events } from "../realtime/events"
import { allowedEndpoint, pushKeys } from "./push"
import { readNotification } from "./read"

const PushError = t.object({ statusCode: t.number() })

/**
 * Where a push opens: a title that is ready on its page, or its season's;
 * one that isn't available on its catalog page, where its reason is; an
 * admin's summary in the request queue.
 */
function notificationPath(item: Awaited<ReturnType<typeof readNotification>>) {
  const title = item.title
  if (!title || item.kind === "waiting" || item.kind === "needsAttention")
    return "/requests"
  const here = title.availability.libraryTitleId
  if (item.kind === "ready" && here)
    return item.season === null
      ? `/titles/${here}`
      : `/titles/${here}/seasons/${item.season}`
  const { kind, provider, providerId } = title.ref
  return `/catalog/${kind}/${provider}/${encodeURIComponent(providerId)}`
}

export const delivery = defineQueue({
  id: "notifications",
  name: "Notifications",
  description: "Deliver request notifications.",
  concurrency: 2,
  key: (id: string) => id,
  label: (id: string) => id,
  run: async (id: string) => {
    const [row] = await db
      .select()
      .from(notification)
      .where(eq(notification.id, id))
    if (!row || row.pushSentAt) return
    const [person] = await db.select().from(user).where(eq(user.id, row.userId))
    if (!person) return
    const viewer = await viewerOf({ ...person, sessionId: "notification" })
    const item = await readNotification(viewer, row)
    if (row.requestId && !item.title) return
    const payload = JSON.stringify({
      kind: item.kind,
      name: item.title?.name,
      season: item.season,
      count: item.count,
      path: notificationPath(item),
    })
    const keys = await pushKeys()
    const subscriptions = await db
      .select()
      .from(webPushSubscription)
      .where(eq(webPushSubscription.userId, person.id))
    for (const subscription of subscriptions) {
      if (!allowedEndpoint(subscription.endpoint)) continue
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // web-push uses node:https and does not follow redirects.
          await sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            {
              vapidDetails: {
                subject: new URL(env.PUBLIC_URL).origin,
                ...keys,
              },
              TTL: 3600,
              timeout: 15_000,
            },
          )
          break
        } catch (cause) {
          const error = PushError.safeParse(cause)
          const status = error.success ? error.data.statusCode : 503
          if (status === 404 || status === 410) {
            await db
              .delete(webPushSubscription)
              .where(eq(webPushSubscription.id, subscription.id))
            break
          }
          if (status !== 429 && status < 500) break
          if (attempt === 2) throw cause
          await setTimeout(1000 * 2 ** attempt)
        }
      }
    }
    await db
      .update(notification)
      .set({ pushSentAt: new Date() })
      .where(eq(notification.id, id))
    events.publish("notifications", undefined)
  },
})
