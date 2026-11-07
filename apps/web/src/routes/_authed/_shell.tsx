import { AUTH_ERROR_QUERY_KEY } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useCallback } from "react"

import { AppShell } from "@/components/app-shell"
import { SettingsDialog } from "@/components/settings/settings-dialog"
import { SETTINGS_OVERVIEW } from "@/lib/settings"

const ShellSearch = t.object({
  /** The open settings section; settings is a dialog over any page. */
  settings: t.string().optional().catch(undefined),
  /** An OIDC link failure, shown in the account section. */
  [AUTH_ERROR_QUERY_KEY]: t.string().optional().catch(undefined),
})
type ShellSearch = t.infer<typeof ShellSearch>

export const Route = createFileRoute("/_authed/_shell")({
  validateSearch: ShellSearch,
  component: Shell,
})

function Shell() {
  const { user } = Route.useRouteContext()
  const { settings } = Route.useSearch()
  const navigate = useNavigate()
  const fromOverview = useRouterState({
    select: (state) => state.location.state.settingsFromOverview === true,
  })

  const setSettings = useCallback(
    (
      section: string | undefined,
      options: { replace?: boolean; fromOverview?: boolean } = {},
    ) =>
      void navigate({
        to: ".",
        search: (prev: ShellSearch) => ({
          ...prev,
          settings: section,
          // The error belongs to the visit that caused it.
          [AUTH_ERROR_QUERY_KEY]: section
            ? prev[AUTH_ERROR_QUERY_KEY]
            : undefined,
        }),
        replace: options.replace,
        state: options.fromOverview
          ? { settingsFromOverview: true }
          : undefined,
        resetScroll: false,
      }),
    [navigate],
  )

  return (
    <AppShell user={user}>
      <Outlet />
      <SettingsDialog
        user={user}
        section={settings ?? null}
        onClose={() => setSettings(undefined, { replace: true })}
        onNavigate={(section) => setSettings(section, { replace: true })}
        // Its own history entry, so the phone's back gesture returns to the
        // menu.
        onOpenSection={(section) =>
          setSettings(section, { fromOverview: true })
        }
        onBack={() => {
          if (fromOverview) {
            window.history.back()
            return
          }
          // Opened straight on a section, so there's no menu entry to pop:
          // this entry becomes the menu.
          setSettings(SETTINGS_OVERVIEW, { replace: true })
        }}
      />
    </AppShell>
  )
}
