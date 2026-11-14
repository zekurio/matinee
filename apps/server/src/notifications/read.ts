import { notification, request } from "@matinee/db"
import { and, eq } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { inLibraries } from "../access/visible"
import { db } from "../db"
import { availability, ExternalIds } from "../requests/availability"

export async function readNotification(
  viewer: Viewer,
  row: typeof notification.$inferSelect,
) {
  const [snapshot] = row.requestId
    ? await db
        .select()
        .from(request)
        .where(
          and(
            eq(request.id, row.requestId),
            inLibraries(viewer, request.libraryId),
          ),
        )
    : []
  let title = null
  if (snapshot) {
    const ref = {
      kind: snapshot.kind,
      provider: snapshot.provider,
      providerId: snapshot.providerId,
    }
    const [state] = await availability(viewer, [
      {
        ref,
        libraryId: snapshot.libraryId,
        externalIds: ExternalIds.parse(snapshot.externalIds),
      },
    ])
    if (state)
      title = {
        ref,
        name: snapshot.name,
        year: snapshot.year,
        poster: null,
        availability: state.availability,
      }
  }
  return {
    id: row.id,
    kind: row.kind,
    title,
    season: row.season,
    count: row.count,
    createdAt: row.createdAt,
    readAt: row.readAt,
  }
}
