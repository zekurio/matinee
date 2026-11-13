import { Toaster } from "@matinee/ui/components/sonner"
import { TooltipProvider } from "@matinee/ui/components/tooltip"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { PageScrollbar } from "@/components/page-scrollbar"
import { PlaybackAccountSync } from "@/lib/playback-sync"
import { ServerThemeAccents } from "@/lib/theme-sync"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Root,
  },
)

function Root() {
  return (
    <TooltipProvider>
      <ServerThemeAccents />
      <PlaybackAccountSync />
      <Outlet />
      <PageScrollbar />
      <Toaster
        // Above the home indicator, and the phone's tab bar while it shows
        // (`TabBar` sets the variable).
        mobileOffset={{
          bottom:
            "calc(env(safe-area-inset-bottom) + 16px + var(--tab-bar-space, 0px))",
        }}
      />
    </TooltipProvider>
  )
}
