import { createMatineeClient, ORPCError } from "@matinee/client"
import { createTanstackQueryUtils } from "@orpc/tanstack-query"
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"

export const client = createMatineeClient()
export const orpc = createTanstackQueryUtils(client)

/** Called when the server says the session is gone. Set by the router. */
export const sessionLost = { handler: () => {} }

function onError(error: Error) {
  if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
    sessionLost.handler()
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) =>
        !(error instanceof ORPCError && error.status < 500) && failures < 2,
    },
  },
})

/** A message to show the user for a failed call. */
export function errorMessage(cause: unknown): string {
  if (cause instanceof ORPCError) {
    return cause.status < 500 && cause.message
      ? cause.message
      : "The server ran into a problem. Check its log."
  }
  if (cause instanceof Error && cause.name === "NotAllowedError") {
    return "The passkey prompt was closed before it finished."
  }
  if (cause instanceof Error && cause.name === "InvalidStateError") {
    return "This device already has a passkey for your account."
  }
  if (cause instanceof Error && cause.message) return cause.message
  return "Something went wrong."
}
