// What `event-schedule.ts` decides, against a clock of our own.
import assert from "node:assert/strict"

import {
  eventBackoff,
  eventFailed,
  eventsBlocked,
  eventsPaused,
  eventSucceeded,
  newProbeState,
  scheduleEvents,
  type ProbeState,
  type ScheduledEvent,
} from "../src/plugins/event-schedule"

const row = (
  id: number,
  lane = String(id),
  attempts = 0,
  retryAt: number | null = null,
): ScheduledEvent => ({
  id: BigInt(id),
  lane,
  attempts,
  retryAt: retryAt === null ? null : new Date(retryAt),
  createdAt: new Date(0),
})
const ready = (
  rows: ScheduledEvent[],
  state: ProbeState,
  now: number,
  inFlight: string[] = [],
) => scheduleEvents(rows, new Set(inFlight), state, now).ready.map((r) => r.id)
/** One delivery of the plugin starts and fails. */
const fail = (state: ProbeState, now: number, first: boolean) =>
  eventFailed(state, ++state.sequence, now, first)
function check(name: string, run: () => void) {
  run()
  process.stdout.write(`ok ${name}\n`)
}

check("four at once, never two of one lane, lane order kept", () => {
  const state = newProbeState()
  const rows = [row(1, "a"), row(2, "a"), row(3), row(4), row(5), row(6)]
  assert.deepEqual(ready(rows, state, 0), [1n, 3n, 4n, 5n])
  assert.deepEqual(ready(rows, state, 0, ["a", "3"]), [4n, 5n])
  assert.deepEqual(ready(rows, state, 0, ["a", "3", "4", "5"]), [])
  // The second of a lane only after the first is gone.
  assert.deepEqual(ready(rows.slice(1), state, 0), [2n, 3n, 4n, 5n])
})

check("failures that were under way together are one piece of news", () => {
  const state = newProbeState()
  state.sequence = 4
  eventFailed(state, 1, 0, true)
  eventFailed(state, 2, 0, true)
  eventFailed(state, 3, 0, true)
  assert.equal(state.strikes, 1)
  assert.equal(state.fresh, 1)
  assert.equal(state.freshPauseUntil, 5000)
})

check("one bad event: its lane waits and the others flow", () => {
  const state = newProbeState()
  let now = 0
  fail(state, now, true)
  // Its own retry is in 5 s, and so is the next try of anything.
  const rows = [row(1, "a", 1, 5000), row(2, "a"), row(3), row(4), row(5)]
  assert.deepEqual(ready(rows, state, now), [])
  assert.equal(scheduleEvents(rows, new Set(), state, now).wakeAt, 5000)
  now = 5000
  // One at a time, and an event that never failed before the bad one.
  assert.deepEqual(ready(rows, state, now), [3n])
  eventSucceeded(state)
  assert.deepEqual(ready(rows, state, now), [1n, 3n, 4n, 5n])
})

check("a bad event tried again and again never holds a new event up", () => {
  const state = newProbeState()
  let now = 0
  fail(state, now, true)
  // Alone, it fails on every retry for hours.
  for (let attempt = 2; attempt <= 12; attempt++) {
    now += eventBackoff(attempt - 1)
    fail(state, now, false)
  }
  assert.equal(state.strikes, 12)
  assert.equal(state.fresh, 1)
  // It waits half an hour for its next try. An event that just happened
  // doesn't wait at all.
  const bad = row(1, "a", 12, now + eventBackoff(12))
  assert.deepEqual(ready([bad, row(2)], state, now), [2n])
  assert(!eventsBlocked(state, 1))
  eventSucceeded(state)
  assert.equal(state.strikes, 0)
})

check("a dead receiver gets one try per pause, and the pauses grow", () => {
  const state = newProbeState()
  const rows = Array.from({ length: 50 }, (_, i) => row(i + 1))
  let now = 0
  for (let strike = 1; strike <= 7; strike++) {
    fail(state, now, true)
    assert.equal(state.fresh, strike)
    const pause = eventBackoff(strike)
    assert.equal(ready(rows, state, now + pause - 1).length, 0)
    now += pause
    assert.equal(ready(rows, state, now).length, 1)
    // Nothing more while that one is under way.
    assert.equal(ready(rows, state, now, ["1"]).length, 0)
  }
  assert.equal(eventBackoff(7), 1800000)
  assert(eventsBlocked(state, 7))
  eventSucceeded(state)
  assert.equal(ready(rows, state, now).length, 4)
})

check("with only failed events waiting, their retries are probes too", () => {
  // As after a restart, which forgets the counts: everything waiting has
  // failed before and the receiver is still down.
  const state = newProbeState()
  let now = 0
  const rows = Array.from({ length: 20 }, (_, i) => row(i + 1, undefined, 3, 0))
  assert.equal(ready(rows, state, now).length, 4)
  state.sequence = 4
  for (let started = 1; started <= 4; started++)
    eventFailed(state, started, now, false)
  assert.equal(state.strikes, 1)
  assert(!eventsBlocked(state, 20))
  for (let strike = 2; strike <= 6; strike++) {
    now = state.pauseUntil
    assert.equal(ready(rows, state, now - 1).length, 0)
    assert.equal(ready(rows, state, now).length, 1)
    fail(state, now, false)
    assert.equal(state.pauseUntil, now + eventBackoff(strike))
  }
  assert(eventsBlocked(state, 20))
})

check("a lane held by a failing event doesn't hide the other lanes", () => {
  const state = newProbeState()
  const held = Array.from({ length: 1000 }, (_, i) =>
    row(i + 1, "held", i === 0 ? 1 : 0, i === 0 ? 10000 : null),
  )
  assert.deepEqual(ready([...held, row(1001, "free")], state, 0), [1001n])
  assert.equal(scheduleEvents(held, new Set(), state, 0).wakeAt, 10000)
})

check("a sandbox that went away holds everything for a moment", () => {
  const state = newProbeState()
  eventsPaused(state, 5000)
  assert.equal(state.strikes, 0)
  assert.deepEqual(ready([row(1), row(2, "b", 2, 0)], state, 4999), [])
  assert.deepEqual(ready([row(1), row(2, "b", 2, 0)], state, 5000), [1n, 2n])
})

check("what counts as nothing getting through", () => {
  const state = newProbeState()
  fail(state, 0, true)
  assert(!eventsBlocked(state, 1))
  fail(state, 5000, true)
  assert(eventsBlocked(state, 2))
  eventSucceeded(state)
  assert(!eventsBlocked(state, 2))
})

process.stdout.write("Plugin event schedule checks passed\n")
