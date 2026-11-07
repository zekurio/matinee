import "@matinee/ui/globals.css"
import { initTheme } from "@matinee/ui/lib/theme"
import { QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { orpc, queryClient, sessionLost } from "./lib/rpc"
import { routeTree } from "./routeTree.gen"

initTheme()

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
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
