import { parseCssColor } from "@matinee/ui/lib/color"
import { colorHex } from "@matinee/ui/lib/theme-color-math"

/**
 * The color roles of a palette. Roles name what a color does rather than
 * which `--neutral-*` step carries it; `themeColorDeclarations` turns them
 * into Matinee's CSS tokens, deriving the rest.
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

/** Canonical `#rrggbb` for any CSS color, or null when it isn't one. */
export function normalizeThemeColor(value: string): string | null {
  const color = parseCssColor(value)
  return color ? colorHex(color) : null
}
