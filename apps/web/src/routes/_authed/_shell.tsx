import { AUTH_ERROR_QUERY_KEY } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { lazy, Suspense, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { SETTINGS_OVERVIEW, useSettingsLocation } from "@/lib/settings"

// Every settings panel is in here, and most visits never open one.
const SettingsDialog = lazy(() =>
  import("@/components/settings/settings-dialog").then((module) => ({
    default: module.SettingsDialog,
  })),
)

const ShellSearch = t.object({
  /** An OIDC link failure, shown in the account section. */
  [AUTH_ERROR_QUERY_KEY]: t.string().optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/_shell")({
  validateSearch: ShellSearch,
  component: Shell,
})

function Shell() {
  const { user } = Route.useRouteContext()
  const settings = useSettingsLocation()
  const open = settings.target !== null
  // Loaded the first time settings open, then kept, so it can animate
  // closed.
  const [settingsLoaded, setSettingsLoaded] = useState(open)
  if (open && !settingsLoaded) setSettingsLoaded(true)

  return (
    <AppShell user={user}>
      <Outlet />
      {settingsLoaded && (
        <Suspense>
          <SettingsDialog
            user={user}
            section={settings.target}
            onClose={settings.close}
            onNavigate={(section) => settings.open(section, { replace: true })}
            // Its own history entry, so the phone's back gesture returns to the
            // menu.
            onOpenSection={(section) =>
              settings.open(section, { fromOverview: true })
            }
            onBack={() => {
              if (settings.fromOverview) {
                window.history.back()
                return
              }
              // Opened straight on a section, so there's no menu entry to pop:
              // this entry becomes the menu.
              settings.open(SETTINGS_OVERVIEW, { replace: true })
            }}
          />
        </Suspense>
      )}
    </AppShell>
  )
}
