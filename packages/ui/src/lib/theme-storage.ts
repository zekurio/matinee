import { THEME_MODES, type ThemeMode } from "@matinee/contracts"
import { isObjectRecord, type JsonInput } from "@matinee/ui/lib/json"
import { createLocalStorageDriver } from "@matinee/ui/lib/local-storage"

/** Keep in sync with the pre-paint script in apps/web/index.html. */
export const THEME_STORAGE_KEY = "matinee.theme"

/** This device's choice: the mode, which "system" leaves to the OS. */
export interface ThemePreferences {
  mode: ThemeMode
}

// The OS's appearance until someone picks otherwise, so a new device (and
// its login page) matches the rest of the phone or desktop.
// Keep in sync with the pre-paint script in apps/web/index.html.
export const DEFAULT_THEME_PREFERENCES: ThemePreferences = { mode: "system" }

export function normalizeThemePreferences(value: JsonInput): ThemePreferences {
  if (!isObjectRecord(value)) return { ...DEFAULT_THEME_PREFERENCES }
  const mode =
    THEME_MODES.find((candidate) => candidate === value.mode) ??
    DEFAULT_THEME_PREFERENCES.mode
  return { mode }
}

const themeStorage = createLocalStorageDriver(
  THEME_STORAGE_KEY,
  normalizeThemePreferences,
)

export function readThemePreferences(): ThemePreferences {
  return themeStorage.read()
}

export function refreshThemePreferences(): ThemePreferences {
  return themeStorage.refresh()
}

export function writeThemePreferences(
  preferences: ThemePreferences,
): ThemePreferences {
  return themeStorage.write(preferences)
}
