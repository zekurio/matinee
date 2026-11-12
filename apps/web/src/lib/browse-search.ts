import { TitleKind } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import type { Sort } from "@/components/library/list-params"

/** A genre's or studio's search params. Both kinds is the default. */
export const BrowseSearch = t.object({
  q: t.string().min(1).optional().catch(undefined),
  sort: t.enum(["recent", "year"]).optional().catch(undefined) satisfies t.Type<
    Sort | undefined
  >,
  kind: TitleKind.optional().catch(undefined),
})
export type BrowseSearch = t.infer<typeof BrowseSearch>
