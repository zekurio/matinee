import {
  linkOptions,
  useMatch,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useCallback } from "react"

declare module "@tanstack/react-router" {
  interface HistoryState {
    /**
     * The settings section open over the page. The address bar shows the
     * section's path as a mask, and this entry keeps the page itself.
     */
    settings?: string
    /** Set when a phone opened a settings section from the overview. */
    settingsFromOverview?: boolean
  }
}

/** Settings sections in nav order, each with its path under `/settings`. */
const SECTIONS = [
  { id: "account", path: "account" },
  { id: "appearance", path: "appearance" },
  { id: "playback", path: "playback" },
  { id: "libraries", path: "admin/libraries" },
  { id: "users", path: "admin/users" },
  { id: "access", path: "admin/access" },
  { id: "authentication", path: "admin/authentication" },
  { id: "transcoding", path: "admin/transcoding" },
  { id: "trickplay", path: "admin/trickplay" },
  { id: "jobs", path: "admin/jobs" },
  { id: "branding", path: "admin/branding" },
] as const

export type SettingsSectionId = (typeof SECTIONS)[number]["id"]

/**
 * "Settings, no section in particular", at `/settings`. A phone shows the
 * menu of sections for it; wider layouts open the first section.
 */
export const SETTINGS_OVERVIEW = "overview"

export type SettingsTarget = SettingsSectionId | typeof SETTINGS_OVERVIEW

/** The settings address, for a link, a navigation, or a mask. */
function settingsPath(target: SettingsTarget) {
  const section = SECTIONS.find(({ id }) => id === target)
  return linkOptions({
    to: "/settings/$",
    params: { _splat: section?.path ?? "" },
  })
}

/**
 * What an address or a history entry names. Anything unknown, from an old
 * link or an old entry, gets the overview, as no section in particular.
 */
function targetAt(
  key: "id" | "path",
  value: string | undefined,
): SettingsTarget | null {
  if (value === undefined) return null
  return (
    SECTIONS.find((section) => section[key] === value)?.id ?? SETTINGS_OVERVIEW
  )
}

/**
 * Settings over the current page: the page stays where it is, the target
 * goes in its history entry, and the bar shows the target's path.
 */
export function settingsLink(target: SettingsTarget) {
  return linkOptions({
    to: ".",
    search: true,
    hash: true,
    state: { settings: target },
    mask: settingsPath(target),
    resetScroll: false,
  })
}

/** Opens the settings dialog over the current page. */
export function useOpenSettings() {
  const navigate = useNavigate()
  return useCallback(
    (target: SettingsTarget = SETTINGS_OVERVIEW) =>
      void navigate(settingsLink(target)),
    [navigate],
  )
}

/**
 * Where the settings dialog stands, and the ways to move it.
 *
 * Opened from a page, settings is a mask over it (see `settingsLink`). A
 * settings path loaded fresh has no page under it: it's its own route, over
 * Home, and moving between sections there changes the real address.
 */
export function useSettingsLocation() {
  const navigate = useNavigate()
  const route = useMatch({
    from: "/_authed/_shell/settings/$",
    shouldThrow: false,
  })
  const entry = useRouterState({
    select: (state) => state.location.state.settings,
  })
  const fromOverview = useRouterState({
    select: (state) => state.location.state.settingsFromOverview === true,
  })
  const onRoute = route !== undefined
  // A `/settings/` with a trailing slash has no splat at all.
  const target = onRoute
    ? targetAt("path", route.params._splat ?? "")
    : targetAt("id", entry)

  const open = useCallback(
    (
      next: SettingsTarget,
      options: { replace?: boolean; fromOverview?: boolean } = {},
    ) => {
      const flags = options.fromOverview ? { settingsFromOverview: true } : {}
      if (onRoute) {
        // The search keeps an OIDC link failure on its way to the account
        // section.
        void navigate({
          ...settingsPath(next),
          search: true,
          state: flags,
          replace: options.replace,
        })
        return
      }
      const link = settingsLink(next)
      void navigate({
        ...link,
        state: { ...link.state, ...flags },
        replace: options.replace,
      })
    },
    [navigate, onRoute],
  )

  // Closing replaces the entry, so Back doesn't open settings again. With no
  // page under it, the dialog leaves Home in the bar.
  const close = useCallback(() => {
    void navigate(
      onRoute
        ? { to: "/", replace: true }
        : {
            to: ".",
            search: true,
            hash: true,
            replace: true,
            resetScroll: false,
          },
    )
  }, [navigate, onRoute])

  return { target, fromOverview, open, close }
}
