import type { RequestQueue } from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"

import { liveQuery, orpc } from "@/lib/rpc"

/*
 * The admin's queue as the server streams it: what the shell needs of the
 * React app's file of the same name, for the avatar's dot and the account
 * menu's count. The requests page brings the rest, with the requests held
 * for Undo, which the count leaves out there.
 */

/** How many of the latest done requests the stream carries. */
export const RECENT_DONE = 20

/** The live queue. */
export function useRequestQueue(enabled: () => boolean) {
  return useQuery(() => ({
    ...orpc.admin.requests.live.experimental_liveOptions({
      input: { limit: RECENT_DONE },
    }),
    ...liveQuery,
    enabled: enabled(),
  }))
}

/** How many requests wait for an admin. */
export function needsYou(queue: RequestQueue | undefined): number {
  if (!queue) return 0
  return queue.waiting.length + queue.needsAttention.length
}

/**
 * The count behind the avatar's dot and the menu entry, live. Zero until
 * the stream's first answer, without waiting on it.
 */
export function useNeedsYou(enabled: () => boolean): () => number {
  const queue = useRequestQueue(enabled)
  return () => (queue.isSuccess ? needsYou(queue.data) : 0)
}
