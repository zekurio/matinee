import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router"

import { identifyBrowser } from "@/lib/client-name"
import { orpc } from "@/lib/rpc"

/**
 * Everything below needs a signed-in user.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const { user } = await context.queryClient.ensureQueryData(
      orpc.auth.session.queryOptions(),
    )
    if (user) identifyBrowser(user)
    // Setup redirects wait until the trial app has a /setup route.
    if (user && user.role !== "admin") return { user }
    const config = await context.queryClient.ensureQueryData(
      orpc.auth.config.queryOptions(),
    )
    if (user) return { user }
    void config
    throw redirect({ to: "/login", search: { redirect: location.href } })
  },
  component: Outlet,
})
