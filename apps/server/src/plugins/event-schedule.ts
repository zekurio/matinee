/**
 * What to deliver next to one plugin, as plain functions over plain data:
 * no database and no timers, so `scripts/plugin-events-check.ts` can run
 * them against a clock of its own.
 */

export const EVENT_DAY = 24 * 60 * 60_000
export const MAX_PENDING = 5000
const BACKOFF = [5000, 30000, 120000, 600000, 1800000]
/** The wait after a failure, by how many there were in a row. */
export function eventBackoff(failures: number): number {
  return (
    BACKOFF[Math.min(Math.max(0, failures - 1), BACKOFF.length - 1)] ?? 1800000
  )
}
export type ScheduledEvent = {
  id: bigint
  lane: string
  attempts: number
  retryAt: Date | null
  createdAt: Date
}
/**
 * What the last deliveries say about the plugin. A failure may be the
 * event's fault or the plugin's, and the two are told apart by what
 * failed. An event failing again says little. An event failing on its
 * first try, right after others failed, says the plugin's other end is
 * down. So there are two counts and two waits: events that failed before
 * wait out every failure, and events that never failed only wait out the
 * failures of their kind. One bad event then can't hold up the events
 * behind it in other lanes, however often it is tried.
 */
export type ProbeState = {
  /** Failures since the last success. Above zero, one delivery at a time. */
  strikes: number
  /** Of those, first tries of an event. */
  fresh: number
  /** Counts deliveries as they start, to order them against failures. */
  sequence: number
  /** The delivery count when the last failure was taken in. */
  lastStrike: number
  /** No event that failed before is tried again before this. */
  pauseUntil: number
  /** No event at all is tried before this. */
  freshPauseUntil: number
}
export function newProbeState(): ProbeState {
  return {
    strikes: 0,
    fresh: 0,
    sequence: 0,
    lastStrike: 0,
    pauseUntil: 0,
    freshPauseUntil: 0,
  }
}
/**
 * A delivery failed. `started` is the count when it began, and `first`
 * whether the event had never failed before. A delivery that was already
 * under way when the last failure came in adds nothing: four that fail
 * together are one piece of news.
 */
export function eventFailed(
  state: ProbeState,
  started: number,
  now: number,
  first: boolean,
): void {
  if (started <= state.lastStrike) return
  state.lastStrike = state.sequence
  state.strikes++
  state.pauseUntil = now + eventBackoff(state.strikes)
  if (!first) return
  state.fresh++
  state.freshPauseUntil = now + eventBackoff(state.fresh)
}
export function eventSucceeded(state: ProbeState): void {
  state.strikes = 0
  state.fresh = 0
  state.pauseUntil = 0
  state.freshPauseUntil = 0
}
/** Hold everything for a moment, as after a sandbox that went away. */
export function eventsPaused(state: ProbeState, until: number): void {
  state.pauseUntil = Math.max(state.pauseUntil, until)
  state.freshPauseUntil = Math.max(state.freshPauseUntil, until)
}
/**
 * Whether nothing gets through: two events in a row failed on their first
 * try, or everything that waits has failed and keeps failing.
 */
export function eventsBlocked(state: ProbeState, failing: number): boolean {
  return state.fresh >= 2 || (state.strikes >= 2 && failing >= 2)
}
/**
 * The events to start now, and when to look again if there are none.
 * `rows` may be all waiting events or just the oldest of each lane.
 */
export function scheduleEvents<T extends ScheduledEvent>(
  rows: readonly T[],
  inFlight: ReadonlySet<string>,
  state: ProbeState,
  now: number,
) {
  const heads = new Map<string, T>()
  for (const row of rows) {
    const old = heads.get(row.lane)
    if (!old || row.id < old.id) heads.set(row.lane, row)
  }
  const candidates = [...heads.values()].filter(
    (row) => !inFlight.has(row.lane),
  )
  /** When the event may be tried: its own retry, and the plugin's wait. */
  const from = (row: T) =>
    Math.max(
      row.retryAt?.getTime() ?? 0,
      row.attempts === 0 ? state.freshPauseUntil : state.pauseUntil,
    )
  const due = candidates.filter((row) => from(row) <= now)
  due.sort((a, b) => {
    // While probing, an event that never failed says more about the plugin.
    if (state.strikes && (a.attempts === 0) !== (b.attempts === 0))
      return a.attempts === 0 ? -1 : 1
    return a.id < b.id ? -1 : 1
  })
  const limit = state.strikes
    ? inFlight.size
      ? 0
      : 1
    : Math.max(0, 4 - inFlight.size)
  const times = candidates.map((row) => Math.max(now, from(row)))
  return {
    ready: due.slice(0, limit),
    wakeAt: times.length ? Math.min(...times) : null,
  }
}
