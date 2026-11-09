import type { ThemeAppearance } from "@matinee/contracts"
import { formatCssColor, type Rgba } from "@matinee/ui/lib/color"
import {
  BLACK,
  colorHex,
  colorOr,
  contrastSafeTintAlpha,
  ensureContrast,
  ensureTintedContrast,
  isDarkColor,
  mixColor,
  readableForeground,
  WHITE,
} from "@matinee/ui/lib/theme-color-math"
import type { ThemeColors } from "@matinee/ui/lib/theme-color-roles"

export * from "@matinee/ui/lib/theme-color-roles"

/** Matinee's own accents, for a theme that leaves its accent out. */
const DEFAULT_ACCENTS = {
  dark: "#6d8cf5",
  light: "#3b5bdb",
} satisfies Record<ThemeAppearance, string>

type StatusRole = "success" | "warning" | "danger" | "info" | "live"
const STATUS_ROLES = [
  "success",
  "warning",
  "danger",
  "info",
  "live",
] as const satisfies readonly StatusRole[]

/**
 * Opacity of the translucent accent tokens by how the background reads. Keep
 * these in sync with globals.css.
 */
const ACCENT_ALPHAS = {
  dark: { soft: 0.22, border: 0.55, glow: 0.38 },
  light: { soft: 0.12, border: 0.4, glow: 0.28 },
} satisfies Record<ThemeAppearance, Record<"soft" | "border" | "glow", number>>

export function defaultThemeAccent(appearance: ThemeAppearance): string {
  return DEFAULT_ACCENTS[appearance]
}

/**
 * Replaces a theme's accent with `seed`, adjusted for contrast against that
 * theme's background. Used for the server's accents on the Matinee theme, which
 * an admin picks without seeing every background they land on.
 */
export function withThemeAccent(
  colors: ThemeColors,
  seed: string,
): ThemeColors {
  const background = colorOr(colors.background, "#000000")
  const accent = fitAccent(seed, background)
  return {
    ...colors,
    accent: colorHex(accent),
    ...deriveAccentFamily(accent, background),
  }
}

/** Declarations for one appearance's selector block, two-space indented. */
export function themeColorDeclarations(colors: ThemeColors): string {
  const background = colorOr(colors.background, "#000000")
  const accent = colorOr(colors.accent, defaultThemeAccent("dark"))
  const alphas = ACCENT_ALPHAS[toneOf(background)]
  const alpha = (opacity: number) => formatCssColor({ ...accent, a: opacity })
  const midpoint = (first: string, second: string) =>
    colorHex(
      mixColor(colorOr(first, "#808080"), colorOr(second, "#808080"), 0.5),
    )

  const lines = [
    `--neutral-0: ${colors.background};`,
    `--neutral-50: ${colors.surface};`,
    `--neutral-100: ${colors.surfaceRaised};`,
    `--neutral-150: ${colors.input};`,
    `--neutral-200: ${colors.border};`,
    `--neutral-300: ${colors.borderStrong};`,
    `--neutral-400: ${colors.borderEmphasis};`,
    `--neutral-500: ${midpoint(colors.borderEmphasis, colors.textDim)};`,
    `--neutral-600: ${colors.textDim};`,
    `--neutral-700: ${colors.textMuted};`,
    `--neutral-800: ${midpoint(colors.textMuted, colors.text)};`,
    `--neutral-900: ${colors.text};`,
    `--surface-sunken: ${colors.surfaceSunken};`,
    `--foreground-faint: ${colors.textFaint};`,
    `--primary: ${colors.accent};`,
    `--primary-foreground: ${colors.accentForeground};`,
    `--accent: ${colors.accent};`,
    `--accent-hover: ${colors.accentHover};`,
    `--accent-active: ${colors.accentActive};`,
    `--accent-foreground: ${colors.accentForeground};`,
    `--accent-soft: ${alpha(contrastSafeTintAlpha(accent, background, alphas.soft, 4.55))};`,
    `--accent-border: ${alpha(alphas.border)};`,
    `--accent-glow: ${alpha(alphas.glow)};`,
    `--accent-dim: ${colors.accentDim};`,
    ...STATUS_ROLES.flatMap((role) => [
      `--${role}: ${colors[role]};`,
      `--${role}-soft: color-mix(in srgb, ${colors[role]} 12%, transparent);`,
    ]),
    `--destructive: ${colors.danger};`,
  ]
  return lines.map((line) => `  ${line}`).join("\n")
}

function toneOf(background: Rgba): ThemeAppearance {
  return isDarkColor(background) ? "dark" : "light"
}

function fitAccent(seed: string, background: Rgba): Rgba {
  return ensureTintedContrast(
    colorOr(seed, defaultThemeAccent(toneOf(background))),
    background,
    ACCENT_ALPHAS[toneOf(background)].soft,
    4.5,
  )
}

function deriveAccentFamily(
  accent: Rgba,
  background: Rgba,
): Pick<
  ThemeColors,
  "accentForeground" | "accentHover" | "accentActive" | "accentDim"
> {
  const dark = isDarkColor(background)
  const foreground = readableForeground(accent)
  return {
    accentForeground: colorHex(foreground),
    accentHover: colorHex(
      ensureContrast(
        mixColor(accent, dark ? WHITE : BLACK, dark ? 0.12 : 0.14),
        foreground,
        4.5,
      ),
    ),
    accentActive: colorHex(
      ensureContrast(
        mixColor(accent, dark ? BLACK : WHITE, dark ? 0.14 : 0.12),
        foreground,
        4.5,
      ),
    ),
    accentDim: colorHex(mixColor(accent, background, 0.58)),
  }
}
