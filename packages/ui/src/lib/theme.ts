import {
  NO_THEME_ACCENTS,
  type ThemeAccents,
  type ThemeMode,
} from "@matinee/contracts"
import {
  THEME_APPEARANCES,
  withThemeAccent,
  type ThemeAppearance,
  type ThemeColors,
} from "@matinee/ui/lib/theme-colors"
import {
  normalizeAccents,
  onSystemAppearanceChange,
  readServerAccentsCache,
  readSystemAppearance,
  removeThemeStyle,
  sameAccents,
  setDocumentAppearance,
  writeServerAccentsCache,
  writeThemeStyle,
} from "@matinee/ui/lib/theme-document"
import { MATINEE_THEME } from "@matinee/ui/lib/theme-presets"
import {
  readThemePreferences,
  refreshThemePreferences,
  THEME_STORAGE_KEY,
  writeThemePreferences,
  type ThemePreferences,
} from "@matinee/ui/lib/theme-storage"

/**
 * The live theme: Matinee's light and dark palettes, the mode this device
 * picked, the OS appearance, and the accent the server's admins chose,
 * resolved into one `<style>` element. Components read it through
 * {@link getThemeState} and {@link subscribeTheme}.
 */

export interface ThemeState {
  preferences: ThemePreferences
  /** Accents the server's admins chose for the Matinee theme. */
  serverAccents: ThemeAccents
  systemAppearance: ThemeAppearance
  /** The appearance the page shows now. */
  appearance: ThemeAppearance
  /** The colors of each appearance, the server's accent included. */
  light: ThemeColors
  dark: ThemeColors
}

let preferences: ThemePreferences = readStoredPreferences()
let serverAccents: ThemeAccents = NO_THEME_ACCENTS
let systemAppearance: ThemeAppearance = "dark"
let preview: ThemeAccents | null = null
let initialized = false
let state = buildState()
const listeners = new Set<() => void>()

function readStoredPreferences(): ThemePreferences {
  return globalThis.window ? readThemePreferences() : { mode: "dark" }
}

export function getThemeState(): ThemeState {
  return state
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Applies the stored mode, keeps "system" in step with live OS changes,
 * and follows edits made in other tabs.
 */
export function initTheme(): void {
  if (initialized) return
  initialized = true
  preferences = readThemePreferences()
  serverAccents = readServerAccentsCache()
  systemAppearance = readSystemAppearance()
  refresh()

  if (!globalThis.window) return
  onSystemAppearanceChange(() => {
    systemAppearance = readSystemAppearance()
    refresh()
  })
  window.addEventListener("storage", (event) => {
    // A null key means the whole store was cleared, preferences included.
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return
    preferences = refreshThemePreferences()
    refresh()
  })
}

/** "system" follows the OS; light and dark stay as picked. */
export function setThemeMode(mode: ThemeMode): void {
  preferences = writeThemePreferences({ ...preferences, mode })
  refresh()
}

export function setServerThemeAccents(accents: ThemeAccents): void {
  const next = normalizeAccents(accents)
  if (sameAccents(next, serverAccents)) return
  serverAccents = next
  writeServerAccentsCache(next)
  refresh()
}

/**
 * Shows accents that aren't saved yet on the page until
 * {@link endAccentPreview}. Nothing is stored or cached meanwhile.
 */
export function previewServerAccents(accents: ThemeAccents): void {
  preview = normalizeAccents(accents)
  refresh()
}

export function endAccentPreview(): void {
  if (!preview) return
  preview = null
  refresh()
}

function refresh(): void {
  state = buildState()
  apply()
  for (const listener of listeners) listener()
}

function buildState(): ThemeState {
  const accents = preview ?? serverAccents
  const colors = (appearance: ThemeAppearance) => {
    const accent = accents[appearance]
    const own = MATINEE_THEME[appearance]
    return accent ? withThemeAccent(own, accent) : own
  }
  return {
    preferences,
    serverAccents,
    systemAppearance,
    appearance:
      preferences.mode === "system" ? systemAppearance : preferences.mode,
    light: colors("light"),
    dark: colors("dark"),
  }
}

function apply(): void {
  if (!globalThis.document) return
  setDocumentAppearance(state.appearance)
  const accents = preview ?? serverAccents
  if (THEME_APPEARANCES.every((appearance) => !accents[appearance])) {
    // globals.css already has exactly these colors.
    removeThemeStyle()
    return
  }
  writeThemeStyle(state.dark, state.light, preview === null)
}
