import "@matinee/ui/globals.css"
import { initTheme } from "@matinee/ui/lib/theme"
import { QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { LocaleBoundary } from "./i18n/react"
import { homeQueries } from "./lib/home-queries"
import { orpc, queryClient, sessionLost } from "./lib/rpc"
import { syncUiText } from "./lib/ui-text"
import { routeTree } from "./routeTree.gen"
import { applyLanguage } from "./stores/language"

initTheme()
syncUiText()
// Every page but the login asks who is signed in first. Asking now, while
// the language loads, saves the round trip after it. So does asking for
// what the signed-in pages show first: the libraries in the menu, and on
// Home its rows. Without a session they fail, and the login follows.
void queryClient.prefetchQuery(orpc.auth.session.queryOptions())
if (!["/login", "/setup"].includes(location.pathname)) {
  void queryClient.prefetchQuery(orpc.libraries.list.queryOptions())
}
if (location.pathname === "/") {
  void queryClient.prefetchQuery(homeQueries.resume())
  void queryClient.prefetchQuery(homeQueries.nextUp())
  void queryClient.prefetchQuery(homeQueries.featured())
}
// The first render is in the right language, so it waits for it to load.
await applyLanguage()

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
  if (pathname === "/login" || pathname === "/setup") return
  void router.navigate({ to: "/login", search: { redirect: href } })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocaleBoundary>
        <RouterProvider router={router} />
      </LocaleBoundary>
    </QueryClientProvider>
  </StrictMode>,
)
