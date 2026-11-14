import { setTimeout as sleep } from "node:timers/promises"

import { ExternalIdSite, RemoteRef } from "@matinee/contracts"
import {
  library,
  request,
  requestFollower,
  requestSeason,
  user,
} from "@matinee/db"
import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "../db"
import { defineQueue } from "../jobs/queue"
import { sources } from "../metadata/sources"
import { notify } from "../notifications/notify"
import { events } from "../realtime/events"
import { ExternalIds } from "./availability"
import { sendingFor } from "./fulfilment/connections"
import { UNREACHABLE } from "./fulfilment/types"

/**
 * How long a request waits after its approval before it is sent. A client
 * offers "Undo" for a few seconds after an ask, and for someone whose asks
 * need no approval that only works while nothing has gone out.
 */
export const UNDO_MS = 10_000

/** Requests waiting out `UNDO_MS`, so each gets one timer. */
const held = new Set<string>()

export async function failRequest(id: string, message: string) {
  const rows = await db
    .update(request)
    .set({
      fulfilmentState: "failed",
      fulfilmentError: message,
      updatedAt: new Date(),
    })
    .where(and(eq(request.id, id), eq(request.status, "approved")))
    .returning({ id: request.id })
  if (rows.length) {
    events.publish("requests", undefined)
    await notify({ kind: "needsAttention" })
  }
}

export const dispatch = defineQueue({
  id: "request-dispatch",
  name: "Request delivery",
  description: "Send accepted titles to their library connection.",
  concurrency: 2,
  key: (id: string) => id,
  label: (id) => id,
  joinsRunning: () => false,
  run: async (id, { signal }) => {
    const [loaded] = await db
      .select({
        row: request,
        version: sql<string>`${request.updatedAt}::text`,
      })
      .from(request)
      .where(eq(request.id, id))
    const row = loaded?.row
    if (!row || row.status !== "approved" || row.fulfilmentState !== "queued")
      return
    try {
      const sending = await sendingFor(row)
      if (!sending || !row.options)
        throw new Error(
          "Choose a usable fulfilment connection for this library.",
        )
      const { source, connection } = sending
      const options = row.options
      const [requester] = await db
        .select({ id: user.id, username: user.username })
        .from(requestFollower)
        .innerJoin(user, eq(user.id, requestFollower.userId))
        .where(
          and(
            eq(requestFollower.requestId, id),
            eq(requestFollower.asked, true),
          ),
        )
        .orderBy(asc(requestFollower.createdAt))
        .limit(1)
      // ACCESS: internal dispatch reads the destination of the approved request.
      const [destination] = await db
        .select()
        .from(library)
        .where(eq(library.id, row.libraryId))
      const ids = ExternalIds.parse(row.externalIds)
      ids[row.provider] = row.providerId
      for (const site of source.needs) {
        if (ids[site]) continue
        const provider = Object.values(sources).find(
          (entry) => entry.id === site,
        )
        const resolved = await provider?.lookup(ids, {
          kind: row.kind,
          language: destination?.metadataLanguage ?? "en-US",
        })
        if (!resolved)
          throw new Error(
            "Cannot resolve the title identity. Check its metadata match and retry.",
          )
        ids[site] = resolved
      }
      await db
        .update(request)
        .set({ externalIds: ids })
        .where(eq(request.id, id))
      const seasons = await db
        .select()
        .from(requestSeason)
        .where(eq(requestSeason.requestId, id))
      const externalIds = new Map<ExternalIdSite, string>()
      for (const [site, value] of Object.entries(ids)) {
        const parsed = ExternalIdSite.safeParse(site)
        if (parsed.success) externalIds.set(parsed.data, value)
      }
      for (let attempt = 0; ; attempt++) {
        try {
          const ref = RemoteRef.parse(
            await source.submit(connection, {
              requestId: id,
              ref: {
                kind: row.kind,
                provider: row.provider,
                providerId: row.providerId,
              },
              externalIds,
              name: row.name,
              year: row.year,
              scope:
                row.kind === "show"
                  ? {
                      seasons: seasons.map((season) => season.number),
                      future: row.future,
                    }
                  : null,
              options,
              requester: requester ?? null,
            }),
          )
          // A scope edit during submission must remain queued for another idempotent send.
          await db
            .update(request)
            .set({
              remoteRef: ref,
              connectionId: connection.id,
              sentAt: new Date(),
              fulfilmentState: "sent",
              fulfilmentError: null,
            })
            .where(
              and(
                eq(request.id, id),
                sql`${request.updatedAt} = ${loaded.version}::timestamptz`,
                eq(request.fulfilmentState, "queued"),
              ),
            )
          events.publish("requests", undefined)
          break
        } catch (cause) {
          if (signal.aborted) throw cause
          const transient =
            cause instanceof Error &&
            (cause.message === UNREACHABLE ||
              cause.message.includes("fetch failed") ||
              cause.message.includes("timed out"))
          if (!transient || attempt >= 3) throw cause
          await sleep(5000 * 2 ** attempt, undefined, { signal })
        }
      }
    } catch (cause) {
      if (signal.aborted) throw cause
      await failRequest(
        id,
        cause instanceof Error &&
          (cause.message.includes("fetch failed") ||
            cause.message.includes("timed out"))
          ? UNREACHABLE
          : cause instanceof Error
            ? cause.message
            : "Request delivery failed. Check the connection and retry.",
      )
    }
  },
})

export async function dispatchQueued() {
  const rows = await db
    .select({ id: request.id, approvedAt: request.approvedAt })
    .from(request)
    .where(
      and(
        eq(request.status, "approved"),
        eq(request.fulfilmentState, "queued"),
      ),
    )
  for (const row of rows) {
    const wait = (row.approvedAt?.getTime() ?? 0) + UNDO_MS - Date.now()
    if (wait <= 0) {
      dispatch.push(row.id)
    } else if (!held.has(row.id)) {
      held.add(row.id)
      // The job reads the request again, so one taken back in the
      // meantime is simply gone.
      void sleep(wait, undefined, { ref: false }).then(() => {
        held.delete(row.id)
        dispatch.push(row.id)
      })
    }
  }
}
