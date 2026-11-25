import { createFileRoute } from "@tanstack/solid-router"
import { Show } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { railsOptions } from "@/components/discover/discover-data"
import { DiscoverRails } from "@/components/discover/discover-rails"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { TabHeader } from "@/components/phone-nav"
import { tr } from "@/i18n"
import { reloadOnEnter } from "@/lib/route-loading"
import { isPhone } from "@/lib/viewport"

/**
 * Discover on its own page, from the bar on wider screens. On a phone it's
 * the Explore tab, with the Flutter app's title band and search.
 */
export const Route = createFileRoute("/_authed/_shell/discover/")({
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient } }) =>
    void queryClient.prefetchQuery(railsOptions()),
  component: DiscoverPage,
})

function DiscoverPage() {
  const title = () => (isPhone() ? tr("shell.explore") : tr("discover.title"))
  useDocumentTitle(title)
  return (
    <div class={[pageGutter, "pb-6 sm:pt-8"]}>
      <Show when={!isPhone()} fallback={<TabHeader title={title()} search />}>
        <PageHeader title={title()} />
      </Show>
      <DiscoverRails />
    </div>
  )
}
