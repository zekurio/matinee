import type { TitleList, TitleSummary } from "@matinee/contracts"

import { isDisconnect } from "../api/errors"
import { session } from "../auth/session"
import { Observable } from "../lib/observable"

/** How many titles a grid asks the server for at a time. */
const PAGE = 60

/** The most the server gives in one answer. */
const LARGEST_PAGE = 200

/**
 * A list of titles that loads a page at a time: the next one comes as
 * focus nears the end.
 */
export class TitlePages extends Observable {
  items: TitleSummary[] = []
  /** Titles that match, on every page. Null until the first answers. */
  total: number | null = null
  error: string | null = null
  disconnected = false
  loading = false
  seenVersion = -1
  private generation = 0

  constructor(
    private readonly fetch: (
      offset: number,
      limit: number,
    ) => Promise<TitleList>,
  ) {
    super()
    this.more()
  }

  get done(): boolean {
    return this.total !== null && this.items.length >= this.total
  }

  more() {
    if (this.loading || this.done) return
    this.load(this.items.length, PAGE, this.items)
  }

  /**
   * Loads the list again, as when what was watched changed. What it shows
   * stays until the server answers, and as much of it comes back as one
   * request may ask for, so the grid keeps its place and its focus.
   */
  restart() {
    this.generation += 1
    this.load(0, Math.min(Math.max(PAGE, this.items.length), LARGEST_PAGE), [])
  }

  private load(offset: number, limit: number, before: readonly TitleSummary[]) {
    this.loading = true
    this.error = null
    this.changed()
    const mine = this.generation
    this.fetch(offset, limit).then(
      (page) => {
        if (mine !== this.generation) return
        this.items = [...before, ...page.items]
        this.total = page.total
        this.loading = false
        this.changed()
      },
      (cause: unknown) => {
        if (mine !== this.generation) return
        this.error = session.describe(cause)
        this.disconnected = isDisconnect(cause)
        this.loading = false
        this.changed()
      },
    )
  }
}
