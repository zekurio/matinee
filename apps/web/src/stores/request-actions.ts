import type { WaitingDeclineReason } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { useEffect } from "react"
import { create } from "zustand"

import { tr } from "@/i18n"
import { errorMessage, keepaliveClient, orpc, queryClient } from "@/lib/rpc"

/*
 * Answering from the queue, held for a moment before it's sent: adding
 * and declining a waiting request, giving up on an accepted one, and
 * allowing requests again for a declined one or adding it after all.
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
      reason: WaitingDeclineReason
      note: string | null
    }
  | { kind: "giveUp"; ids: [string]; names: [string]; note: string | null }
  | { kind: "allowAgain" | "addAfterAll"; ids: [string]; names: [string] }

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
  settled: Map<string, ReturnType<typeof setTimeout>>
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
        reason: action.reason,
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

export const useRequestActionsStore = create<RequestActionsState>()((
  set,
  get,
) => {
  const release = (key: number) => {
    const entry = get().held.find((held) => held.key === key)
    if (!entry) return
    clearTimeout(entry.timer)
    set((state) => ({ held: state.held.filter((held) => held.key !== key) }))
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
          set({ settled: next })
        }, SETTLE_MS),
      )
    }
    set({ settled })
  }

  const commit = (key: number) => {
    const entry = release(key)
    if (!entry) return
    toast.dismiss(entry.toastId)
    settle(entry.action.ids)
    send(entry.action)
      .then(() => {
        if (entry.action.kind === "add" && entry.action.moves.size) {
          const moves = new Map(get().moves)
          for (const id of entry.action.moves.keys()) moves.delete(id)
          set({ moves })
        }
        // Done is read page by page rather than followed live.
        return queryClient.invalidateQueries({
          queryKey: orpc.admin.requests.queue.key(),
        })
      })
      .catch((cause: unknown) => {
        // The rows come back, since nothing changed.
        const next = new Map(get().settled)
        for (const id of entry.action.ids) {
          clearTimeout(next.get(id))
          next.delete(id)
        }
        set({ settled: next })
        toast.error(failedMessage(entry.action), {
          description: errorMessage(cause),
        })
      })
  }

  return {
    held: [],
    moves: new Map(),
    move: (id, libraryId) => {
      const moves = new Map(get().moves)
      if (libraryId) moves.set(id, libraryId)
      else moves.delete(id)
      set({ moves })
    },
    settled: new Map(),
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
      set((state) => ({
        held: [...state.held, { key, action, timer, toastId }],
      }))
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
})

/** Ids the queue shouldn't show: held for Undo, or sent and not gone yet. */
export function useHiddenRequests(): Set<string> {
  const held = useRequestActionsStore((state) => state.held)
  const settled = useRequestActionsStore((state) => state.settled)
  const ids = new Set(settled.keys())
  for (const entry of held) for (const id of entry.action.ids) ids.add(id)
  return ids
}

/**
 * Sends what's held as soon as the page is left: when the component goes,
 * the tab is hidden, or the page closes. Undo is only for while the
 * admin is still looking.
 */
export function useSendHeldOnLeave() {
  useEffect(() => {
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
  }, [])
}
