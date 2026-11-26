import type { MediaItem, SearchResults, TitleKind } from "@matinee/contracts"

import { FocusMemory } from "../input/focus"
import { Observable } from "../lib/observable"
import type { Loader } from "../model/loader"
import type { TitlePages } from "../model/pages"

/*
 * The signed-in app's pages, as a stack. The TV's pages are the phone's,
 * by the phone's routes; the drawer's pages sit on top of Home, so Back
 * from one goes there. Each page on the stack keeps what it loaded and
 * where focus was, and is drawn again from that when it comes back.
 */

export type Route =
  | { page: "home" }
  | { page: "search" }
  | { page: "favorites" }
  | { page: "kind"; kind: TitleKind }
  | { page: "title"; id: string }
  /** `season` null is the files without a season number. */
  | { page: "season"; titleId: string; season: number | null }
  | { page: "episode"; itemId: string }
  | { page: "person"; name: string; tmdbId?: string }
  | { page: "browse"; genre?: string; studio?: string }
  | { page: "profile" }
  | { page: "recent" }
  | { page: "settings"; category?: string }
  /** `start` is seconds into the file; left out, where the person stopped. */
  | { page: "player"; itemId: string; start?: number; sitting: number }

/** What a page keeps while it's on the stack. */
export class PageScope {
  readonly loaders = new Map<string, Loader<never>>()
  /** The grids' lists, which load a page at a time. */
  readonly lists = new Map<string, TitlePages>()
  readonly memory = new FocusMemory()
  /** Small state a page wants back when it returns, by a name of its own. */
  readonly kept = new Map<string, string>()
  /** The newest search's answer and the text it's for, there when Search comes back. */
  search: { text: string; results: SearchResults } | null = null
}

export type Entry = { id: number; route: Route; scope: PageScope }

function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export class Navigator extends Observable {
  private ids = 0
  stack: Entry[]

  /** `routes` are the pages to start on, Home first, as a reload kept them. */
  constructor(routes: readonly Route[] = [{ page: "home" }]) {
    super()
    const [first, ...rest] = routes
    this.stack = [
      this.entry(first?.page === "home" ? first : { page: "home" }),
      ...(first?.page === "home" ? rest : routes).map((route) =>
        this.entry(route),
      ),
    ]
  }

  private entry(route: Route): Entry {
    this.ids += 1
    return { id: this.ids, route, scope: new PageScope() }
  }

  get top(): Entry {
    const top = this.stack.at(-1)
    if (!top) throw new Error("The stack always has Home")
    return top
  }

  get canGoBack(): boolean {
    return this.stack.length > 1
  }

  push(route: Route) {
    // Opening what's open already would only stack it twice.
    if (sameRoute(this.top.route, route)) return
    this.stack = [...this.stack, this.entry(route)]
    this.changed()
  }

  back() {
    if (this.stack.length <= 1) return
    this.stack = this.stack.slice(0, -1)
    this.changed()
  }

  /** Home's page, from anywhere. */
  home() {
    if (this.stack.length <= 1) return
    this.stack = this.stack.slice(0, 1)
    this.changed()
  }

  /** A page from the drawer, on top of Home so Back goes there. Home itself goes back to Home's page. */
  drawer(route: Route) {
    const home = this.stack[0]
    if (!home) return
    this.stack = route.page === "home" ? [home] : [home, this.entry(route)]
    this.changed()
  }

  /** Back to the newest page that `matches`, when there is one. */
  private popTo(matches: (route: Route) => boolean): boolean {
    const index = this.stack.findLastIndex((entry) => matches(entry.route))
    if (index < 0) return false
    if (index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, index + 1)
      this.changed()
    }
    return true
  }

  title(id: string) {
    this.push({ page: "title", id })
  }

  /** A title's page from one of its seasons or episodes: back to it when it's what came before. */
  titleUp(id: string) {
    if (!this.popTo((route) => route.page === "title" && route.id === id)) {
      this.push({ page: "title", id })
    }
  }

  season(titleId: string, season: number | null) {
    this.push({ page: "season", titleId, season })
  }

  /** A season's page from one of its episodes: back to it when it's what came before. */
  seasonUp(titleId: string, season: number | null) {
    const matches = (route: Route) =>
      route.page === "season" &&
      route.titleId === titleId &&
      route.season === season
    if (!this.popTo(matches)) this.season(titleId, season)
  }

  episode(itemId: string) {
    this.push({ page: "episode", itemId })
  }

  /** A file's own page: the title's page for a movie, the episode's for the rest. */
  item(item: MediaItem) {
    const title = item.title
    if (title?.kind === "movie") this.title(title.id)
    else this.episode(item.id)
  }

  person(name: string, tmdbId?: string) {
    this.push({ page: "person", name, tmdbId })
  }

  genre(name: string) {
    this.push({ page: "browse", genre: name })
  }

  studio(name: string) {
    this.push({ page: "browse", studio: name })
  }

  /** Play a file from where the person left off, or from `start` seconds. */
  play(itemId: string, start?: number) {
    this.ids += 1
    this.push({ page: "player", itemId, start, sitting: this.ids })
  }

  /** Another file in the player's place, as the next episode. */
  playInstead(itemId: string) {
    if (this.top.route.page !== "player") {
      this.play(itemId)
      return
    }
    this.ids += 1
    this.stack = [
      ...this.stack.slice(0, -1),
      this.entry({ page: "player", itemId, sitting: this.ids }),
    ]
    this.changed()
  }
}
