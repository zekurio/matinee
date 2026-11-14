import { PluginEventName, PluginEventSchemas } from "@matinee/contracts"
import { pluginEvent, type PluginEventRow } from "@matinee/db"
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  min,
  notInArray,
  or,
  sql,
} from "drizzle-orm"

import type { Tx } from "../auth/users"
import { db } from "../db"
import { defineQueue } from "../jobs/queue"
import { log } from "../log"
import { events } from "../realtime/events"
import {
  eventLane,
  hydrateEvent,
  RecordedEventSchemas,
  type RecordedEvents,
} from "./event-payloads"
import {
  EVENT_DAY as DAY,
  MAX_PENDING,
  eventBackoff,
  eventFailed,
  eventsBlocked,
  eventsPaused,
  eventSucceeded,
  newProbeState,
  scheduleEvents,
} from "./event-schedule"
import { errorText, files } from "./files"
import { pluginLog } from "./logs"
import {
  callHandler,
  eventRecorders,
  eventSubscribers,
  onAvailabilityChanged,
} from "./runtime"
import { SandboxError } from "./sandbox"

const probes = new Map<string, ReturnType<typeof newProbeState>>()
function probe(id: string) {
  let state = probes.get(id)
  if (!state) {
    state = newProbeState()
    probes.set(id, state)
  }
  return state
}
type Delivery = {
  pending: number
  failing: number
  blocked: boolean
  retryAt: Date | null
  error: string | null
  attempts: number
  expiresAt: Date | null
}
const NOTHING: Delivery = {
  pending: 0,
  failing: 0,
  blocked: false,
  retryAt: null,
  error: null,
  attempts: 0,
  expiresAt: null,
}
const status = new Map<string, Delivery>()
const timers = new Set<NodeJS.Timeout>()
const retries = new Map<string, NodeJS.Timeout>()
let stopped = true
let changedTimer: NodeJS.Timeout | undefined

function later(run: () => void, ms: number): NodeJS.Timeout {
  const timer = setTimeout(() => {
    timers.delete(timer)
    if (!stopped) run()
  }, ms).unref()
  timers.add(timer)
  return timer
}
function changed(): void {
  if (stopped || changedTimer) return
  changedTimer = later(() => {
    changedTimer = undefined
    events.publish("plugins", undefined)
  }, 250)
}
/** Whether the event is recorded for any plugin. */
export function pluginsListenFor(name: PluginEventName): boolean {
  return eventRecorders(name).length > 0
}
/** How delivery to a plugin stands, for the admin view. */
export function eventDelivery(id: string): Delivery | null {
  if (!files.get(id)?.manifest?.contributes.events.length) return null
  return status.get(id) ?? NOTHING
}
/**
 * How delivery to a plugin stands, counted in the database. A plugin can
 * have thousands of events waiting, so nothing here reads them one by one.
 */
async function refresh(id: string): Promise<void> {
  const failed = gt(pluginEvent.attempts, 0)
  const [counts] = await db
    .select({
      pending: count(),
      failing: sql<number>`count(*) filter (where ${failed})`.mapWith(Number),
      retryAt:
        sql<Date | null>`min(${pluginEvent.retryAt}) filter (where ${failed})`.mapWith(
          pluginEvent.retryAt,
        ),
    })
    .from(pluginEvent)
    .where(eq(pluginEvent.pluginId, id))
  const [oldest] = counts?.failing
    ? await db
        .select({
          error: pluginEvent.error,
          attempts: pluginEvent.attempts,
          createdAt: pluginEvent.createdAt,
        })
        .from(pluginEvent)
        .where(and(eq(pluginEvent.pluginId, id), failed))
        .orderBy(pluginEvent.id)
        .limit(1)
    : []
  const state = probe(id)
  const pending = counts?.pending ?? 0
  const failing = counts?.failing ?? 0
  const blocked = pending > 0 && eventsBlocked(state, failing)
  // While nothing gets through, the next try is the next probe: an event
  // that hasn't failed yet if one waits, else the first that may be tried
  // again.
  const probeAt =
    pending > failing
      ? state.freshPauseUntil
      : Math.max(state.pauseUntil, counts?.retryAt?.getTime() ?? 0)
  const next: Delivery = {
    pending,
    failing,
    blocked,
    retryAt: blocked ? new Date(probeAt) : (counts?.retryAt ?? null),
    error: oldest?.error ?? null,
    attempts: oldest?.attempts ?? 0,
    expiresAt: oldest ? new Date(oldest.createdAt.getTime() + DAY) : null,
  }
  const before = status.get(id)
  status.set(id, next)
  if (
    before?.pending !== next.pending ||
    before?.failing !== next.failing ||
    before?.blocked !== next.blocked ||
    before?.retryAt?.getTime() !== next.retryAt?.getTime() ||
    before?.error !== next.error ||
    before?.attempts !== next.attempts ||
    before?.expiresAt?.getTime() !== next.expiresAt?.getTime()
  )
    changed()
}
function refreshSoon(id: string): void {
  void refresh(id).catch((cause) =>
    log.warn("Couldn't read plugin event delivery", cause),
  )
}
function request(id: string): void {
  if (!stopped) deliveries.push(id)
}
function retry(id: string, at: Date): void {
  const previous = retries.get(id)
  if (previous) {
    clearTimeout(previous)
    timers.delete(previous)
  }
  if (stopped) return
  retries.set(
    id,
    later(
      () => {
        retries.delete(id)
        request(id)
      },
      Math.max(0, at.getTime() - Date.now()),
    ),
  )
}

/** No listeners means no statements. Savepoints keep an event failure out of the domain transaction. */
export async function recordPluginEvents<K extends PluginEventName>(
  executor: typeof db | Tx,
  name: K,
  payloads: readonly RecordedEvents[K][],
): Promise<void> {
  const subscribers = eventRecorders(name)
  if (stopped || subscribers.length === 0 || payloads.length === 0) return
  try {
    const values = payloads.flatMap((payload) => {
      const parsed = RecordedEventSchemas[name].parse(payload)
      return subscribers.map((pluginId) => ({
        pluginId,
        name,
        lane: eventLane(name, parsed),
        payload: parsed,
      }))
    })
    const insert = async (writer: Pick<typeof db, "insert">) => {
      for (let start = 0; start < values.length; start += 300)
        await writer
          .insert(pluginEvent)
          .values(values.slice(start, start + 300))
    }
    // A failed statement aborts a Postgres transaction. A nested Drizzle
    // transaction rolls back only the savepoint before we catch the error.
    if ("rollback" in executor) await executor.transaction(insert)
    else await insert(executor)
    for (const id of subscribers) {
      later(() => {
        request(id)
        refreshSoon(id)
      }, 25)
      // The first read may precede the caller's commit. The task catches
      // transactions that take longer than this second look.
      later(() => {
        request(id)
        refreshSoon(id)
      }, 3000)
    }
  } catch (cause) {
    log.warn(`Couldn't record plugin event ${name}`, cause)
  }
}
export async function recordPluginEvent<K extends PluginEventName>(
  executor: typeof db | Tx,
  name: K,
  payload: RecordedEvents[K],
): Promise<void> {
  await recordPluginEvents(executor, name, [payload])
}

/** An abort leaves the row untouched and tells the handler through its signal. */
async function invoke(
  row: PluginEventRow,
  payload: Parameters<typeof callHandler>[2][number],
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  await callHandler(
    row.pluginId,
    `events.${row.name}`,
    [
      payload,
      {
        id: row.id.toString(),
        at: row.createdAt.toISOString(),
        attempt: row.attempts + 1,
      },
    ],
    { timeoutMs: 30000, signal },
  )
}
async function deliverOne(
  row: PluginEventRow,
  signal: AbortSignal,
): Promise<void> {
  const id = row.pluginId
  const state = probe(id)
  const started = ++state.sequence
  const name = PluginEventName.safeParse(row.name)
  if (!name.success) {
    log.warn(`Invalid stored plugin event name ${row.name}`)
    await db.delete(pluginEvent).where(eq(pluginEvent.id, row.id))
    return
  }
  // An update can drop an event from a plugin's manifest. What was
  // recorded for it before has nowhere to go.
  if (!files.get(id)?.manifest?.contributes.events.includes(name.data)) {
    await db.delete(pluginEvent).where(eq(pluginEvent.id, row.id))
    return
  }
  // The plugin is off or failed. Its events wait.
  if (!eventSubscribers(name.data).includes(id)) return
  if (Date.now() - row.createdAt.getTime() >= DAY) {
    await db.delete(pluginEvent).where(eq(pluginEvent.id, row.id))
    pluginLog(id, "warn", "Gave up on 1 plugin event older than 24 hours.")
    return
  }
  if (row.retryAt && row.retryAt.getTime() > Date.now()) {
    retry(id, row.retryAt)
    return
  }
  const thin = RecordedEventSchemas[name.data].safeParse(row.payload)
  if (!thin.success) {
    log.warn(
      `Invalid stored host payload for plugin event ${row.name}`,
      thin.error,
    )
    await db.delete(pluginEvent).where(eq(pluginEvent.id, row.id))
    return
  }
  const hydrated = await hydrateEvent(name.data, thin.data)
  if (hydrated === null) {
    await db.delete(pluginEvent).where(eq(pluginEvent.id, row.id))
    return
  }
  const payload = PluginEventSchemas[name.data].safeParse(hydrated)
  if (!payload.success) {
    log.warn(
      `Invalid hydrated host payload for plugin event ${row.name}`,
      payload.error,
    )
    await db.delete(pluginEvent).where(eq(pluginEvent.id, row.id))
    return
  }
  try {
    if (stopped || signal.aborted) return
    await invoke(row, payload.data, signal)
    if (stopped || signal.aborted) return
    eventSucceeded(state)
    await db.delete(pluginEvent).where(eq(pluginEvent.id, row.id))
  } catch (cause) {
    if (stopped || signal.aborted) return
    if (cause instanceof SandboxError && cause.kind === "crashed") {
      eventsPaused(state, Date.now() + 5000)
      return
    }
    eventFailed(state, started, Date.now(), row.attempts === 0)
    const error = errorText(cause).slice(0, 1000)
    const retryAt = new Date(Date.now() + eventBackoff(row.attempts + 1))
    await db
      .update(pluginEvent)
      .set({ attempts: row.attempts + 1, retryAt, error })
      .where(eq(pluginEvent.id, row.id))
    pluginLog(
      id,
      "warn",
      `Event ${row.name} (${row.id}) attempt ${row.attempts + 1} failed: ${error}`,
    )
  }
}
/**
 * How long one run keeps starting deliveries before it steps back. The
 * queue runs four plugins at once, and a plugin with a long backlog would
 * otherwise hold its place until the backlog is gone.
 */
const TURN_MS = 5000
/** The oldest event of each lane, for one plugin. */
function laneHeads(id: string) {
  return db
    .$with("heads")
    .as(
      db
        .selectDistinctOn([pluginEvent.lane])
        .from(pluginEvent)
        .where(eq(pluginEvent.pluginId, id))
        .orderBy(pluginEvent.lane, pluginEvent.id),
    )
}
async function drain(id: string, signal: AbortSignal): Promise<void> {
  const active = new Map<string, Promise<void>>()
  const began = Date.now()
  let refreshed = 0
  let failed: Error | undefined
  try {
    while (!stopped && !signal.aborted) {
      if (failed) throw failed
      if (Date.now() - began >= TURN_MS) {
        // Finish what runs, then go to the back of the queue.
        await Promise.allSettled(active.values())
        request(id)
        return
      }
      const state = probe(id)
      const now = new Date()
      const heads = laneHeads(id)
      // A plugin can have thousands of lanes waiting. The database picks
      // the few that could run now: due, not already running, oldest
      // first, and while probing an event that has never failed first.
      const candidates = await db
        .with(heads)
        .select()
        .from(heads)
        .where(
          and(
            or(isNull(heads.retryAt), lte(heads.retryAt, now)),
            active.size
              ? notInArray(heads.lane, [...active.keys()])
              : undefined,
          ),
        )
        .orderBy(
          ...(state.strikes ? [sql`${heads.attempts} > 0`] : []),
          heads.id,
        )
        .limit(8)
      const plan = scheduleEvents(
        candidates,
        new Set(active.keys()),
        state,
        now.getTime(),
      )
      let launched = false
      for (const row of plan.ready) {
        const name = PluginEventName.safeParse(row.name)
        if (
          name.success &&
          !eventSubscribers(name.data).includes(id) &&
          files.get(id)?.manifest?.contributes.events.includes(name.data)
        )
          continue
        launched = true
        const running = deliverOne(row, signal)
          .catch((cause) => {
            failed =
              cause instanceof Error ? cause : new Error(errorText(cause))
          })
          .finally(() => active.delete(row.lane))
        active.set(row.lane, running)
      }
      if (Date.now() - refreshed >= 1000) {
        refreshed = Date.now()
        await refresh(id)
      }
      if (active.size) {
        await Promise.race(active.values())
        continue
      }
      if (launched) continue
      if (plan.ready.length) {
        // The plugin isn't running. A change in that asks for another run.
        return
      }
      // Nothing can run now. Come back for the pause, or for the first
      // event that may be tried again.
      const [held] = await db
        .with(heads)
        .select({ at: min(heads.retryAt) })
        .from(heads)
        .where(gt(heads.retryAt, now))
      const wakeAt = Math.min(
        plan.wakeAt ?? Infinity,
        held?.at ? Math.max(held.at.getTime(), state.pauseUntil) : Infinity,
      )
      if (Number.isFinite(wakeAt))
        retry(id, new Date(Math.max(Date.now() + 1, wakeAt)))
      return
    }
  } catch (cause) {
    retry(id, new Date(Date.now() + 5000))
    throw cause
  } finally {
    await Promise.allSettled(active.values())
    await refresh(id).catch((cause) =>
      log.warn("Couldn't refresh plugin event delivery", cause),
    )
  }
}
const deliveries = defineQueue<string, void>({
  id: "plugin-events",
  name: "Plugin events",
  description:
    "Deliver recorded server events to plugins, retrying failed handlers.",
  concurrency: 4,
  key: (id) => id,
  label: (id) => files.get(id)?.manifest?.name ?? id,
  // A record arriving after a drain's last read must get its own look.
  joinsRunning: () => false,
  retryAfterMs: 0,
  run: (id, { signal }) => drain(id, signal),
})

/** Catch up after restart and bound the durable backlog, including disabled plugins. */
export async function deliverPluginEvents({
  signal,
}: {
  signal: AbortSignal
}): Promise<void> {
  const expired = await db
    .delete(pluginEvent)
    .where(lt(pluginEvent.createdAt, new Date(Date.now() - DAY)))
    .returning({ pluginId: pluginEvent.pluginId })
  const counts = new Map<string, number>()
  for (const row of expired)
    counts.set(row.pluginId, (counts.get(row.pluginId) ?? 0) + 1)
  for (const [id, count] of counts)
    pluginLog(
      id,
      "warn",
      `Gave up on ${count} plugin ${count === 1 ? "event" : "events"} older than 24 hours.`,
    )
  const ids = await db
    .selectDistinct({ id: pluginEvent.pluginId })
    .from(pluginEvent)
  for (const { id } of ids) {
    if (stopped || signal.aborted) break
    const excess = db
      .select({ id: pluginEvent.id })
      .from(pluginEvent)
      .where(eq(pluginEvent.pluginId, id))
      .orderBy(desc(pluginEvent.id))
      .offset(MAX_PENDING)
    const removed = await db
      .delete(pluginEvent)
      .where(and(eq(pluginEvent.pluginId, id), inArray(pluginEvent.id, excess)))
      .returning({ id: pluginEvent.id })
    if (removed.length)
      pluginLog(
        id,
        "warn",
        `Gave up on ${removed.length} oldest plugin events over the ${MAX_PENDING} event limit.`,
      )
    await refresh(id)
    request(id)
  }
  for (const id of status.keys())
    if (!ids.some((row) => row.id === id)) await refresh(id)
}
/**
 * Try a plugin's waiting events now, not when the next try is due, for an
 * admin who fixed what made them fail.
 */
export async function retryPluginEvents(id: string): Promise<void> {
  eventSucceeded(probe(id))
  await db
    .update(pluginEvent)
    .set({ retryAt: null })
    .where(and(eq(pluginEvent.pluginId, id), isNotNull(pluginEvent.retryAt)))
  const waiting = retries.get(id)
  if (waiting) {
    clearTimeout(waiting)
    timers.delete(waiting)
    retries.delete(id)
  }
  await refresh(id)
  request(id)
}
export async function startEventDelivery(): Promise<void> {
  stopped = false
  const ids = await db
    .selectDistinct({ id: pluginEvent.pluginId })
    .from(pluginEvent)
  await Promise.all(ids.map(({ id }) => refresh(id)))
}
export async function stopEventDelivery(): Promise<void> {
  stopped = true
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
  retries.clear()
  changedTimer = undefined
  await deliveries.stop()
}
onAvailabilityChanged(() => {
  if (stopped) return
  for (const [id, delivery] of status) if (delivery.pending) request(id)
})
