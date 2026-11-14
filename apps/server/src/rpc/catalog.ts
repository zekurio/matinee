import * as catalogReads from "../catalog"
import * as related from "../catalog/related"
import { authed } from "./base"
import { catalogFailure } from "./catalog-errors"

export const catalog = {
  search: authed.catalog.search.handler(({ context, input }) =>
    catalogReads.search(context.user, input).catch(catalogFailure),
  ),
  details: authed.catalog.details.handler(({ context, input }) =>
    catalogReads.details(context.user, input).catch(catalogFailure),
  ),
  related: authed.catalog.related.handler(({ context, input }) =>
    related.rails(context.user, input).catch(catalogFailure),
  ),
  relatedTitles: authed.catalog.relatedTitles.handler(({ context, input }) =>
    related.titles(context.user, input).catch(catalogFailure),
  ),
  missingSeasons: authed.catalog.missingSeasons.handler(({ context, input }) =>
    catalogReads
      .missingSeasons(context.user, input.titleId)
      .catch(catalogFailure),
  ),
}
