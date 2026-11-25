import { AUTH_ERROR_QUERY_KEY } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  createFileRoute,
  Outlet,
  useChildMatches,
} from "@tanstack/solid-router"
import { createMemo, lazy, Loading, Show } from "solid-js"

import { AppShell } from "@/components/app-shell"
import { Home } from "@/components/home"
import { SETTINGS_OVERVIEW, useSettingsLocation } from "@/lib/settings"
import { ServerThemeAccents } from "@/lib/theme-sync"

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

/** The routes Home shows under: its own, and a settings address opened fresh. */
const HOME_ROUTES = new Set<string>([
  "/_authed/_shell/",
  "/_authed/_shell/settings/$",
])

/**
 * Home is built the first time it shows and then kept out of the page
 * while another one shows, so coming back to it only puts it back. It goes
 * after the outlet, so the other pages keep the element paths the router's
 * scroll restoration finds their rows by.
 */
function Shell() {
  const context = Route.useRouteContext()
  const onHome = useChildMatches({
    select: (matches) => HOME_ROUTES.has(matches[0]?.routeId ?? ""),
  })
  let shown = false
  const keep = createMemo(() => (shown ||= onHome()))
  // Reads only `keep`, which stays true once it is, so Home is built once.
  const home = createMemo(() =>
    keep() ? (
      <div>
        <Home showing={onHome()} />
      </div>
    ) : undefined,
  )

  const settings = useSettingsLocation()
  // Loaded the first time settings open, then kept, so it can animate
  // closed.
  let opened = false
  const settingsLoaded = createMemo(
    () => (opened ||= settings.target() !== null),
  )

  return (
    <AppShell user={context().user}>
      <ServerThemeAccents />
      <Outlet />
      {onHome() ? home() : undefined}
      <Show when={settingsLoaded()}>
        <Loading>
          <SettingsDialog
            user={context().user}
            section={settings.target()}
            onClose={settings.close}
            onNavigate={(section) => settings.open(section, { replace: true })}
            // Its own history entry, so the phone's back gesture returns to
            // the menu.
            onOpenSection={(section) =>
              settings.open(section, { fromOverview: true })
            }
            onBack={() => {
              if (settings.fromOverview()) {
                window.history.back()
                return
              }
              // Opened straight on a section, so there's no menu entry to
              // pop: this entry becomes the menu.
              settings.open(SETTINGS_OVERVIEW, { replace: true })
            }}
          />
        </Loading>
      </Show>
    </AppShell>
  )
}
