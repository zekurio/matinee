import { ORPCError, ValidationError } from "@orpc/server"

import { log } from "../log"

/** What a failed input says when no issue reads as something to act on. */
const CHECK_INPUT = "Check what you entered and try again."

/**
 * Log what went wrong unexpectedly, for `onError` in both handlers. The
 * client gets a bare 500 for those.
 */
export function logError(cause: unknown): void {
  // Expected failures carry a status below 500 and a user-facing message.
  if (cause instanceof ORPCError && cause.status < 500) return
  log.error("RPC failed", cause)
}

/**
 * Give an input that fails its schema the first issue's message, in place of
 * oRPC's "Input validation failed", which the web app can't translate. Put
 * it in `onError` in both handlers, as oRPC's validation recipe does: the
 * callback throws the new error, which replaces the one it was given.
 */
export function mapValidationError(cause: unknown): void {
  if (!(cause instanceof ORPCError) || cause.code !== "BAD_REQUEST") return
  const validation = cause.cause
  if (!(validation instanceof ValidationError)) return
  const { issues } = validation
  const first = issues[0]?.message
  throw new ORPCError("BAD_REQUEST", {
    message: first !== undefined && isUserText(first) ? first : CHECK_INPUT,
    data: { issues },
    cause,
  })
}

/**
 * False for the English a schema gives when it names no message of its own:
 * TypeBox's "must be ..." keyword errors and the builder's generic "Invalid"
 * texts. Those say nothing the person can act on.
 */
function isUserText(message: string): boolean {
  return (
    !message.startsWith("must ") &&
    message !== "Invalid value" &&
    message !== "Invalid input"
  )
}
