import { createMatineeClient, ORPCError } from "@matinee/client"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import {
  type FetchStatus,
  MutationCache,
  QueryCache,
  QueryClient,
} from "@tanstack/react-query"

import { tr, translateKnown } from "@/i18n"

declare global {
  interface Window {
    /**
     * Answers `index.html` asked for while the app's code loaded, by path
     * and body. Each goes to the first request that matches.
     */
    __matineePreload?: Record<string, Promise<Response> | undefined>
  }
}

async function preloadedFetch(request: Request): Promise<Response> {
  const preload = window.__matineePreload
  if (preload && request.method === "POST") {
    const key = `${new URL(request.url).pathname} ${await request.clone().text()}`
    const answer = preload[key]
    if (answer) {
      delete preload[key]
      // Once they're all taken, requests no longer read their bodies here.
      if (Object.keys(preload).length === 0) delete window.__matineePreload
      const response = await answer.catch(() => null)
      if (response) return response
    }
  }
  return fetch(request)
}

export const client = createMatineeClient({ fetch: preloadedFetch })
export const orpc = createTanstackQueryUtils(client)

/** Called when the server says the session is gone. Set by the router. */
export const sessionLost = { handler: () => {} }

function onError(error: Error) {
  if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
    sessionLost.handler()
  }
}

/** The server turned the request down, so asking again won't help. */
function refused(error: Error | null): boolean {
  return error instanceof ORPCError && error.status < 500
}

// A stream that ended, as the server ends each after a few minutes, opens
// again after this. Failed ones back off up to the cap.
const RECONNECT_MS = 1000
const MAX_RECONNECT_MS = 10_000

/**
 * Options for a query that follows a stream from the server, spread after
 * `experimental_liveOptions()`. Its data is the latest value. It opens a
 * new stream on mount and whenever one ends or fails, unless the server
 * refused it.
 */
export const liveQuery = {
  staleTime: 0,
  retry: (_failures: number, error: Error) => !refused(error),
  retryDelay: (failures: number) =>
    Math.min(RECONNECT_MS * 2 ** failures, MAX_RECONNECT_MS),
  // While the stream is open the query is still fetching, so this only
  // runs once it has ended.
  refetchInterval: (query: {
    state: { fetchStatus: FetchStatus; error: Error | null }
  }) =>
    query.state.fetchStatus === "idle" && !refused(query.state.error)
      ? RECONNECT_MS
      : false,
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) => !refused(error) && failures < 2,
    },
  },
})

/** A message to show the user for a failed call. */
export function errorMessage(cause: unknown): string {
  if (cause instanceof ORPCError) {
    return cause.status < 500 && cause.message
      ? translateKnown(cause.message)
      : tr("common.error.server")
  }
  if (cause instanceof Error && cause.name === "NotAllowedError") {
    return tr("common.error.passkeyClosed")
  }
  if (cause instanceof Error && cause.name === "InvalidStateError") {
    return tr("common.error.passkeyExists")
  }
  if (cause instanceof Error && cause.message) {
    return translateKnown(cause.message)
  }
  return tr("common.error.unknown")
}
