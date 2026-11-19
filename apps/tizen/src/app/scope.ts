import type { TitleList, User } from "@matinee/contracts"
import { createContext } from "preact"
import { useContext, useEffect, useRef, useState } from "preact/hooks"

import { session } from "@/auth/session"
import { Observable, useObserved } from "@/lib/observable"
import { Loader, REFRESH_AFTER_MS } from "@/model/loader"
import { TitlePages } from "@/model/pages"
import type { Viewer } from "@/model/viewer"

import type { Actions } from "./actions"
import type { Entry, Navigator } from "./navigator"

/** Messages at the bottom of the screen, one at a time, each for a few seconds. */
export class Toasts extends Observable {
  message: string | null = null
  private timer = 0

  show(message: string) {
    window.clearTimeout(this.timer)
    this.message = message
    this.changed()
    this.timer = window.setTimeout(() => {
      this.message = null
      this.changed()
    }, 5000)
  }

  /** Runs `work`, showing `failure` with the server's own words if it fails. */
  async showing(failure: string, work: () => Promise<void>) {
    try {
      await work()
    } catch (cause) {
      const words = session.describe(cause)
      this.show(words ? `${failure}: ${words}` : failure)
    }
  }
}

/** What every page of the signed-in app shares. A new sign-in gets its own. */
export type AppScope = {
  user: User
  nav: Navigator
  viewer: Viewer
  toasts: Toasts
  actions: Actions
}

export const AppContext = createContext<AppScope | null>(null)
export const PageContext = createContext<Entry | null>(null)

export function useApp(): AppScope {
  const app = useContext(AppContext)
  if (!app) throw new Error("Not inside the signed-in app")
  return app
}

/** The page being drawn: its route, and what it keeps while on the stack. */
export function usePage(): Entry {
  const page = useContext(PageContext)
  if (!page) throw new Error("Not inside a page")
  return page
}

/**
 * Loads `fetch` for this page. `key` names what it loads, so two loads on
 * one page stay apart, and a page that comes back finds its answer there.
 * Fetches again when the viewer's marks change, unless it's `pinned`.
 */
export function useLoader<T>(
  key: string,
  fetch: () => Promise<T>,
  options: { pinned?: boolean } = {},
): Loader<T> {
  const { viewer } = useApp()
  const { scope } = usePage()
  // SAFETY: A page loads the same thing under a key every time it asks.
  let loader = scope.loaders.get(key) as Loader<T> | undefined
  if (!loader) {
    loader = new Loader(fetch)
    // SAFETY: The map holds loaders of every type, read back by their key.
    scope.loaders.set(key, loader as Loader<never>)
  }
  const version = useObserved(viewer).version
  const current = loader
  const pinned = options.pinned ?? false
  useEffect(() => {
    // A pinned load keeps its first answer: what it shows would change
    // under the person, as the featured titles, picked at random.
    if (
      !pinned &&
      current.seenVersion !== -1 &&
      current.seenVersion !== version
    ) {
      current.reload()
    }
    current.seenVersion = version
  }, [current, version, pinned])
  return useObserved(current)
}

/** Something that fetches again when what it has is old. */
type Refreshable = { refreshIfStale(maxAgeMs?: number): void }

/**
 * Refreshes `loaders` each time the page shows again: back from a page on
 * top of it, from the player, or from another app. One fetching already,
 * or that answered under `maxAgeMs` ago, is left alone.
 */
export function useRefreshOnResume(
  loaders: readonly Refreshable[],
  maxAgeMs = REFRESH_AFTER_MS,
) {
  const latest = useRef(loaders)
  latest.current = loaders
  useEffect(() => {
    const refresh = () => {
      for (const loader of latest.current) loader.refreshIfStale(maxAgeMs)
    }
    refresh()
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [maxAgeMs])
}

/** A small value the page keeps while it's on the stack, like the season that's open. */
export function useKept(
  name: string,
  initial: string,
): [string, (next: string) => void] {
  const { scope } = usePage()
  const [value, setValue] = useState(() => scope.kept.get(name) ?? initial)
  const set = (next: string) => {
    scope.kept.set(name, next)
    setValue(next)
  }
  return [value, set]
}

/** The list under `key`, kept while the page is on the stack. A new key is a new list. */
export function useTitlePages(
  key: string,
  fetch: (offset: number, limit: number) => Promise<TitleList>,
): TitlePages {
  const { viewer } = useApp()
  const { scope } = usePage()
  const stored = scope.lists.get(key)
  const pages = stored ?? new TitlePages(fetch)
  if (!stored) scope.lists.set(key, pages)
  // Marks changed elsewhere, like a show watched to the end: show them.
  const version = useObserved(viewer).version
  useEffect(() => {
    if (pages.seenVersion !== -1 && pages.seenVersion !== version) {
      pages.restart()
    }
    pages.seenVersion = version
  }, [pages, version])
  return useObserved(pages)
}
