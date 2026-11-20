import { Button } from "@matinee/ui/components/button"
import { Toaster } from "@matinee/ui/components/sonner"
import { TooltipProvider } from "@matinee/ui/components/tooltip"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Link,
  Outlet,
} from "@tanstack/react-router"
import { useEffect } from "react"

import { StatusScreen } from "@/components/auth-screen"
import { PageScrollbar } from "@/components/page-scrollbar"
import { tr } from "@/i18n"
import { PlaybackAccountSync } from "@/lib/playback-sync"
import { ServerThemeAccents } from "@/lib/theme-sync"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    component: Root,
    errorComponent: RouteError,
    notFoundComponent: RouteNotFound,
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

/**
 * Shown when a page throws. The message stays off the page: it's for
 * developers, so it goes to the console instead.
 */
function RouteError({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    // `reportError` logs to the console without the `console` calls the
    // lint rules ban in the app.
    reportError(error)
  }, [error])
  return (
    <StatusScreen
      title={tr("common.error.unknown")}
      description={tr("common.error.pageDescription")}
      actions={
        <>
          <Button size="lg" onClick={() => reset()}>
            {tr("common.error.retry")}
          </Button>
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={<Link to="/" />}
          >
            {tr("common.backHome")}
          </Button>
        </>
      }
    />
  )
}

function RouteNotFound() {
  return (
    <StatusScreen
      title={tr("common.notFound.title")}
      description={tr("common.notFound.description")}
      actions={
        <Button size="lg" nativeButton={false} render={<Link to="/" />}>
          {tr("common.backHome")}
        </Button>
      }
    />
  )
}
