import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

import { orpc } from "@/lib/rpc"

/** Everything below needs a signed-in user. */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ context, location }) => {
    const { user } = await context.queryClient.ensureQueryData(
      orpc.auth.session.queryOptions(),
    )
    if (user) return { user }
    const config = await context.queryClient.ensureQueryData(
      orpc.auth.config.queryOptions(),
    )
    if (config.setupRequired) throw redirect({ to: "/setup" })
    throw redirect({ to: "/login", search: { redirect: location.href } })
  },
  component: Outlet,
})
