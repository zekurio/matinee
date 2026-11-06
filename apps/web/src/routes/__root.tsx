import { Toaster } from "@matinee/ui/components/sonner"
import { TooltipProvider } from "@matinee/ui/components/tooltip"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Root,
  },
)

function Root() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster
        position="bottom-right"
        // On phones, clear the bottom tab bar.
        mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 84px)" }}
      />
    </TooltipProvider>
  )
}
