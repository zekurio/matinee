import {
  linkOptions,
  useMatch,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/solid-router"

declare module "@tanstack/solid-router" {
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
  { id: "apiTokens", path: "api-tokens" },
  { id: "libraries", path: "admin/libraries" },
  { id: "users", path: "admin/users" },
  { id: "access", path: "admin/access" },
  { id: "requests", path: "admin/requests" },
  { id: "authentication", path: "admin/authentication" },
  { id: "transcoding", path: "admin/transcoding" },
  { id: "trickplay", path: "admin/trickplay" },
  { id: "network", path: "admin/network" },
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
  return (target: SettingsTarget = SETTINGS_OVERVIEW) =>
    void navigate(settingsLink(target))
}

/**
 * Where the settings dialog stands, and the ways to move it.
 * Read the target and fromOverview accessors in a tracked scope.
 *
 * Opened from a page, settings is a mask over it (see `settingsLink`). A
 * settings path loaded fresh has no page under it: it's its own route, over
 * Home, and moving between sections there changes the real address.
 */
export function useSettingsLocation() {
  const router = useRouter()
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
  // Accessor for the section named by the current route or masked entry.
  const target = () => {
    const match = route()
    return match
      ? targetAt("path", match.params._splat ?? "")
      : targetAt("id", entry())
  }

  // The router strips the leading character when it reads a masked hash.
  // Its saved unmasked URL still holds the full fragment.
  const pageHash = () => {
    const href = router.history.location.state.__tempLocation?.href
    return href ? new URL(href, window.location.origin).hash.slice(1) : true
  }

  const open = (
    next: SettingsTarget,
    options: { replace?: boolean; fromOverview?: boolean } = {},
  ) => {
    const flags = options.fromOverview ? { settingsFromOverview: true } : {}
    if (route()) {
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
      hash: pageHash(),
      state: { ...link.state, ...flags },
      replace: options.replace,
    })
  }

  // Closing replaces the entry, so Back doesn't open settings again. With no
  // page under it, the dialog leaves Home in the bar.
  const close = () => {
    void navigate(
      route()
        ? { to: "/", replace: true }
        : {
            to: ".",
            search: true,
            hash: pageHash(),
            replace: true,
            resetScroll: false,
          },
    )
  }

  return { target, fromOverview, open, close }
}
