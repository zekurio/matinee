import type { CatalogInput } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"

import type { Viewer } from "../access/viewer"
import { follow } from "../realtime/follow"
import { availability } from "./availability"
import { withCachedDetails } from "./cached-details"

export function liveRequests(
  viewer: Viewer,
  titles: t.infer<typeof CatalogInput>[],
  signal: AbortSignal | undefined,
) {
  return follow({
    topics: ["requests", "library", "fulfilment"],
    signal,
    load: async () =>
      availability(viewer, await withCachedDetails(viewer, titles)),
  })
}
