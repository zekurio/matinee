import { Toaster } from "@matinee/ui/components/sonner"
import { TooltipProvider } from "@matinee/ui/components/tooltip"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"

import { PageScrollbar } from "@/components/page-scrollbar"
import { PlaybackAccountSync } from "@/lib/playback-sync"
import { ServerThemeAccents, ThemeAccountSync } from "@/lib/theme-sync"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Root,
  },
)

function Root() {
  return (
    <TooltipProvider>
      <ServerThemeAccents />
      <ThemeAccountSync />
      <PlaybackAccountSync />
      <Outlet />
      <PageScrollbar />
      <Toaster
        // Above the home indicator.
        mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      />
    </TooltipProvider>
  )
}
