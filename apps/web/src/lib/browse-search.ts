import { TitleKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { titleListSearch } from "@/components/library/title-filter-params"

/**
 * A genre's or studio's search params: the search, the kind, both by
 * default, and the titles' filters and order. `genre` and `studio` add to
 * the page's own.
 */
export const BrowseSearch = t.object({
  q: t.string().min(1).optional().catch(undefined),
  kind: TitleKind.optional().catch(undefined),
  ...titleListSearch,
})
export type BrowseSearch = t.infer<typeof BrowseSearch>
