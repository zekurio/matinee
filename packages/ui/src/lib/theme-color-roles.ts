import type { ThemeColorRole } from "@matinee/contracts"
import { parseCssColor } from "@matinee/ui/lib/color"
import {
  colorHex,
  colorOr,
  compositeColor,
} from "@matinee/ui/lib/theme-color-math"

/**
 * The editable color roles of a theme, and how they become Matinee's CSS
 * tokens. Roles name what a color does rather than which `--neutral-*` step
 * carries it, so theme files stay readable; everything not listed here (the
 * translucent accent fills, status tints, unused ramp steps) is derived.
 */

// The appearances and the role list are part of the theme contract the server
// validates.
export {
  THEME_APPEARANCES,
  THEME_COLOR_ROLES,
  type ThemeAppearance,
  type ThemeColorRole,
} from "@matinee/contracts"

/** A complete palette: one CSS color per role. */
export interface ThemeColors {
  readonly background: string
  readonly surface: string
  readonly surfaceRaised: string
  readonly surfaceSunken: string
  readonly input: string
  readonly border: string
  readonly borderStrong: string
  readonly borderEmphasis: string
  readonly text: string
  readonly textMuted: string
  readonly textDim: string
  readonly textFaint: string
  readonly accent: string
  readonly accentForeground: string
  readonly accentHover: string
  readonly accentActive: string
  readonly accentDim: string
  readonly success: string
  readonly warning: string
  readonly danger: string
  readonly info: string
  readonly live: string
}

/** The roles a theme file sets; the rest are derived. */
export type ThemeColorOverrides = {
  -readonly [Role in ThemeColorRole]?: string
}

/**
 * CSS custom properties each role sets. The theme inspector probes the same
 * list, so a role owns every property whose value follows it.
 */
export const THEME_COLOR_VARIABLES = {
  background: ["--neutral-0"],
  surface: ["--neutral-50"],
  surfaceRaised: ["--neutral-100"],
  input: ["--neutral-150"],
  border: ["--neutral-200"],
  borderStrong: ["--neutral-300"],
  borderEmphasis: ["--neutral-400"],
  textDim: ["--neutral-600"],
  textMuted: ["--neutral-700"],
  text: ["--neutral-900"],
  surfaceSunken: ["--surface-sunken"],
  textFaint: ["--foreground-faint"],
  accent: [
    "--accent",
    "--primary",
    "--accent-soft",
    "--accent-border",
    "--accent-glow",
  ],
  accentForeground: ["--accent-foreground", "--primary-foreground"],
  accentHover: ["--accent-hover"],
  accentActive: ["--accent-active"],
  accentDim: ["--accent-dim"],
  success: ["--success", "--success-soft"],
  warning: ["--warning", "--warning-soft"],
  danger: ["--danger", "--danger-soft", "--destructive"],
  info: ["--info", "--info-soft"],
  live: ["--live", "--live-soft"],
} as const satisfies Record<ThemeColorRole, readonly string[]>

/** Canonical `#rrggbb` for any CSS color, or null when it isn't one. */
export function normalizeThemeColor(value: string): string | null {
  const color = parseCssColor(value)
  return color ? colorHex(color) : null
}

/** Builds a palette by reading each role in turn. */
export function themeColorsFrom(
  read: (role: ThemeColorRole) => string,
): ThemeColors {
  return {
    background: read("background"),
    surface: read("surface"),
    surfaceRaised: read("surfaceRaised"),
    surfaceSunken: read("surfaceSunken"),
    input: read("input"),
    border: read("border"),
    borderStrong: read("borderStrong"),
    borderEmphasis: read("borderEmphasis"),
    text: read("text"),
    textMuted: read("textMuted"),
    textDim: read("textDim"),
    textFaint: read("textFaint"),
    accent: read("accent"),
    accentForeground: read("accentForeground"),
    accentHover: read("accentHover"),
    accentActive: read("accentActive"),
    accentDim: read("accentDim"),
    success: read("success"),
    warning: read("warning"),
    danger: read("danger"),
    info: read("info"),
    live: read("live"),
  }
}

/** Every role as `#rrggbb`, the form custom themes are stored in. */
export function canonicalThemeColors(colors: ThemeColors): ThemeColors {
  return themeColorsFrom(
    (role) => normalizeThemeColor(colors[role]) ?? colors[role],
  )
}

/**
 * Canonical `#rrggbb` for a color that may be translucent, flattened over the
 * background it will sit on. Null when the value isn't a color.
 */
export function opaqueThemeColor(
  value: string,
  background: string,
): string | null {
  const color = parseCssColor(value)
  if (!color) return null
  if (color.a >= 1) return colorHex(color)
  return colorHex(
    compositeColor(colorOr(background, "#000000"), color, color.a),
  )
}
