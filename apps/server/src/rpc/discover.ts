import { ORPCError } from "@orpc/server"

import * as browse from "../catalog/browse"
import * as discoverReads from "../catalog/discover"
import { ProviderError } from "../metadata/types"
import { authed } from "./base"
import { catalogFailure } from "./catalog-errors"

/** TMDB turning a browse's filters down, which the contract should have caught. */
function browseFailure(cause: unknown): never {
  if (
    cause instanceof ProviderError &&
    (cause.status === 400 || cause.status === 422)
  )
    throw new ORPCError("BAD_REQUEST", {
      message:
        "The catalog didn't take these filters. Change them and try again.",
    })
  return catalogFailure(cause)
}

export const discover = {
  rails: authed.discover.rails.handler(({ context }) =>
    discoverReads.rails(context.user),
  ),
  page: authed.discover.page.handler(({ context, input }) =>
    discoverReads.page(context.user, input).catch(catalogFailure),
  ),
  browseOptions: authed.discover.browseOptions.handler(({ context, input }) =>
    browse.options(context.user, input.kind).catch(catalogFailure),
  ),
  browse: authed.discover.browse.handler(({ context, input }) =>
    browse.page(context.user, input).catch(browseFailure),
  ),
}
