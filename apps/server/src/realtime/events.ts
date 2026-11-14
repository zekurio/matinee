import { EventPublisher } from "@orpc/server"

/*
 * In-process events, for procedures that stream to clients. Code that
 * changes something publishes its topic; streams that show it listen.
 * The server is one process, so memory is enough. Running several would
 * need Postgres LISTEN/NOTIFY behind the same calls.
 */

/**
 * Topics and what each carries. A topic that only says something changed
 * carries nothing, and its listeners load what they show again. One that
 * clients follow event by event, like a watch party's play and pause,
 * carries the event.
 */
export type Topics = {
  /** Request status, followers, scope or in-memory progress changed. */
  requests: undefined
  /** Scan or metadata matching changed library identity or playable files. */
  library: undefined
  /** Stored notification rows or read state changed. Reload per viewer. */
  notifications: undefined
  /** Connections or per-library mappings changed. */
  fulfilment: undefined
  /** A playback session reported, or a stream started or stopped. */
  playback: undefined
  /** A watch party changed: its members, its file, where it is, its queue. */
  party: undefined
  /** A file's trickplay images were made, or couldn't be. */
  trickplay: undefined
}

export type Topic = keyof Topics

export const events = new EventPublisher<Topics>()

// Streams end after this, and the client opens a new one. Its request
// checks the session again, so a revoked one or a demoted admin stops
// getting updates.
const STREAM_MAX_MS = 10 * 60_000

const closing = new AbortController()

/**
 * What a stream ends on: its request ending, the server shutting down
 * (open streams keep it from closing), or `STREAM_MAX_MS` passing. Use it
 * for every stream, including `events.subscribe(topic, { signal })`.
 */
export function streamSignal(request: AbortSignal | undefined): AbortSignal {
  return AbortSignal.any([
    closing.signal,
    AbortSignal.timeout(STREAM_MAX_MS),
    ...(request ? [request] : []),
  ])
}

/** End every stream, for shutdown. */
export function stopStreams(): void {
  closing.abort()
}
