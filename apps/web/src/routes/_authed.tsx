import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { orpc } from "@/lib/rpc"

/**
 * Everything below needs a signed-in user. An admin who hasn't finished
 * setup goes back to it.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const { user } = await context.queryClient.ensureQueryData(
      orpc.auth.session.queryOptions(),
    )
    // Only an admin can have setup left, so nobody else waits for config.
    if (user && user.role !== "admin") return { user }
    const config = await context.queryClient.ensureQueryData(
      orpc.auth.config.queryOptions(),
    )
    if (user) {
      if (config.setup) throw redirect({ to: "/setup" })
      return { user }
    }
    if (config.setup?.accountRequired) throw redirect({ to: "/setup" })
    throw redirect({ to: "/login", search: { redirect: location.href } })
  },
  component: Outlet,
})
