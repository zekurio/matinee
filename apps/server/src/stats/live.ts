import { PLAYBACK_BUSY, type PlaybackBusyData } from "@matinee/contracts"
import { playbackSession } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { and, count, eq, gt, isNull, ne, or, type SQL, sql } from "drizzle-orm"

import { db } from "../db"

/*
 * What counts as playing now, for watching now and the account's stream
 * limit. Both `sessions.ts` and `presence.ts` read it, so it lives apart
 * from either.
 */

// Playing reports arrive every ten seconds, paused ones every thirty.
// Hidden tabs may slow their timers to once a minute.
const LIVE_SECONDS = 45
const PAUSED_LIVE_SECONDS = 120
/**
 * How long a session stays live after its player's last presence
 * connection drops, for the player to open a new one: when the server
 * ends the stream, after a network blip, or across a reload. A report or
 * a stream while no connection is open gives it this long again.
 */
export const LEFT_GRACE_SECONDS = 10

/**
 * Of the row `playbackSession` names, whether it plays now. Ended offline
 * plays stay out, and so do sessions whose player left, by its presence
 * connection, more than `LEFT_GRACE_SECONDS` ago.
 */
export function liveSessions(): SQL | undefined {
  return and(
    isNull(playbackSession.endedAt),
    or(
      isNull(playbackSession.leftAt),
      gt(
        playbackSession.leftAt,
        sql`now() - make_interval(secs => ${LEFT_GRACE_SECONDS})`,
      ),
    ),
    or(
      gt(
        playbackSession.updatedAt,
        sql`now() - make_interval(secs => ${LIVE_SECONDS})`,
      ),
      and(
        eq(playbackSession.paused, true),
        gt(
          playbackSession.updatedAt,
          sql`now() - make_interval(secs => ${PAUSED_LIVE_SECONDS})`,
        ),
      ),
    ),
  )
}

/** The user's sessions playing now, other than `sessionId`. */
function othersLive(userId: string, sessionId: string) {
  return db
    .select({ total: count() })
    .from(playbackSession)
    .where(
      and(
        liveSessions(),
        eq(playbackSession.userId, userId),
        ne(playbackSession.id, sessionId),
      ),
    )
}

/** Other sittings playing now, so changing this sitting's tracks never takes a place. */
export async function otherLiveSessions(
  userId: string,
  sessionId: string,
): Promise<number> {
  const [row] = await othersLive(userId, sessionId)
  return row?.total ?? 0
}

/**
 * For a write to the row of `userId`'s session `sessionId`: the row may
 * count as playing after it. One that plays now always may, without
 * counting the others; one that doesn't, only while the account's other
 * sessions are under `limit`. No condition without a limit.
 *
 * Like `playback.start`'s check, it isn't atomic: two sessions that come
 * back at the same moment can both see a place free.
 */
export function mayGoLive(
  userId: string,
  sessionId: string,
  limit: number | null,
): SQL | undefined {
  if (limit === null) return undefined
  // The subquery names the table again, so inside it the columns are its
  // own rows; outside, `liveSessions()` reads the row being written.
  return or(liveSessions(), sql`(${othersLive(userId, sessionId)}) < ${limit}`)
}

/** The account plays on as many devices as it may; `playing` of them. */
export function streamsBusy(
  data: PlaybackBusyData,
): ORPCError<typeof PLAYBACK_BUSY, PlaybackBusyData> {
  const { playing } = data
  return new ORPCError(PLAYBACK_BUSY, {
    status: 429,
    message: `Your account is playing on ${playing} ${playing === 1 ? "device" : "devices"}, the most it may. Stop one to watch here.`,
    data,
  })
}
