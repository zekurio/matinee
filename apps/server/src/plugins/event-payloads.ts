import { type PluginEventName } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  type JsonValue,
  episode,
  library,
  mediaItem,
  title,
  user,
  type MediaItemRow,
  type TitleRow,
} from "@matinee/db"
import { and, eq } from "drizzle-orm"

import { db } from "../db"
import { itemLabel } from "../media/item-label"

const Playback = { userId: t.uuid(), itemId: t.uuid() }
export const RecordedEventSchemas = {
  "library.scanned": t.object({
    libraryId: t.uuid(),
    added: t.number().int().min(0),
    removed: t.number().int().min(0),
  }),
  "title.added": t.object({ titleId: t.uuid() }),
  "title.matched": t.object({
    titleId: t.uuid(),
    provider: t.string(),
    providerId: t.string(),
  }),
  "playback.started": t.object({
    ...Playback,
    positionSeconds: t.number().min(0),
  }),
  "playback.stopped": t.object({
    ...Playback,
    positionSeconds: t.number().min(0),
    durationSeconds: t.number().min(0).nullable(),
  }),
  "playback.watched": t.object({ ...Playback, watched: t.boolean() }),
  "user.created": t.object({ userId: t.uuid() }),
}
export type RecordedEvents = {
  [K in PluginEventName]: t.infer<(typeof RecordedEventSchemas)[K]>
}

export function eventLane(
  name: PluginEventName,
  payload: Parameters<typeof hydrateEvent>[1],
): string {
  switch (name) {
    case "library.scanned":
      return `library:${RecordedEventSchemas[name].parse(payload).libraryId}`
    case "title.added":
    case "title.matched":
      return `title:${RecordedEventSchemas[name].parse(payload).titleId}`
    case "user.created":
    case "playback.started":
    case "playback.stopped":
    case "playback.watched":
      return `user:${RecordedEventSchemas[name].parse(payload).userId}`
  }
}

function titleRef(row: TitleRow, owning: { id: string; name: string }) {
  return {
    id: row.id,
    name: row.name,
    year: row.year,
    kind: row.kind,
    externalIds: row.externalIds,
    library: owning,
  }
}
function itemRef(
  row: MediaItemRow,
  owning: TitleRow,
  episodeName: string | null,
) {
  const episodic =
    owning.kind === "show" &&
    row.seasonNumber !== null &&
    row.episodeNumber !== null
  const label = itemLabel({
    ...row,
    fileTitle: row.title,
    title: {
      ...owning,
      images: { poster: null, backdrop: null, logo: null },
      favorite: false,
      watched: false,
    },
    episode:
      episodeName === null
        ? null
        : {
            name: episodeName,
            overview: null,
            airDate: null,
            runtimeMinutes: null,
            still: null,
          },
  })
  return {
    id: row.id,
    label: (episodic
      ? [label.code, label.title].filter(Boolean).join(" · ")
      : (label.title ?? label.show)
    ).slice(0, 1000),
    season: episodic ? row.seasonNumber : null,
    episode: episodic ? row.episodeNumber : null,
  }
}
async function hydrateTitle(titleId: string) {
  // ACCESS: An admin approved this plugin to receive title events without viewer filters.
  const [row] = await db
    .select({ title, library: { id: library.id, name: library.name } })
    .from(title)
    .innerJoin(library, eq(library.id, title.libraryId))
    .where(eq(title.id, titleId))
  return row ? { title: titleRef(row.title, row.library) } : null
}
async function hydrateLibrary(payload: RecordedEvents["library.scanned"]) {
  // ACCESS: An admin approved this plugin to receive library events without viewer filters.
  const [row] = await db
    .select({ id: library.id, name: library.name })
    .from(library)
    .where(eq(library.id, payload.libraryId))
  return row
    ? { library: row, added: payload.added, removed: payload.removed }
    : null
}
async function hydrateUser(payload: RecordedEvents["user.created"]) {
  const [row] = await db
    .select({ id: user.id, username: user.username, role: user.role })
    .from(user)
    .where(eq(user.id, payload.userId))
  return row ? { user: row } : null
}
async function hydratePlayback(payload: { userId: string; itemId: string }) {
  // ACCESS: An admin approved this plugin to receive playback events without viewer filters.
  const [row] = await db
    .select({
      episodeName: episode.name,
      item: mediaItem,
      title,
      library: { id: library.id, name: library.name },
      user: { id: user.id, username: user.username },
    })
    .from(mediaItem)
    .innerJoin(title, eq(title.id, mediaItem.titleId))
    .innerJoin(library, eq(library.id, title.libraryId))
    .leftJoin(
      episode,
      and(
        eq(episode.titleId, title.id),
        eq(episode.seasonNumber, mediaItem.seasonNumber),
        eq(episode.episodeNumber, mediaItem.episodeNumber),
      ),
    )
    .innerJoin(user, eq(user.id, payload.userId))
    .where(eq(mediaItem.id, payload.itemId))
  return row
    ? {
        user: row.user,
        title: titleRef(row.title, row.library),
        item: itemRef(row.item, row.title, row.episodeName),
        durationSeconds: row.item.durationSeconds,
      }
    : null
}

/** Parse the stored thin payload, then read its current names in one statement. */
export async function hydrateEvent(name: PluginEventName, payload: JsonValue) {
  // JSON from the table is untrusted, even though the host wrote it.
  switch (name) {
    case "library.scanned":
      return hydrateLibrary(RecordedEventSchemas[name].parse(payload))
    case "title.added":
      return hydrateTitle(RecordedEventSchemas[name].parse(payload).titleId)
    case "title.matched": {
      const thin = RecordedEventSchemas[name].parse(payload)
      const refs = await hydrateTitle(thin.titleId)
      return (
        refs && {
          ...refs,
          provider: thin.provider,
          providerId: thin.providerId,
        }
      )
    }
    case "user.created":
      return hydrateUser(RecordedEventSchemas[name].parse(payload))
    case "playback.started": {
      const thin = RecordedEventSchemas[name].parse(payload)
      const refs = await hydratePlayback(thin)
      return (
        refs && {
          user: refs.user,
          title: refs.title,
          item: refs.item,
          positionSeconds: thin.positionSeconds,
        }
      )
    }
    case "playback.stopped": {
      const thin = RecordedEventSchemas[name].parse(payload)
      const refs = await hydratePlayback(thin)
      return (
        refs && {
          ...refs,
          positionSeconds: thin.positionSeconds,
          durationSeconds: thin.durationSeconds ?? refs.durationSeconds,
        }
      )
    }
    case "playback.watched": {
      const thin = RecordedEventSchemas[name].parse(payload)
      const refs = await hydratePlayback(thin)
      return (
        refs && {
          user: refs.user,
          title: refs.title,
          item: refs.item,
          watched: thin.watched,
        }
      )
    }
  }
}
