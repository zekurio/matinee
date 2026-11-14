import { RemoteRef } from "@matinee/contracts"
import { request, requestSeason } from "@matinee/db"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "../db"
import { defineQueue } from "../jobs/queue"
import { events } from "../realtime/events"
import { failRequest } from "./dispatch"
import {
  connectionById,
  getSource,
  resolveConnection,
} from "./fulfilment/connections"
import { clearProgress, setDiagnostics, setProgress } from "./progress"

async function activeRequests() {
  const rows = await db
    .select()
    .from(request)
    .where(
      and(eq(request.status, "approved"), eq(request.fulfilmentState, "sent")),
    )
  const pending = await db
    .select()
    .from(requestSeason)
    .where(isNull(requestSeason.arrivedAt))
  return rows.filter((row) =>
    row.kind === "movie"
      ? !row.arrivedAt
      : row.future || pending.some((season) => season.requestId === row.id),
  )
}

export const progressPolls = defineQueue({
  id: "request-progress",
  name: "Request progress",
  description: "Check progress for titles on their way.",
  concurrency: 1,
  key: (id: string) => id,
  label: (id) => id,
  run: async (id) => {
    const rows = (await activeRequests()).filter(
      (row) => row.connectionId === id,
    )
    if (!rows.length) return
    const connection = await connectionById(id)
    const source = getSource(connection.source)
    if (!source.progress) return
    const arrived = await db.select().from(requestSeason)
    const values = await source.progress(
      resolveConnection(connection),
      rows.flatMap((row) =>
        row.remoteRef
          ? [{ requestId: row.id, ref: RemoteRef.parse(row.remoteRef) }]
          : [],
      ),
    )
    let changed = false
    for (const value of values) {
      const row = rows.find((row) => row.id === value.requestId)
      if (!row) continue
      if (
        value.season !== null &&
        arrived.some(
          (season) =>
            season.requestId === row.id &&
            season.number === value.season &&
            season.arrivedAt,
        )
      )
        continue
      if (value.problem) {
        clearProgress(row.id)
        await failRequest(row.id, value.problem)
        continue
      }
      setDiagnostics(row.id, value.diagnostics)
      changed =
        setProgress(
          row.id,
          {
            progress: value.fraction,
            etaSeconds: value.etaSeconds,
            waitingForRelease: value.waitingForRelease,
            releaseDate: value.releaseDate,
            stillLooking:
              value.stillLooking &&
              !!row.sentAt &&
              Date.now() - row.sentAt.getTime() >= 86400000,
          },
          value.season,
        ) || changed
    }
    if (changed) events.publish("requests", undefined)
  },
})
export async function pollProgress() {
  for (const id of new Set(
    (await activeRequests()).flatMap((row) =>
      row.connectionId ? [row.connectionId] : [],
    ),
  ))
    progressPolls.push(id)
}
