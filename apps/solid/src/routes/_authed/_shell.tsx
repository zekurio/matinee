import { createFileRoute, Outlet } from "@tanstack/solid-router"

import { AppShell } from "@/components/app-shell"

export const Route = createFileRoute("/_authed/_shell")({ component: Shell })

function Shell() {
  const context = Route.useRouteContext()
  return (
    <AppShell user={context().user}>
      <Outlet />
    </AppShell>
  )
}
