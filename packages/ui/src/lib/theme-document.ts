import { NO_THEME_ACCENTS, ThemeAccents } from "@matinee/contracts"
import {
  normalizeThemeColor,
  themeColorDeclarations,
  type ThemeAppearance,
  type ThemeColors,
} from "@matinee/ui/lib/theme-colors"

const THEME_STYLE_ID = "matinee-theme"
/**
 * Last generated stylesheet, which the pre-paint script in
 * apps/web/index.html injects so the first frame already has the theme.
 */
const THEME_CSS_CACHE_KEY = "matinee.theme-css"
/**
 * The server's accents as of its last config. The config arrives after the
 * first theme pass, which would otherwise paint (and cache) Matinee's own accent
 * in the meantime.
 */
const SERVER_ACCENTS_CACHE_KEY = "matinee.server-accents"
const DARK_QUERY = "(prefers-color-scheme: dark)"

export function setDocumentAppearance(appearance: ThemeAppearance): void {
  const root = document.documentElement
  root.classList.toggle("dark", appearance === "dark")
  root.classList.toggle("light", appearance === "light")
}

export function removeThemeStyle(): void {
  document.getElementById(THEME_STYLE_ID)?.remove()
  writeCssCache(null)
}

export function writeThemeStyle(
  dark: ThemeColors,
  light: ThemeColors,
  cache: boolean,
): void {
  const css = themeCss(dark, light)
  const existing = document.getElementById(THEME_STYLE_ID)
  const style =
    existing instanceof HTMLStyleElement
      ? existing
      : document.createElement("style")
  style.id = THEME_STYLE_ID
  if (style.textContent !== css) style.textContent = css
  if (!style.isConnected) document.head.append(style)
  if (cache) writeCssCache(css)
}

/**
 * Doubled selectors outrank globals.css however the stylesheets load, while
 * keeping its structure: the light root beats the dark root, and a forced
 * `.dark` subtree under a light root keeps the dark theme.
 */
function themeCss(dark: ThemeColors, light: ThemeColors): string {
  return `:root:root,\n.dark.dark {\n${themeColorDeclarations(dark)}\n}\n\n:root:root.light {\n${themeColorDeclarations(light)}\n}\n`
}

function writeCssCache(css: string | null): void {
  writeStorage(THEME_CSS_CACHE_KEY, css)
}

export function readServerAccentsCache(): ThemeAccents {
  try {
    const cached = ThemeAccents.safeParse(
      JSON.parse(localStorage.getItem(SERVER_ACCENTS_CACHE_KEY) ?? "null"),
    )
    return cached.success ? cached.data : NO_THEME_ACCENTS
  } catch {
    return NO_THEME_ACCENTS
  }
}

export function writeServerAccentsCache(accents: ThemeAccents): void {
  writeStorage(
    SERVER_ACCENTS_CACHE_KEY,
    accents.light || accents.dark ? JSON.stringify(accents) : null,
  )
}

export function normalizeAccents(accents: ThemeAccents): ThemeAccents {
  return {
    light: accents.light ? normalizeThemeColor(accents.light) : null,
    dark: accents.dark ? normalizeThemeColor(accents.dark) : null,
  }
}

export function sameAccents(
  first: ThemeAccents,
  second: ThemeAccents,
): boolean {
  return first.light === second.light && first.dark === second.dark
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Storage can be unavailable or full; these caches only save a repaint.
  }
}

// "system" falls back to dark when matchMedia is unavailable, matching the
// pre-paint script.
export function readSystemAppearance(): ThemeAppearance {
  if (!globalThis.window?.matchMedia) return "dark"
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

export function onSystemAppearanceChange(listener: () => void): void {
  if (!("matchMedia" in window)) return
  window.matchMedia(DARK_QUERY).addEventListener("change", listener)
}
