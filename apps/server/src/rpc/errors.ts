import { ORPCError } from "@orpc/server"

import { log } from "../log"

/**
 * Log what went wrong unexpectedly, for `onError` in both handlers. The
 * client gets a bare 500 for those.
 */
export function logError(cause: unknown): void {
  // Expected failures carry a status below 500 and a user-facing message.
  if (cause instanceof ORPCError && cause.status < 500) return
  log.error("RPC failed", cause)
}
