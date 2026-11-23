import type { AdminRequestItem, RequestQueue } from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"
import { linkOptions } from "@tanstack/react-router"

import { perLocale, tr } from "@/i18n"
import { liveQuery, orpc } from "@/lib/rpc"
import {
  type HiddenRequests,
  isHidden,
  type QueueAction,
  useHiddenRequests,
  useRequestActionsStore,
} from "@/stores/request-actions"

import type { RequestFilter } from "./request-filter"

/*
 * The admin's queue as the server streams it, and the words its rows
 * share. The stream starts with the whole queue and sends it again on
 * each change, so a reconnect loses nothing.
 */

/**
 * How many of the latest done requests the stream carries: enough for
 * Discover's row when little else is going on. The requests page reads
 * the rest of done page by page.
 */
export const RECENT_DONE = 20

/**
 * A list filter as the server takes it, with nothing for what's off, so
 * an unfiltered list asks exactly what every other unfiltered one does.
 */
export function filterInput(filter: RequestFilter | undefined) {
  const input: Partial<RequestFilter> = {}
  if (filter?.states.length) input.states = filter.states
  if (filter?.kind) input.kind = filter.kind
  return input
}

/**
 * The live queue, which every part of the page that shows it shares:
 * the avatar's dot, Discover's row, a title page's Add, and the
 * requests page. The requests page alone passes a `filter`.
 */
export function useRequestQueue(enabled = true, filter?: RequestFilter) {
  return useQuery({
    ...orpc.admin.requests.live.experimental_liveOptions({
      input: { limit: RECENT_DONE, ...filterInput(filter) },
    }),
    ...liveQuery,
    enabled,
  })
}

/**
 * The work lists in the order the server declares them, the one order
 * every list of requests takes: waiting, needs attention, on the way.
 * Each item's `state` says which it's in.
 */
export function workItems(queue: RequestQueue): AdminRequestItem[] {
  return [...queue.waiting, ...queue.needsAttention, ...queue.onTheWay]
}

/** How many requests wait for an admin, less the ones held for Undo. */
export function needsYou(
  queue: RequestQueue | undefined,
  hidden: HiddenRequests,
): number {
  if (!queue) return 0
  const waiting = queue.waiting.filter((item) => !isHidden(hidden, item))
  return waiting.length + queue.needsAttention.length
}

/** The count behind the avatar's dot and the menu entry, live. */
export function useNeedsYou(enabled: boolean): number {
  const queue = useRequestQueue(enabled)
  const hidden = useHiddenRequests()
  return needsYou(queue.data, hidden)
}

const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

export function formatNames(names: readonly string[]): string {
  return lists().format(names)
}

const percents = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    }),
)

export function formatPercent(fraction: number): string {
  return percents().format(fraction)
}

/** "1–4, 6": season numbers, runs of three or more as a range. */
function seasonRuns(numbers: readonly number[]): string {
  const runs: string[] = []
  let start = 0
  for (let index = 1; index <= numbers.length; index++) {
    const first = numbers[start]
    const last = numbers[index - 1]
    if (first === undefined || last === undefined) break
    if (numbers[index] === last + 1) continue
    if (last - first >= 2) runs.push(`${first}–${last}`)
    else for (let n = first; n <= last; n++) runs.push(String(n))
    start = index
  }
  return runs.join(", ")
}

/** "Seasons 1–4", for a show's request. */
export function scopeLabel(scope: AdminRequestItem["scope"]): string | null {
  if (!scope) return null
  const numbers = scope.seasons.filter((n) => n > 0).toSorted((a, b) => a - b)
  const specials = scope.seasons.includes(0)
  let seasons: string | null = null
  if (numbers.length > 0) {
    seasons = tr("requests.scope.seasons", {
      count: numbers.length,
      numbers: seasonRuns(numbers),
    })
  }
  if (specials) {
    seasons = seasons
      ? tr("requests.scope.specialsAnd", { seasons })
      : tr("requests.scope.specials")
  }
  return seasons
}

/**
 * Where a request's title opens: its page in the library once it's here,
 * the catalog page while it isn't.
 */
export function titleLink(
  item: Pick<AdminRequestItem, "title" | "library" | "availability">,
) {
  const titleId = item.availability.libraryTitleId
  if (titleId) {
    return linkOptions({ to: "/titles/$titleId", params: { titleId } })
  }
  const { kind, provider, providerId } = item.title.ref
  return linkOptions({
    to: "/catalog/$kind/$provider/$providerId",
    params: { kind, provider, providerId },
    search: { library: item.library.id },
  })
}

/** Who requested first, and everyone else who requested it. */
export function askers(item: AdminRequestItem) {
  const sorted = item.followers.toSorted(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )
  const [first, ...rest] = sorted
  return { first: first ?? null, rest }
}

/**
 * Adding `items`, each to the library chosen under "Goes to" if that's
 * another than its own and still one it can go to.
 */
export function addAction(items: readonly AdminRequestItem[]): QueueAction {
  const { moves } = useRequestActionsStore.getState()
  const chosen = new Map<string, string>()
  let library: string | undefined
  for (const item of items) {
    const target = item.destinations.find(
      (entry) => entry.id === moves.get(item.id) && !entry.selected,
    )
    if (!target) continue
    chosen.set(item.id, target.id)
    library = target.name
  }
  return {
    kind: "add",
    ids: items.map((item) => item.id),
    names: items.map((item) => item.title.name),
    moves: chosen,
    library: items.length === 1 ? library : undefined,
  }
}
