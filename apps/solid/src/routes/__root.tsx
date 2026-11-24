import type { QueryClient } from "@tanstack/solid-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/solid-router"

import { Toaster } from "@/kit/toast"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  { component: Root },
)

function Root() {
  return (
    <>
      <Outlet />
      <Toaster
        mobileOffset={{
          bottom:
            "calc(env(safe-area-inset-bottom) + 16px + var(--tab-bar-space, 0px))",
        }}
      />
    </>
  )
}
