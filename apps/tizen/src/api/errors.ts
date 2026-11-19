import { ORPCError } from "@matinee/client"

import { tr } from "@/i18n"
import { type Json } from "@/lib/decode"

/*
 * What went wrong reaching the server, in words for the person: the
 * server's own message when it sent one, which it writes to be shown,
 * else whether it answered at all. The engine's own text for a failed
 * request names sockets and addresses, in English, so it's never shown.
 */

/** The server answered with an error, rather than not answering. */
export function isServerError(
  cause: unknown,
): cause is ORPCError<string, Json> {
  return cause instanceof ORPCError
}

/** The server couldn't be reached, or the connection broke off. */
export function isDisconnect(cause: unknown): boolean {
  return !isServerError(cause)
}

/** The session ended: signed out elsewhere, or expired. */
export function isSignedOut(cause: unknown): boolean {
  return isServerError(cause) && cause.code === "UNAUTHORIZED"
}

/** What oRPC says for input that fails its schema, which names nothing the person can fix. */
const VALIDATION_MESSAGE = "Input validation failed"

export function describeFailure(cause: unknown): string {
  if (!isServerError(cause)) {
    return navigator.onLine === false
      ? tr("error_unreachable")
      : tr("error_connection_lost")
  }
  if (cause.status >= 500 || !cause.message) return tr("error_server")
  if (cause.message === VALIDATION_MESSAGE) return tr("error_server")
  return cause.message
}
