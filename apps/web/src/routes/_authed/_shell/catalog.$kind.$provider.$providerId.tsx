import { CatalogRef } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { createFileRoute } from "@tanstack/react-router"

import { detailsOptions } from "@/components/catalog/catalog-data"
import { CatalogTitlePage } from "@/components/catalog/catalog-page"
import { reloadOnEnter } from "@/lib/route-loading"

const CatalogSearch = t.object({
  /** The library it would go to, when the viewer picked another. */
  library: t.uuid().optional().catch(undefined),
})

// The server issues these references; the page passes them back as they
// came and never builds one from another id.
export const Route = createFileRoute(
  "/_authed/_shell/catalog/$kind/$provider/$providerId",
)({
  validateSearch: CatalogSearch,
  loaderDeps: ({ search }) => ({ library: search.library }),
  // Starts the page's call while its code loads, and on hover.
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient }, params, deps }) => {
    const ref = CatalogRef.safeParse(params)
    if (ref.success) {
      void queryClient.prefetchQuery(detailsOptions(ref.data, deps.library))
    }
  },
  component: CatalogTitlePage,
})
