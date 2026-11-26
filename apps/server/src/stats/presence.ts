import type { PlaybackPresence } from "@matinee/contracts"
import { playbackSession } from "@matinee/db"
import { and, eq, isNotNull, isNull } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { events, shuttingDown, streamSignal } from "../realtime/events"
import { LEFT_GRACE_SECONDS, mayGoLive } from "./live"

/*
 * Players hold a `playback.presence` stream open while they show a
 * session. When the last one for a session closes, `leftAt` takes the
 * time, and the session stops counting as live `LEFT_GRACE_SECONDS`
 * later; one that opens again clears it, unless the session dropped out
 * already and the account plays on as many devices as it may: then the
 * mark stays, and the session's next report is refused. A report or a
 * stream while none is open moves the mark to its time (see
 * `presenceOpen`). The count is per user and session, so an old
 * connection that closes after its replacement opened changes nothing,
 * and another user's id never touches the row. It lives in memory: after
 * a restart, players open their connections again.
 */

type Presence = {
  open: number
  /** The last write of `leftAt`. Writes run in order, so the last one wins. */
  writing: Promise<void>
}

const presences = new Map<string, Presence>()

/** Whether a presence connection for `userId`'s session `sessionId` is open. */
export function presenceOpen(userId: string, sessionId: string): boolean {
  return (presences.get(`${userId}:${sessionId}`)?.open ?? 0) > 0
}

/**
 * Write whether the player is there, by the connections open when it
 * runs. Coming back takes a place under the stream `limit`.
 */
function sync(
  key: string,
  entry: Presence,
  userId: string,
  sessionId: string,
  limit: number | null,
) {
  const write = async () => {
    // Shutdown ends every stream at once, and no player left. One that
    // doesn't come back after the restart goes by its reports.
    if (shuttingDown()) return
    const here = entry.open > 0
    const changed = await db
      .update(playbackSession)
      .set({ leftAt: here ? null : new Date() })
      .where(
        and(
          eq(playbackSession.id, sessionId),
          eq(playbackSession.userId, userId),
          // Leaving keeps the first drop's time.
          here
            ? and(
                isNotNull(playbackSession.leftAt),
                mayGoLive(userId, sessionId, limit),
              )
            : isNull(playbackSession.leftAt),
        ),
      )
      .returning({ id: playbackSession.id })
    // Leaving changes nothing for `LEFT_GRACE_SECONDS`, and watching now
    // loads again on its own, so only a return is news.
    if (here && changed.length > 0) events.publish("playback", undefined)
  }
  const next = entry.writing.then(write).catch((cause: unknown) => {
    log.warn("Couldn't record a player's presence", cause)
  })
  entry.writing = next
  void next.finally(() => {
    if (entry.open === 0 && entry.writing === next) presences.delete(key)
  })
}

/**
 * Hold `userId`'s session `sessionId` as there until the stream ends,
 * within the account's stream `limit`.
 */
export async function* holdPresence(
  userId: string,
  sessionId: string,
  limit: number | null,
  request: AbortSignal | undefined,
): AsyncGenerator<PlaybackPresence, void, void> {
  const signal = streamSignal(request)
  const key = `${userId}:${sessionId}`
  let entry = presences.get(key)
  if (!entry) {
    entry = { open: 0, writing: Promise.resolve() }
    presences.set(key, entry)
  }
  entry.open++
  if (entry.open === 1) sync(key, entry, userId, sessionId, limit)
  let stop: (() => void) | undefined
  try {
    yield { graceSeconds: LEFT_GRACE_SECONDS }
    await new Promise<void>((resolve) => {
      stop = () => resolve()
      if (signal.aborted) resolve()
      else signal.addEventListener("abort", stop, { once: true })
    })
  } finally {
    if (stop) signal.removeEventListener("abort", stop)
    entry.open--
    if (entry.open === 0) sync(key, entry, userId, sessionId, limit)
  }
}
