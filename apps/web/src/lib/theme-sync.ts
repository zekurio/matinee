import { setServerThemeAccents } from "@matinee/ui/lib/theme"
import { type QueryClient, QueryObserver } from "@tanstack/solid-query"

import { orpc } from "./rpc"

/**
 * Hands the server's accents for the Matinee theme to the theme engine,
 * on every page, signed in or not, for as long as the app runs. It watches
 * the config query from outside the route tree, so no route has to mount
 * anything for its buttons to wear the accent, and none can leave it out.
 *
 * Watching also asks for the config, and again when the tab gets the focus
 * back, so an accent an admin changed elsewhere replaces the cached one.
 */
export function followServerThemeAccents(queryClient: QueryClient): void {
  const config = new QueryObserver(queryClient, orpc.auth.config.queryOptions())
  const apply = (accents = config.getCurrentResult().data?.themeAccents) => {
    if (accents) setServerThemeAccents(accents)
  }
  config.subscribe((result) => apply(result.data?.themeAccents))
  apply()
}
