import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Set when a phone opened a settings section from the overview. */
    settingsFromOverview?: boolean
  }
}

/** Settings sections, in nav order. */
export type SettingsSectionId =
  | "account"
  | "libraries"
  | "users"
  | "authentication"
  | "transcoding"

/**
 * "Settings, no section in particular." A phone shows the menu of sections
 * for it; wider layouts open the first section.
 */
export const SETTINGS_OVERVIEW = "overview"

export type SettingsTarget = SettingsSectionId | typeof SETTINGS_OVERVIEW

/** Opens the settings dialog over the current page. */
export function useOpenSettings() {
  const navigate = useNavigate()
  return useCallback(
    (section: SettingsTarget = SETTINGS_OVERVIEW) =>
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, settings: section }),
        resetScroll: false,
      }),
    [navigate],
  )
}
