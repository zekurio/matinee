import { TitleKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import type { Navigator, Route } from "./navigator"

/*
 * The pages kept in the browser's history, so a reload comes back to
 * them rather than to Home. The page on top is in the address, after
 * `#`, which needs nothing of the server and works from a file as the
 * Samsung package runs. The whole stack is in the history entry's state,
 * so Back after a reload still goes where it went before. An address
 * without that state, as one pasted into a new tab, opens its page over
 * Home.
 *
 * The player isn't kept: a reload comes back to the page it was opened
 * from, rather than starting to play again by itself.
 */

/** Under which account and server the pages were kept, so another's aren't opened. */
const Kept = t.object({
  account: t.string(),
  pages: t.array(t.string()),
})

const part = encodeURIComponent

/** A page as its address, or null for the player. */
export function addressOf(route: Route): string | null {
  switch (route.page) {
    case "home":
    case "search":
    case "favorites":
    case "profile":
    case "recent":
      return `/${route.page}`
    case "kind":
      return `/kind/${route.kind}`
    case "title":
      return `/title/${part(route.id)}`
    case "season":
      return `/season/${part(route.titleId)}/${route.season ?? "none"}`
    case "episode":
      return `/episode/${part(route.itemId)}`
    case "person":
      return route.tmdbId
        ? `/person/${part(route.name)}/${part(route.tmdbId)}`
        : `/person/${part(route.name)}`
    case "browse":
      return route.genre !== undefined
        ? `/genre/${part(route.genre)}`
        : route.studio !== undefined
          ? `/studio/${part(route.studio)}`
          : "/browse"
    case "settings":
      return route.category ? `/settings/${part(route.category)}` : "/settings"
    case "player":
      return null
  }
}

function decoded(value: string | undefined): string | null {
  if (value === undefined || value === "") return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/** The page an address names, or null when it names none. */
export function routeOf(address: string): Route | null {
  const [page, first, second] = address.replace(/^#?\/?/, "").split("/")
  const one = decoded(first)
  const two = decoded(second)
  switch (page) {
    case "home":
    case "search":
    case "favorites":
    case "profile":
    case "recent":
      return { page }
    case "kind": {
      const kind = TitleKind.safeParse(one)
      return kind.success ? { page: "kind", kind: kind.data } : null
    }
    case "title":
      return one ? { page: "title", id: one } : null
    case "season": {
      if (!one || !two) return null
      const season = two === "none" ? null : Number(two)
      return season === null || Number.isInteger(season)
        ? { page: "season", titleId: one, season }
        : null
    }
    case "episode":
      return one ? { page: "episode", itemId: one } : null
    case "person":
      if (!one) return null
      return two
        ? { page: "person", name: one, tmdbId: two }
        : { page: "person", name: one }
    case "genre":
      return one ? { page: "browse", genre: one } : null
    case "studio":
      return one ? { page: "browse", studio: one } : null
    case "browse":
      return { page: "browse" }
    case "settings":
      return one ? { page: "settings", category: one } : { page: "settings" }
    default:
      return null
  }
}

/**
 * The pages to start on for `account`: those kept in the history entry,
 * else the address's page over Home, else Home.
 */
export function keptRoutes(account: string): Route[] {
  const home: Route = { page: "home" }
  const kept = Kept.safeParse(window.history.state)
  if (kept.success && kept.data.account === account) {
    const routes = kept.data.pages.flatMap((page) => {
      const route = routeOf(page)
      return route ? [route] : []
    })
    if (routes[0]?.page === "home") return routes
  }
  const route = routeOf(window.location.hash)
  return route && route.page !== "home" ? [home, route] : [home]
}

/** Keeps `nav`'s pages in the history entry as they change. Returns the way to stop. */
export function keepRoutes(nav: Navigator, account: string): () => void {
  const keep = () => {
    const pages = nav.stack.flatMap((entry) => {
      const address = addressOf(entry.route)
      return address === null ? [] : [address]
    })
    const top = pages.at(-1) ?? "/home"
    const url = new URL(window.location.href)
    url.hash = top === "/home" ? "" : top
    try {
      window.history.replaceState({ account, pages }, "", url.href)
    } catch {
      // A browser can refuse, as a page from a file sometimes does. The
      // pages still hold until a reload.
    }
  }
  keep()
  return nav.subscribe(keep)
}
