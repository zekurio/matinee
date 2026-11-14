import { t } from "@matinee/contracts/schema"
import { notification, webPushSubscription } from "@matinee/db"
import { and, count, desc, eq, inArray, isNull, lt, or } from "drizzle-orm"

import { db } from "../db"
import { allowedEndpoint, pushKeys } from "../notifications/push"
import { readNotification } from "../notifications/read"
import { events } from "../realtime/events"
import { follow } from "../realtime/follow"
import { authed, badRequest } from "./base"

const Cursor = t.object({ at: t.string().datetime(), id: t.uuid() })

export const notifications = {
  list: authed.notifications.list.handler(async ({ context, input }) => {
    const cursor = input.cursor
      ? Cursor.parse(
          JSON.parse(Buffer.from(input.cursor, "base64url").toString()),
        )
      : undefined
    const rows = await db
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.userId, context.user.id),
          cursor
            ? or(
                lt(notification.createdAt, new Date(cursor.at)),
                and(
                  eq(notification.createdAt, new Date(cursor.at)),
                  lt(notification.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notification.createdAt), desc(notification.id))
      .limit(input.limit + 1)
    const more = rows.length > input.limit
    const page = rows.slice(0, input.limit)
    const last = page.at(-1)
    return {
      items: await Promise.all(
        page.map((row) => readNotification(context.user, row)),
      ),
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({ at: last.createdAt.toISOString(), id: last.id }),
            ).toString("base64url")
          : null,
    }
  }),
  markRead: authed.notifications.markRead.handler(
    async ({ context, input }) => {
      if (!input.all && !input.ids.length) return
      await db
        .update(notification)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notification.userId, context.user.id),
            isNull(notification.readAt),
            input.all ? undefined : inArray(notification.id, input.ids),
          ),
        )
      events.publish("notifications", undefined)
    },
  ),
  unreadCount: authed.notifications.unreadCount.handler(({ context, signal }) =>
    follow({
      topics: ["notifications"],
      signal,
      load: async () => {
        const [row] = await db
          .select({ count: count() })
          .from(notification)
          .where(
            and(
              eq(notification.userId, context.user.id),
              isNull(notification.readAt),
            ),
          )
        return { count: row?.count ?? 0 }
      },
    }),
  ),
  pushPublicKey: authed.notifications.pushPublicKey.handler(async () => ({
    publicKey: (await pushKeys()).publicKey,
  })),
  subscribe: authed.notifications.subscribe.handler(
    async ({ context, input }) => {
      if (!allowedEndpoint(input.endpoint))
        throw badRequest("Use a supported browser push service.")
      await db
        .insert(webPushSubscription)
        .values({
          userId: context.user.id,
          endpoint: input.endpoint,
          ...input.keys,
        })
        .onConflictDoUpdate({
          target: webPushSubscription.endpoint,
          set: { userId: context.user.id, ...input.keys },
        })
    },
  ),
  unsubscribe: authed.notifications.unsubscribe.handler(
    async ({ context, input }) => {
      await db
        .delete(webPushSubscription)
        .where(
          and(
            eq(webPushSubscription.userId, context.user.id),
            eq(webPushSubscription.endpoint, input.endpoint),
          ),
        )
    },
  ),
}
