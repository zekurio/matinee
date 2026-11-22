import { TitleKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { titleListSearch } from "@/components/library/title-filter-params"

/**
 * A genre's or studio's search params: the kind, both by
 * default, and the titles' filters and order. `genre` and `studio` add to
 * the page's own.
 */
export const BrowseSearch = t.object({
  kind: TitleKind.optional().catch(undefined),
  ...titleListSearch,
})
export type BrowseSearch = t.infer<typeof BrowseSearch>

/**
 * The Movies or Shows page's search params: the library to
 * narrow to, every one of the kind by default, and the titles' filters
 * and order.
 */
export const KindSearch = t.object({
  library: t.uuid().optional().catch(undefined),
  ...titleListSearch,
})
export type KindSearch = t.infer<typeof KindSearch>
