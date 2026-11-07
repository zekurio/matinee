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
import type {
  ThemeColorOverrides,
  ThemeColors,
} from "@matinee/ui/lib/theme-color-roles"

export * from "@matinee/ui/lib/theme-color-roles"

type RampRole =
  | "surface"
  | "surfaceRaised"
  | "input"
  | "border"
  | "borderStrong"
  | "borderEmphasis"
  | "textDim"
  | "textMuted"
  | "textFaint"

/**
 * Where each derived step sits between background (0) and text (1), measured
 * off Matinee's own dark and light ramps. Which table applies depends on how
 * the background reads, so a dark "light" theme still gets dark spacing.
 */
const RAMP_POSITIONS = {
  dark: {
    surface: 0.046,
    surfaceRaised: 0.092,
    input: 0.144,
    border: 0.184,
    borderStrong: 0.264,
    borderEmphasis: 0.391,
    textFaint: 0.598,
    textDim: 0.655,
    textMuted: 0.782,
  },
  light: {
    surface: 0.019,
    surfaceRaised: 0.038,
    input: 0.063,
    border: 0.114,
    borderStrong: 0.19,
    borderEmphasis: 0.367,
    textFaint: 0.62,
    textDim: 0.62,
    textMuted: 0.747,
  },
} satisfies Record<ThemeAppearance, Record<RampRole, number>>

/** Matinee's own anchors, used for whatever a theme leaves out. */
const DEFAULT_ANCHORS = {
  dark: {
    background: "#0e0e10",
    accent: "#6d8cf5",
    success: "oklch(0.72 0.19 145)",
    warning: "oklch(0.82 0.18 90)",
    danger: "oklch(0.7 0.19 22)",
    info: "oklch(0.72 0.15 230)",
    live: "oklch(0.65 0.25 25)",
  },
  light: {
    background: "oklch(0.99 0 0)",
    accent: "#3b5bdb",
    success: "oklch(0.72 0.19 145)",
    warning: "oklch(0.62 0.15 75)",
    danger: "oklch(0.6 0.22 25)",
    info: "oklch(0.72 0.15 230)",
    live: "oklch(0.65 0.25 25)",
  },
} satisfies Record<
  ThemeAppearance,
  Record<"background" | "accent" | StatusRole, string>
>

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

export function defaultThemeBackground(appearance: ThemeAppearance): string {
  return DEFAULT_ANCHORS[appearance].background
}

export function defaultThemeAccent(appearance: ThemeAppearance): string {
  return DEFAULT_ANCHORS[appearance].accent
}

/**
 * Fills in every role a theme leaves out. Text comes from the background,
 * the ramp sits between the two, and the accent family follows the accent.
 */
export function completeThemeColors(
  appearance: ThemeAppearance,
  overrides: ThemeColorOverrides,
): ThemeColors {
  const anchors = DEFAULT_ANCHORS[appearance]
  const background = colorOr(
    overrides.background ?? anchors.background,
    anchors.background,
  )
  const tone = toneOf(background)
  const text = overrides.text
    ? colorOr(overrides.text, colorHex(defaultText(background)))
    : defaultText(background)
  const ramp = (role: RampRole) =>
    overrides[role] ??
    colorHex(mixColor(background, text, RAMP_POSITIONS[tone][role]))
  const derivedRamp = {
    surface: ramp("surface"),
    surfaceRaised: ramp("surfaceRaised"),
    input: ramp("input"),
    border: ramp("border"),
    borderStrong: ramp("borderStrong"),
    borderEmphasis: ramp("borderEmphasis"),
    textDim: ramp("textDim"),
    textMuted: ramp("textMuted"),
    textFaint: ramp("textFaint"),
  } satisfies Record<RampRole, string>

  const accentValue = overrides.accent ?? anchors.accent
  const accentFamily = deriveAccentFamily(
    colorOr(accentValue, anchors.accent),
    background,
  )
  const status = (role: StatusRole) =>
    overrides[role] ??
    colorHex(ensureContrast(colorOr(anchors[role], "#808080"), background, 3))

  return {
    ...derivedRamp,
    background: overrides.background ?? colorHex(background),
    text: overrides.text ?? colorHex(text),
    surfaceSunken:
      overrides.surfaceSunken ??
      (tone === "dark"
        ? colorHex(mixColor(background, BLACK, 0.36))
        : derivedRamp.input),
    accent: accentValue,
    accentForeground:
      overrides.accentForeground ?? accentFamily.accentForeground,
    accentHover: overrides.accentHover ?? accentFamily.accentHover,
    accentActive: overrides.accentActive ?? accentFamily.accentActive,
    accentDim: overrides.accentDim ?? accentFamily.accentDim,
    success: status("success"),
    warning: status("warning"),
    danger: status("danger"),
    info: status("info"),
    live: status("live"),
  }
}

/**
 * The guided "two colors" palette: a background and an accent, with the
 * accent nudged until it reads on that background and on its own tint.
 */
export function generateThemeColors(
  appearance: ThemeAppearance,
  background: string,
  accent: string,
): ThemeColors {
  const backgroundColor = colorOr(
    background,
    defaultThemeBackground(appearance),
  )
  return completeThemeColors(appearance, {
    background: colorHex(backgroundColor),
    accent: colorHex(fitAccent(accent, backgroundColor)),
  })
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

/** Recomputes the accent family after the accent itself was edited. */
export function withDerivedAccentFamily(colors: ThemeColors): ThemeColors {
  return {
    ...colors,
    ...deriveAccentFamily(
      colorOr(colors.accent, defaultThemeAccent("dark")),
      colorOr(colors.background, "#000000"),
    ),
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

/** Near-white or near-black text carrying a trace of the background's hue. */
function defaultText(background: Rgba): Rgba {
  const dark = isDarkColor(background)
  return ensureContrast(
    mixColor(background, dark ? WHITE : BLACK, dark ? 0.97 : 0.82),
    background,
    7,
  )
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
