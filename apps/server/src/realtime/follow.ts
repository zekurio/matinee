import { setTimeout as sleep } from "node:timers/promises"

import { log } from "../log"
import { events, streamSignal, type Topic } from "./events"

// Changes this close together, like a stream starting and its first
// report, load once.
const SETTLE_MS = 250

export type FollowOptions<T> = {
  /** Topics whose changes can change what `load` returns. */
  topics: readonly Topic[]
  load: () => Promise<T>
  /** The procedure's `signal`. */
  signal: AbortSignal | undefined
  /**
   * Load again after this long without a change, for state that goes
   * stale on its own, like sessions that stop reporting.
   */
  refreshMs?: number
  /**
   * How long to wait after a change for more, `SETTLE_MS` when left out.
   * 0 for state a client acts on at once, like a party's pause.
   */
  settleMs?: number
}

/**
 * What `load` returns now, then again after each change to `topics`, for
 * a procedure whose output is an event iterator. A change during a load
 * makes one more. Ends quietly on `streamSignal`, and the client opens a
 * new stream.
 */
export async function* follow<T>({
  topics,
  load,
  signal: request,
  refreshMs,
  settleMs = SETTLE_MS,
}: FollowOptions<T>): AsyncGenerator<T, void, void> {
  const signal = streamSignal(request)
  let changed = false
  let wake: (() => void) | null = null
  const poke = () => {
    changed = true
    wake?.()
  }
  /** Waits for a change, `refreshMs`, or the end. */
  const nextChange = () =>
    new Promise<void>((resolve) => {
      if (changed || signal.aborted) {
        resolve()
        return
      }
      let timer: NodeJS.Timeout | undefined
      const done = () => {
        clearTimeout(timer)
        wake = null
        resolve()
      }
      if (refreshMs !== undefined) timer = setTimeout(done, refreshMs)
      wake = done
    })

  const unsubscribes = topics.map((topic) => events.subscribe(topic, poke))
  signal.addEventListener("abort", poke)
  try {
    while (!signal.aborted) {
      changed = false
      let value: T
      try {
        value = await load()
      } catch (cause) {
        // Errors in a stream skip the handler's interceptors, so they'd go
        // unlogged. The client sees a 500 and reconnects.
        log.error("A live stream failed", cause)
        throw cause
      }
      yield value
      await nextChange()
      if (changed && settleMs > 0 && !signal.aborted) await sleep(settleMs)
    }
  } finally {
    for (const unsubscribe of unsubscribes) unsubscribe()
    signal.removeEventListener("abort", poke)
  }
}
