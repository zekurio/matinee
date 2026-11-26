import "./styles.css"
import "@matinee/ui/globals.css"
import {
  API_REFERENCE_PAGE_PATH,
  INVITE_PAGE_PATH,
} from "@matinee/contracts/paths"
import { isTvMode } from "@matinee/tv/tv-mode"
import { initTheme } from "@matinee/ui/lib/theme"
import { render } from "@solidjs/web"
import { QueryClientProvider } from "@tanstack/solid-query"
import { createRouter, RouterProvider } from "@tanstack/solid-router"

import { LocaleBoundary } from "@/i18n/solid"
import { prefetchHome } from "@/lib/home-queries"
import { orpc, queryClient, sessionLost } from "@/lib/rpc"
import { syncUiText } from "@/lib/ui-text"
import { warmUiSdk } from "@/lib/warm-styles"
import { applyLanguage } from "@/stores/language"

import { routeTree } from "./routeTree.gen"

// A browser in TV mode starts on the TV UI, a document of its own, whose
// Settings and sign-in screen have the switch that turns it off. Only the
// root moves: sign-in, setup, and the link pages stay.
if (location.pathname === "/" && isTvMode()) location.replace("/tv/")

initTheme()
syncUiText()
// The text face loads only once text needs it, and until it's in, text
// shows in a wider fallback, so everything shifts when it swaps in. Asking
// now lets it load with the language; the first render waits for both,
// but no longer than FONT_WAIT_MS on a slow line.
const FONT_WAIT_MS = 500
const fontReady = Promise.race([
  document.fonts.load('1em "Red Hat Text Variable"').catch(() => []),
  new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
])
/**
 * Pages for someone signed out. They ask for nothing that needs a session,
 * and a lost session doesn't send them to the login.
 */
const SIGNED_OUT_PAGES = [
  "/login",
  "/setup",
  INVITE_PAGE_PATH,
  API_REFERENCE_PAGE_PATH,
]
// Every page but the login asks who is signed in first. Asking now, while
// the language loads, saves the round trip after it.
void queryClient.prefetchQuery(orpc.auth.session.queryOptions())
if (!SIGNED_OUT_PAGES.includes(location.pathname)) {
  void queryClient.prefetchQuery(orpc.libraries.list.queryOptions())
}
if (location.pathname === "/") prefetchHome(queryClient)
warmUiSdk()
await Promise.all([applyLanguage(), fontReady])

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

sessionLost.handler = () => {
  queryClient.setQueryData(orpc.auth.session.queryKey(), { user: null })
  const { pathname, href } = router.state.location
  if (SIGNED_OUT_PAGES.includes(pathname)) return
  void router.navigate({ to: "/login", search: { redirect: href } })
}

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <LocaleBoundary>
        <RouterProvider router={router} />
      </LocaleBoundary>
    </QueryClientProvider>
  ),
  root,
)
