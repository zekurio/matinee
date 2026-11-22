import { isDisconnect } from "@/api/errors"
import { session } from "@/auth/session"
import { Observable } from "@/lib/observable"

/*
 * What a page loads from the server, kept while the page is on the back
 * stack. `state` is ready from the first
 * answer on; a fetch after that which fails leaves it, so a refresh that
 * fails doesn't blank what the person saw.
 */

export type Load<T> =
  | { kind: "loading" }
  | { kind: "ready"; value: T }
  /** `disconnected`: the server couldn't be reached, rather than answering with an error. */
  | { kind: "failed"; message: string; disconnected: boolean }

/** Fetch again on return after this long, when nothing asked for it sooner. */
export const REFRESH_AFTER_MS = 30_000

export class Loader<T> extends Observable {
  state: Load<T> = { kind: "loading" }
  /** A fetch is out. */
  refreshing = false
  /** The viewer's version this loaded for; see `useLoader`. */
  seenVersion = -1
  private generation = 0
  private settledAt = 0

  constructor(private readonly fetch: () => Promise<T>) {
    super()
    this.reload()
  }

  /** The value, once there is one. */
  get value(): T | undefined {
    return this.state.kind === "ready" ? this.state.value : undefined
  }

  /** Show what a save answered with, without fetching it again. */
  show(value: T) {
    this.generation += 1
    this.settle({ kind: "ready", value })
  }

  /** Fetch again. What showed stays until the answer comes, unless it failed. */
  reload() {
    this.generation += 1
    const mine = this.generation
    if (this.state.kind === "failed") this.state = { kind: "loading" }
    this.refreshing = true
    this.changed()
    this.fetch().then(
      (value) => {
        if (mine === this.generation) this.settle({ kind: "ready", value })
      },
      (cause: unknown) => {
        if (mine !== this.generation) return
        const message = session.describe(cause)
        // An earlier answer stays on screen.
        this.settle(
          this.state.kind === "ready"
            ? this.state
            : { kind: "failed", message, disconnected: isDisconnect(cause) },
        )
      },
    )
  }

  private settle(state: Load<T>) {
    this.state = state
    this.refreshing = false
    this.settledAt = performance.now()
    this.changed()
  }

  /** Fetch again if none is out and the last ended at least `maxAgeMs` ago. */
  refreshIfStale(maxAgeMs = REFRESH_AFTER_MS) {
    if (!this.refreshing && performance.now() - this.settledAt >= maxAgeMs) {
      this.reload()
    }
  }
}
