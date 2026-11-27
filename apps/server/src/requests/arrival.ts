import { mediaItem, request, requestSeason, title } from "@matinee/db"
import { and, eq, isNull, ne, or, sql } from "drizzle-orm"

import { db } from "../db"
import { defineQueue } from "../jobs/queue"
import { events } from "../realtime/events"
import { ExternalIds } from "./availability"
import { clearProgress } from "./progress"

export const arrivals = defineQueue({
  id: "request-arrival",
  name: "Request arrivals",
  description: "Match library arrivals to their requests.",
  concurrency: 1,
  key: (libraryId: string | null) => libraryId ?? "all",
  label: (libraryId) => libraryId ?? "All libraries",
  joinsRunning: () => false,
  run: async (libraryId) => {
    // Accepted requests, and those given up for want of a copy: the
    // library decides, so one whose file turns up anyway has arrived.
    // Only the ones with something still to come, a film that hasn't
    // arrived or a show with a season that hasn't, so a run costs what is
    // on its way and not every request there ever was.
    const waiting = db
      .select({ one: sql`1` })
      .from(requestSeason)
      .where(
        and(
          eq(requestSeason.requestId, request.id),
          isNull(requestSeason.arrivedAt),
        ),
      )
    const rows = await db
      .select()
      .from(request)
      .where(
        and(
          or(
            eq(request.status, "approved"),
            and(
              eq(request.status, "declined"),
              eq(request.declineReason, "notFound"),
            ),
          ),
          or(
            and(eq(request.kind, "movie"), isNull(request.arrivedAt)),
            and(ne(request.kind, "movie"), sql`exists ${waiting}`),
          ),
          libraryId ? eq(request.libraryId, libraryId) : undefined,
        ),
      )
    for (const row of rows) {
      const ids = ExternalIds.parse(row.externalIds)
      ids[row.provider] = row.providerId
      // ACCESS: background reconciliation is restricted to the request's destination library.
      const files = await db
        .select({
          season: mediaItem.seasonNumber,
          episode: mediaItem.episodeNumber,
          addedAt: mediaItem.createdAt,
        })
        .from(title)
        .innerJoin(mediaItem, eq(mediaItem.titleId, title.id))
        .where(
          and(
            eq(title.libraryId, row.libraryId),
            eq(title.kind, row.kind),
            or(
              and(
                eq(title.provider, row.provider),
                eq(title.providerId, row.providerId),
              ),
              ...Object.entries(ids).map(
                ([site, id]) =>
                  sql`${title.externalIds} @> ${JSON.stringify({ [site]: id })}::jsonb`,
              ),
            ),
          ),
        )
      if (!files.length) continue
      if (row.kind === "movie") {
        const updated = await db
          .update(request)
          .set({ arrivedAt: new Date(), ...takeBack(row) })
          .where(and(eq(request.id, row.id), isNull(request.arrivedAt)))
          .returning({ id: request.id })
        if (!updated.length) continue
        clearProgress(row.id)
        events.publish("requests", undefined)
      } else {
        const scope = await db
          .select()
          .from(requestSeason)
          .where(eq(requestSeason.requestId, row.id))
        for (const number of new Set(
          files.flatMap((file) =>
            file.season !== null && file.episode !== null ? [file.season] : [],
          ),
        )) {
          const asked = scope.find((season) => season.number === number)
          // Only the seasons asked for arrive; a request never grows.
          if (!asked) continue
          // A season that was partly here when it was asked for arrives
          // with its first new episode, not with the ones already here.
          const fresh = files.some(
            (file) =>
              file.season === number &&
              file.episode !== null &&
              file.addedAt > asked.createdAt,
          )
          if (!fresh) continue
          const updated = await db
            .update(requestSeason)
            .set({ arrivedAt: new Date() })
            .where(
              and(
                eq(requestSeason.requestId, row.id),
                eq(requestSeason.number, number),
                isNull(requestSeason.arrivedAt),
              ),
            )
            .returning({ number: requestSeason.number })
          if (!updated.length) continue
          if (row.status === "declined") {
            await db
              .update(request)
              .set(takeBack(row))
              .where(
                and(eq(request.id, row.id), eq(request.status, "declined")),
              )
            row.status = "approved"
          }
          clearProgress(row.id, number)
          clearProgress(row.id, null)
          events.publish("requests", undefined)
        }
      }
    }
  },
})

/**
 * What takes back the decline of a request given up on whose file came
 * anyway: accepted again, and sent as far as anyone needs to know.
 */
function takeBack(row: typeof request.$inferSelect) {
  if (row.status !== "declined") return {}
  return {
    status: "approved" as const,
    fulfilmentState: "sent" as const,
    fulfilmentError: null,
    declineReason: null,
    declineNote: null,
    declinedBy: null,
    declinedAt: null,
    updatedAt: new Date(),
  }
}

export function libraryChanged(libraryId: string) {
  events.publish("library", undefined)
  arrivals.push(libraryId)
}
