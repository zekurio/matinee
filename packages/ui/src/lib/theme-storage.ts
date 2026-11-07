import { THEME_MODES, type SyncedThemePreferences } from "@matinee/contracts"
import {
  isObjectRecord,
  isStringValue,
  type JsonInput,
} from "@matinee/ui/lib/json"
import { createLocalStorageDriver } from "@matinee/ui/lib/local-storage"
import { DEFAULT_THEME_VARIANT_IDS } from "@matinee/ui/lib/theme-presets"

/** Keep in sync with the pre-paint script in apps/web/index.html. */
export const THEME_STORAGE_KEY = "matinee.theme"

/**
 * The synced choice (mode, and a variant id per appearance where unknown ids
 * fall back to Matinee), plus whether this device shares it with the account.
 */
export interface ThemePreferences extends SyncedThemePreferences {
  /** Device-local: never sent to the account. */
  sync: boolean
}

// Dark until someone picks otherwise: video reads best on a dark page.
// Keep in sync with the pre-paint script in apps/web/index.html.
export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  mode: "dark",
  light: DEFAULT_THEME_VARIANT_IDS.light,
  dark: DEFAULT_THEME_VARIANT_IDS.dark,
  sync: true,
}

export function normalizeThemePreferences(value: JsonInput): ThemePreferences {
  if (!isObjectRecord(value)) return { ...DEFAULT_THEME_PREFERENCES }

  const mode =
    THEME_MODES.find((candidate) => candidate === value.mode) ??
    DEFAULT_THEME_PREFERENCES.mode
  const sync = value.sync !== false

  return {
    mode,
    light: isStringValue(value.light)
      ? value.light
      : DEFAULT_THEME_PREFERENCES.light,
    dark: isStringValue(value.dark)
      ? value.dark
      : DEFAULT_THEME_PREFERENCES.dark,
    sync,
  }
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
