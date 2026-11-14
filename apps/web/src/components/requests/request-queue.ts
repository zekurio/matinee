import type { AdminRequestItem, RequestQueue } from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"
import { linkOptions } from "@tanstack/react-router"

import { perLocale, tr } from "@/i18n"
import { liveQuery, orpc } from "@/lib/rpc"
import {
  type QueueAction,
  useHiddenRequests,
  useRequestActionsStore,
} from "@/stores/request-actions"

/*
 * The admin's queue as the server streams it, and the words its rows
 * share. The stream starts with the whole queue and sends it again on
 * each change, so a reconnect loses nothing.
 */

export const QUEUE_LISTS = [
  "waiting",
  "needsAttention",
  "onTheWay",
  "done",
] as const
export type QueueList = (typeof QUEUE_LISTS)[number]

/**
 * The live queue. Done comes paged from its own query, so the stream
 * carries one row of it, just enough for its count.
 */
export function useRequestQueue(enabled = true) {
  return useQuery({
    ...orpc.admin.requests.live.experimental_liveOptions({
      input: { limit: 1 },
    }),
    ...liveQuery,
    enabled,
  })
}

/** How many requests wait for an admin, less the ones held for Undo. */
export function needsYou(
  queue: RequestQueue | undefined,
  hidden: ReadonlySet<string>,
): number {
  if (!queue) return 0
  const waiting = queue.waiting.filter((item) => !hidden.has(item.id)).length
  return waiting + queue.needsAttention.length
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

/** "Seasons 1–4 + new", for a show's request. */
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
  if (!seasons) return scope.future ? tr("requests.scope.futureOnly") : null
  return scope.future ? tr("requests.scope.andFuture", { seasons }) : seasons
}

/**
 * Where a request's title opens: its page in the library once it's here,
 * the catalog page while it isn't.
 */
export function titleLink(item: AdminRequestItem) {
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

/** Who requested first, and everyone else who requested or follows it. */
export function askers(item: AdminRequestItem) {
  const sorted = item.followers.toSorted(
    (a, b) =>
      Number(b.asked) - Number(a.asked) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
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
