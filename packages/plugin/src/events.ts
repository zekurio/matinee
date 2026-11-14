import type { PluginCall } from "./call"

/** Current title names, read when the event is delivered. */
export type TitleRef = {
  id: string
  name: string
  year: number | null
  kind: "movie" | "show"
  library: { id: string; name: string }
  externalIds: Record<string, string>
}
/** The account involved, without tokens or profile secrets. */
export type UserRef = { id: string; username: string }
/** The media item involved. */
export type ItemRef = {
  id: string
  label: string
  season: number | null
  episode: number | null
}
/** Identifies one durable delivery. The id stays the same on every retry. */
export type PluginEventMeta = PluginCall & {
  id: string
  at: string
  attempt: number
}
/** Host events, delivered at least once in recorded order within each subject lane. */
export type PluginEvents = {
  "library.scanned": {
    library: { id: string; name: string }
    added: number
    removed: number
  }
  "title.added": { title: TitleRef }
  "title.matched": { title: TitleRef; provider: string; providerId: string }
  "playback.started": {
    user: UserRef
    title: TitleRef
    item: ItemRef
    positionSeconds: number
  }
  "playback.stopped": {
    user: UserRef
    title: TitleRef
    item: ItemRef
    positionSeconds: number
    durationSeconds: number | null
  }
  "playback.watched": {
    user: UserRef
    title: TitleRef
    item: ItemRef
    watched: boolean
  }
  "user.created": { user: UserRef & { role: "admin" | "user" } }
}
export type PluginEventName = keyof PluginEvents
export type PluginEventPayload<K extends PluginEventName> = PluginEvents[K]
