import { notification, request, requestFollower, user } from "@matinee/db"
import { and, count, eq } from "drizzle-orm"

import { viewerOf } from "../access/viewer"
import { seesLibrary } from "../access/visible"
import { db } from "../db"
import { log } from "../log"
import { events } from "../realtime/events"
import { delivery } from "./delivery"

/**
 * Something that happened to a request, for the people it concerns. The
 * caller says what happened; who is told, how often, and over which
 * channel is decided here.
 */
export type NotificationEvent =
  /** A film, or a season of a show, became playable. For its followers. */
  | { kind: "ready"; requestId: string; season: number | null }
  /** A request was declined or given up on. For its followers. */
  | { kind: "unavailable"; requestId: string }
  /** A request waits for approval. For admins, at most once an hour. */
  | { kind: "waiting" }
  /** A request failed in a way an admin has to fix. For admins, once a day. */
  | { kind: "needsAttention" }

/** Call after the reported change commits, never inside its transaction. */
export async function notify(event: NotificationEvent): Promise<void> {
  try {
    const summary = event.kind === "waiting" || event.kind === "needsAttention"
    const [target] =
      "requestId" in event
        ? await db.select().from(request).where(eq(request.id, event.requestId))
        : []
    if (!summary && !target) return
    const people = summary
      ? await db.select().from(user).where(eq(user.role, "admin"))
      : await db
          .select({ person: user })
          .from(requestFollower)
          .innerJoin(user, eq(user.id, requestFollower.userId))
          .where(eq(requestFollower.requestId, target?.id ?? ""))
          .then((rows) => rows.map((row) => row.person))
    const period = event.kind === "waiting" ? 3_600_000 : 86_400_000
    const key = target
      ? `${event.kind}:${target.id}:${event.kind === "ready" ? event.season : target.declinedAt?.toISOString()}`
      : `${event.kind}:${Math.floor(Date.now() / period)}`
    const [total] = summary
      ? await db
          .select({ count: count() })
          .from(request)
          .where(
            event.kind === "waiting"
              ? eq(request.status, "asked")
              : and(
                  eq(request.status, "approved"),
                  eq(request.fulfilmentState, "failed"),
                ),
          )
      : [{ count: 1 }]
    if (!total?.count) return
    let changed = false
    for (const person of people) {
      const viewer = await viewerOf({ ...person, sessionId: "notification" })
      if (target && !seesLibrary(viewer, target.libraryId)) continue
      const inserted = await db
        .insert(notification)
        .values({
          userId: person.id,
          kind: event.kind,
          requestId: target?.id,
          season: event.kind === "ready" ? event.season : null,
          count: total.count,
          dedupeKey: key,
        })
        .onConflictDoNothing()
        .returning({ id: notification.id })
      changed ||= inserted.length > 0
      for (const row of inserted) delivery.push(row.id)
    }
    if (changed) events.publish("notifications", undefined)
  } catch (cause) {
    log.error("Could not store request notifications", cause)
  }
}
