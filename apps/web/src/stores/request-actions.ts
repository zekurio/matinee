import type { RequestState } from "@matinee/contracts"
import { createMemo, createSignal, onSettled } from "solid-js"

import { tr } from "@/i18n"
import { toast } from "@/kit/toast"
import { errorMessage, keepaliveClient, orpc, queryClient } from "@/lib/rpc"

/*
 * Answering from the queue, held for a moment before it's sent: adding
 * and declining a waiting request, giving up on an accepted one, and
 * allowing requests again for a declined one or adding it after all.
 * A person's own request, taken back from Discover, is held the same way.
 * The server has no way to take these back, so Undo works by never
 * sending it: the row collapses at once, a toast
 * offers Undo, and the call goes out when the toast's time is up, or at
 * once when the page closes.
 *
 * Where a waiting request goes can be changed before Add, in the queue's
 * row or beside Add on the title's page. The choice is kept here, by
 * request, so both show it and A in the queue adds it there.
 */

/** How long an action waits for Undo before it's sent. */
export const HOLD_MS = 5000

/** How long a sent action keeps its rows hidden, until the queue catches up. */
const SETTLE_MS = 10_000

export type QueueAction =
  | {
      kind: "add"
      ids: string[]
      names: string[]
      /** Requests moving to another library as they're added, by id. */
      moves: ReadonlyMap<string, string>
      /** The library a single moved request goes to, for its toast. */
      library?: string
    }
  | {
      kind: "decline"
      ids: [string]
      names: [string]
      note: string | null
    }
  | { kind: "giveUp"; ids: [string]; names: [string]; note: string | null }
  | { kind: "allowAgain" | "addAfterAll"; ids: [string]; names: [string] }
  /** A person taking back their own request, on Discover. */
  | { kind: "cancel"; ids: [string]; names: [string] }

type Held = {
  key: number
  action: QueueAction
  timer: ReturnType<typeof setTimeout>
  toastId: string | number
}

type RequestActionsState = {
  held: Held[]
  /** Libraries chosen under "Goes to", by request id, until it's added. */
  moves: Map<string, string>
  /** Choose where a waiting request goes; null keeps where it is. */
  move: (id: string, libraryId: string | null) => void
  /** Ids of actions sent, hidden until the next queue leaves them out. */
  settled: Map<string, ReturnType<typeof setTimeout> | undefined>
  /** What was sent for each id in `settled`. */
  kinds: Map<string, QueueAction["kind"]>
  /** Collapse the rows now, and send the action once Undo's time is up. */
  hold: (action: QueueAction) => void
  /** Take back the latest held action, or the one with `key`. */
  undo: (key?: number) => QueueAction | null
  /** Send every held action now, as when the page closes. */
  flush: () => void
}

let nextKey = 1

function heldMessage(action: QueueAction): string {
  const [first] = action.names
  switch (action.kind) {
    case "decline":
      return tr("requests.toast.declined", { name: first ?? "" })
    case "giveUp":
      return tr("requests.toast.gaveUp", { name: first ?? "" })
    case "allowAgain":
      return tr("requests.toast.allowedAgain", { name: first ?? "" })
    case "addAfterAll":
      return tr("requests.toast.addedAfterAll", { name: first ?? "" })
    case "cancel":
      return tr("requests.toast.cancelled", { name: first ?? "" })
    case "add":
      break
  }
  if (action.names.length === 1 && action.library)
    return tr("requests.toast.addedTo", {
      name: first ?? "",
      library: action.library,
    })
  return action.names.length === 1
    ? tr("requests.toast.added", { name: first ?? "" })
    : tr("requests.toast.addedMany", { count: action.names.length })
}

function failedMessage(action: QueueAction): string {
  const name = action.names[0] ?? ""
  switch (action.kind) {
    case "decline":
      return tr("requests.toast.declineFailed", { name })
    case "giveUp":
      return tr("requests.toast.giveUpFailed", { name })
    case "allowAgain":
      return tr("requests.toast.allowAgainFailed", { name })
    case "addAfterAll":
      return tr("requests.toast.addAfterAllFailed", { name })
    case "cancel":
      return tr("ask.toast.cancelFailed", { name })
    case "add":
      return tr("requests.toast.addFailed")
  }
}

/** Sent with keepalive, as the page may be closing. */
async function send(action: QueueAction) {
  const client = keepaliveClient
  switch (action.kind) {
    case "decline":
      await client.admin.requests.decline({
        id: action.ids[0],
        note: action.note,
      })
      return
    case "giveUp":
      await client.admin.requests.giveUp({
        id: action.ids[0],
        note: action.note,
      })
      return
    case "allowAgain":
      await client.admin.requests.allowAgain({ id: action.ids[0] })
      return
    case "addAfterAll":
      await client.admin.requests.addAfterAll({ id: action.ids[0] })
      return
    case "cancel":
      await client.requests.cancel({ id: action.ids[0] })
      return
    case "add":
      break
  }
  // A move is one approve each; the rest go together.
  const moved = action.ids.filter((id) => action.moves.has(id))
  const rest = action.ids.filter((id) => !action.moves.has(id))
  const [only] = rest
  const results = await Promise.allSettled([
    ...moved.map((id) =>
      client.admin.requests.approve({ id, libraryId: action.moves.get(id) }),
    ),
    rest.length > 1
      ? client.admin.requests.approveAll({ ids: rest })
      : only
        ? client.admin.requests.approve({ id: only })
        : null,
  ])
  for (const result of results)
    if (result.status === "rejected") throw result.reason
}

function createRequestActionsStore() {
  const get = () => current
  const set = (patch: Partial<RequestActionsState>) => {
    current = { ...current, ...patch }
    setState(current)
  }
  const release = (key: number) => {
    const entry = get().held.find((held) => held.key === key)
    if (!entry) return
    clearTimeout(entry.timer)
    set({ held: get().held.filter((held) => held.key !== key) })
    return entry
  }

  const settle = (ids: readonly string[]) => {
    const settled = new Map(get().settled)
    for (const id of ids) {
      clearTimeout(settled.get(id))
      settled.set(
        id,
        setTimeout(() => {
          const next = new Map(get().settled)
          next.delete(id)
          const kinds = new Map(get().kinds)
          kinds.delete(id)
          set({ settled: next, kinds })
        }, SETTLE_MS),
      )
    }
    set({ settled })
  }

  const commit = (key: number) => {
    const entry = release(key)
    if (!entry) return
    toast.dismiss(entry.toastId)
    const pending = new Map(get().settled)
    const kinds = new Map(get().kinds)
    for (const id of entry.action.ids) {
      clearTimeout(pending.get(id))
      pending.set(id, undefined)
      kinds.set(id, entry.action.kind)
    }
    set({ settled: pending, kinds })
    send(entry.action)
      .then(() => {
        settle(entry.action.ids)
        if (entry.action.kind === "add" && entry.action.moves.size) {
          const moves = new Map(get().moves)
          for (const id of entry.action.moves.keys()) moves.delete(id)
          set({ moves })
        }
        if (entry.action.kind === "cancel") {
          // The lists of what the viewer asked for, and the states the
          // catalog's cards show, as cancelling anywhere else reloads them.
          return Promise.all([
            queryClient.invalidateQueries({ queryKey: orpc.catalog.key() }),
            queryClient.invalidateQueries({
              queryKey: orpc.requests.mine.key(),
            }),
          ]).then(() => undefined)
        }
        // Done is read page by page rather than followed live.
        return queryClient.invalidateQueries({
          queryKey: orpc.admin.requests.queue.key(),
        })
      })
      .catch((cause: unknown) => {
        // The rows come back, since nothing changed.
        const next = new Map(get().settled)
        const kinds = new Map(get().kinds)
        for (const id of entry.action.ids) {
          clearTimeout(next.get(id))
          next.delete(id)
          kinds.delete(id)
        }
        set({ settled: next, kinds })
        toast.error(failedMessage(entry.action), {
          description: errorMessage(cause),
        })
      })
  }

  let current: RequestActionsState = {
    held: [],
    moves: new Map(),
    move: (id, libraryId) => {
      const moves = new Map(get().moves)
      if (libraryId) moves.set(id, libraryId)
      else moves.delete(id)
      set({ moves })
    },
    settled: new Map(),
    kinds: new Map(),
    hold: (action) => {
      const key = nextKey++
      const toastId = toast.success(heldMessage(action), {
        duration: HOLD_MS,
        action: {
          label: tr("requests.toast.undo"),
          onClick: () => {
            get().undo(key)
          },
        },
        // Closing the toast early sends it early, as its time running out would.
        onDismiss: () => commit(key),
      })
      const timer = setTimeout(() => commit(key), HOLD_MS)
      set({ held: [...get().held, { key, action, timer, toastId }] })
    },
    undo: (key) => {
      const target = key ?? get().held.at(-1)?.key
      if (target === undefined) return null
      const entry = release(target)
      if (!entry) return null
      toast.dismiss(entry.toastId)
      return entry.action
    },
    flush: () => {
      for (const held of get().held) commit(held.key)
    },
  }
  const [state, setState] = createSignal(current)
  // Event handlers must see a release immediately, including during a flush.
  return Object.assign(
    <Value>(select: (state: RequestActionsState) => Value) =>
      () =>
        select(state()),
    { getState: get },
  )
}

/** A shared store. Calling it with a selector returns an accessor. */
export const useRequestActionsStore = createRequestActionsStore()

/**
 * The states each action takes a request out of. Once the server moves
 * it on, as an added one to on its way, it shows again in its new state
 * without waiting for the hold on its id to end.
 */
const LEAVES = new Map<QueueAction["kind"], readonly RequestState[]>([
  ["add", ["waiting"]],
  ["decline", ["waiting"]],
  ["giveUp", ["needsAttention", "onTheWay"]],
  ["allowAgain", ["declined"]],
  ["addAfterAll", ["declined"]],
  ["cancel", ["waiting", "needsAttention", "onTheWay", "here", "declined"]],
])

/** The requests acted on, by id, with what was done: held, or sent and not gone yet. */
export type HiddenRequests = ReadonlyMap<string, QueueAction["kind"]>

/** Accessor for the requests hidden by a held or recently sent action. */
export function useHiddenRequests() {
  return createMemo<HiddenRequests>(() => {
    const { held, settled, kinds } = useRequestActionsStore((state) => state)()
    const ids = new Map<string, QueueAction["kind"]>()
    for (const id of settled.keys()) {
      const kind = kinds.get(id)
      if (kind) ids.set(id, kind)
    }
    for (const entry of held)
      for (const id of entry.action.ids) ids.set(id, entry.action.kind)
    return ids
  })
}

/**
 * Whether a list should leave `item` out: an action on it is held or on
 * its way, and the server still has it where the action takes it from.
 */
export function isHidden(
  hidden: HiddenRequests,
  item: { id: string; state: RequestState },
): boolean {
  const kind = hidden.get(item.id)
  return kind !== undefined && (LEAVES.get(kind)?.includes(item.state) ?? true)
}

/**
 * Sends what's held as soon as the page is left: when the component goes,
 * the tab is hidden, or the page closes. Undo is only for while the
 * admin is still looking.
 */
export function useSendHeldOnLeave() {
  onSettled(() => {
    const flush = () => useRequestActionsStore.getState().flush()
    const hidden = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", hidden)
      flush()
    }
  })
}
