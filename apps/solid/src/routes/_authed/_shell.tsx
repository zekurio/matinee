import {
  createFileRoute,
  Outlet,
  useChildMatches,
} from "@tanstack/solid-router"
import { createMemo } from "solid-js"

import { AppShell } from "@/components/app-shell"
import { Home } from "@/components/home"

export const Route = createFileRoute("/_authed/_shell")({ component: Shell })

/**
 * Home is built the first time it shows and then kept out of the page
 * while another one shows, so coming back to it only puts it back. It goes
 * after the outlet, so the other pages keep the element paths the router's
 * scroll restoration finds their rows by.
 */
function Shell() {
  const context = Route.useRouteContext()
  const onHome = useChildMatches({
    select: (matches) => matches[0]?.routeId === "/_authed/_shell/",
  })
  let shown = false
  const keep = createMemo(() => (shown ||= onHome()))
  // Reads only `keep`, which stays true once it is, so Home is built once.
  const home = createMemo(() =>
    keep() ? (
      <div>
        <Home showing={onHome()} />
      </div>
    ) : undefined,
  )
  return (
    <AppShell user={context().user}>
      <Outlet />
      {onHome() ? home() : undefined}
    </AppShell>
  )
}
