import { t } from "./schema"

/**
 * Color themes: the bundled ones live in the web client, custom ones are
 * saved per account, and an admin can pick the accent the default Matinee
 * theme uses on this server. Adapted from alloy.
 */

export const THEME_MODES = ["system", "light", "dark"] as const
export const ThemeMode = t.enum(THEME_MODES)
export type ThemeMode = t.infer<typeof ThemeMode>

export const THEME_APPEARANCES = ["light", "dark"] as const
export const ThemeAppearance = t.enum(THEME_APPEARANCES)
export type ThemeAppearance = t.infer<typeof ThemeAppearance>

/** Lowercase `#rrggbb`, the only form themes store colors in. */
export const HexColor = t.string().regex(/^#[0-9a-f]{6}$/, "Use #rrggbb.")

/** Bundled ids such as `nord`, and custom ones such as `custom-1a2b3c:dark`. */
const ThemeVariantId = t.string().regex(/^[a-z0-9][a-z0-9:-]{0,79}$/)

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

/**
 * The theme choice that follows a user across devices: the mode, and the
 * theme shown in each appearance.
 */
export const SyncedThemePreferences = t.object({
  mode: ThemeMode,
  light: ThemeVariantId,
  dark: ThemeVariantId,
})
export type SyncedThemePreferences = t.infer<typeof SyncedThemePreferences>

export const THEME_NAME_MAX_LENGTH = 48
export const THEME_VARIANT_NAME_MAX_LENGTH = 32
export const MAX_USER_THEMES = 50
/** Room for a light variant and several dark ones, as Catppuccin has. */
export const MAX_THEME_VARIANTS = 8

/**
 * Made by the client, so saving is an idempotent upsert and the synced theme
 * choice can point at a theme by the id it was created with.
 */
export const UserThemeId = t.string().regex(/^custom-[0-9a-f]{8,32}$/)

/**
 * One appearance of a custom theme: a color per role. Every role is optional
 * because clients derive the missing ones, so a role added later doesn't
 * invalidate themes saved before it existed.
 */
export const UserThemeColors = t.strictObject({
  background: HexColor.optional(),
  surface: HexColor.optional(),
  surfaceRaised: HexColor.optional(),
  surfaceSunken: HexColor.optional(),
  input: HexColor.optional(),
  border: HexColor.optional(),
  borderStrong: HexColor.optional(),
  borderEmphasis: HexColor.optional(),
  text: HexColor.optional(),
  textMuted: HexColor.optional(),
  textDim: HexColor.optional(),
  textFaint: HexColor.optional(),
  accent: HexColor.optional(),
  accentForeground: HexColor.optional(),
  accentHover: HexColor.optional(),
  accentActive: HexColor.optional(),
  accentDim: HexColor.optional(),
  success: HexColor.optional(),
  warning: HexColor.optional(),
  danger: HexColor.optional(),
  info: HexColor.optional(),
  live: HexColor.optional(),
})
export type UserThemeColors = t.infer<typeof UserThemeColors>

/** The roles a theme colors, in the order editors list them. */
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
] as const satisfies readonly (keyof UserThemeColors)[]
export type ThemeColorRole = (typeof THEME_COLOR_ROLES)[number]

/**
 * Made by the client and unique within its theme. The synced theme choice
 * points at a variant as `<theme id>:<variant id>`.
 */
export const UserThemeVariantId = t.string().regex(/^[a-z0-9]{1,16}$/)

/** One palette of a custom theme, made for light or dark mode. */
export const UserThemeVariant = t.object({
  id: UserThemeVariantId,
  /** Null names it by its appearance, such as "Dark" or "Dark 2". */
  name: t.string().trim().min(1).max(THEME_VARIANT_NAME_MAX_LENGTH).nullable(),
  appearance: ThemeAppearance,
  colors: UserThemeColors,
})
export type UserThemeVariant = t.infer<typeof UserThemeVariant>

/** A custom theme as saved: one or more variants, in the order they show. */
export const UserThemeInput = t.object({
  name: t.string().trim().min(1).max(THEME_NAME_MAX_LENGTH),
  variants: t
    .array(UserThemeVariant)
    .min(1)
    .max(MAX_THEME_VARIANTS)
    .refine(
      (variants) =>
        new Set(variants.map((variant) => variant.id)).size === variants.length,
      "Variant ids must be unique.",
    ),
  /** Saved from the guided editor, which only asks for background and accent. */
  guided: t.boolean(),
})
export type UserThemeInput = t.infer<typeof UserThemeInput>

export const UserTheme = UserThemeInput.extend({ id: UserThemeId })
export type UserTheme = t.infer<typeof UserTheme>
