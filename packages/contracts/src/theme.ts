import { t } from "./schema"

/**
 * Color themes: Matinee's light and dark palettes live in the web client,
 * each device picks its mode, and an admin can pick the accent they use on
 * this server. Adapted from alloy.
 */

export const THEME_MODES = ["system", "light", "dark"] as const
export const ThemeMode = t.enum(THEME_MODES)
export type ThemeMode = t.infer<typeof ThemeMode>

export const THEME_APPEARANCES = ["light", "dark"] as const
export const ThemeAppearance = t.enum(THEME_APPEARANCES)
export type ThemeAppearance = t.infer<typeof ThemeAppearance>

/** Lowercase `#rrggbb`, the only form themes store colors in. */
export const HexColor = t.string().regex(/^#[0-9a-f]{6}$/, "Use #rrggbb.")

/** An accent per appearance for the Matinee theme; null keeps its own. */
export const ThemeAccents = t.object({
  light: HexColor.nullable(),
  dark: HexColor.nullable(),
})
export type ThemeAccents = t.infer<typeof ThemeAccents>

export const NO_THEME_ACCENTS: Readonly<ThemeAccents> = Object.freeze({
  light: null,
  dark: null,
})

/** The roles a palette colors, in the order they're listed. */
export const THEME_COLOR_ROLES = [
  "background",
  "surface",
  "surfaceRaised",
  "surfaceSunken",
  "input",
  "border",
  "borderStrong",
  "borderEmphasis",
  "text",
  "textMuted",
  "textDim",
  "textFaint",
  "accent",
  "accentForeground",
  "accentHover",
  "accentActive",
  "accentDim",
  "success",
  "warning",
  "danger",
  "info",
  "live",
] as const
export type ThemeColorRole = (typeof THEME_COLOR_ROLES)[number]
