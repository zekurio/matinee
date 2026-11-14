import { ORPCError } from "@orpc/server"

import { log } from "../log"
import { ProviderError } from "../metadata/types"

/**
 * Turn a metadata provider's failure on a catalog read into a message a
 * viewer can act on. They can't fix a key or a provider, so unlike
 * `providerFailure` this doesn't say which provider or why.
 */
export function catalogFailure(cause: unknown): never {
  if (cause instanceof ProviderError) {
    log.warn("Catalog provider request failed", cause)
    if (cause.status === 404) {
      throw new ORPCError("NOT_FOUND", {
        message: "Matinee can't find this title.",
      })
    }
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Matinee can't look titles up right now. Try again in a minute.",
    })
  }
  throw cause
}
