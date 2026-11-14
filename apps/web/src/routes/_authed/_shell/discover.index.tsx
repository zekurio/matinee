import { createFileRoute } from "@tanstack/react-router"

import { railsOptions } from "@/components/discover/discover-data"
import { DiscoverRails } from "@/components/discover/discover-rails"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"
import { reloadOnEnter } from "@/lib/route-loading"

/**
 * Discover on its own page, from the bar on wider screens. Phones have it
 * under the field on the search tab.
 */
export const Route = createFileRoute("/_authed/_shell/discover/")({
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient } }) =>
    void queryClient.prefetchQuery(railsOptions()),
  component: DiscoverPage,
})

function DiscoverPage() {
  const title = tr("discover.title")
  useDocumentTitle(title)
  return (
    <div>
      <PageHeader title={title} />
      <DiscoverRails />
    </div>
  )
}
