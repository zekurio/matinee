import type { ThemeAppearance, ThemeColors } from "@matinee/ui/lib/theme-colors"

/**
 * Matinee's own palettes, the only ones there are for now. Each mirrors
 * globals.css: `:root, .dark` for dark, `:root.light` for light (plus the
 * status colors light mode inherits from the dark defaults).
 */
export const MATINEE_THEME = {
  light: {
    background: "oklch(0.99 0 0)",
    surface: "oklch(0.975 0 0)",
    surfaceRaised: "oklch(0.96 0 0)",
    surfaceSunken: "oklch(0.94 0 0)",
    input: "oklch(0.94 0 0)",
    border: "oklch(0.9 0 0)",
    borderStrong: "oklch(0.84 0 0)",
    borderEmphasis: "oklch(0.7 0 0)",
    text: "oklch(0.2 0 0)",
    textMuted: "oklch(0.4 0 0)",
    textDim: "oklch(0.5 0 0)",
    textFaint: "oklch(0.5 0 0)",
    accent: "#3b5bdb",
    accentForeground: "#ffffff",
    accentHover: "#2e49b3",
    accentActive: "#4e6fde",
    accentDim: "#a5bbf3",
    success: "oklch(0.72 0.19 145)",
    warning: "oklch(0.62 0.15 75)",
    danger: "oklch(0.6 0.22 25)",
    info: "oklch(0.72 0.15 230)",
    live: "oklch(0.65 0.25 25)",
  },
  dark: {
    background: "#0e0e10",
    surface: "#161618",
    surfaceRaised: "#1a1a1d",
    surfaceSunken: "#09090a",
    input: "#232326",
    border: "#27272a",
    borderStrong: "#3f3f46",
    borderEmphasis: "#52525b",
    text: "#fafafa",
    textMuted: "#d4d4d8",
    textDim: "#a1a1aa",
    textFaint: "#8e8e96",
    accent: "#6d8cf5",
    accentForeground: "#000000",
    accentHover: "#7d9af7",
    accentActive: "#5872c8",
    accentDim: "#333f66",
    success: "oklch(0.72 0.19 145)",
    warning: "oklch(0.82 0.18 90)",
    danger: "oklch(0.7 0.19 22)",
    info: "oklch(0.72 0.15 230)",
    live: "oklch(0.65 0.25 25)",
  },
} satisfies Record<ThemeAppearance, ThemeColors>
