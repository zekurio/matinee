import {
  MAX_THEME_VARIANTS,
  MAX_USER_THEMES,
  THEME_NAME_MAX_LENGTH,
  UserThemeId,
  UserThemeVariantId,
  type UserTheme,
  type UserThemeInput,
} from "@matinee/contracts"
import {
  isObjectRecord,
  isStringValue,
  type JsonInput,
  type JsonValue,
} from "@matinee/ui/lib/json"
import { createLocalStorageDriver } from "@matinee/ui/lib/local-storage"
import {
  canonicalThemeColors,
  completeThemeColors,
  THEME_APPEARANCES,
  THEME_COLOR_ROLES,
  themeColorsFrom,
  type ThemeColorRole,
  type ThemeColors,
} from "@matinee/ui/lib/theme-colors"
import {
  variantName,
  type CustomThemeVariant,
  type ThemeDraft,
} from "@matinee/ui/lib/theme-draft"
import type { ThemeFamily, ThemeVariant } from "@matinee/ui/lib/theme-presets"
import { uiText } from "@matinee/ui/lib/ui-text"

export {
  newCustomThemeId,
  newThemeVariantId,
  type CustomThemeVariant,
  type ThemeDraft,
} from "@matinee/ui/lib/theme-draft"
export {
  importThemeSources,
  serializeThemeFile,
  type ThemeImport,
  type ThemeSource,
} from "@matinee/ui/lib/theme-file"

/**
 * User-made themes: saved to the account, and exported and imported as small
 * JSON files. The browser keeps a copy of the account's list so the first
 * frame and the settings page don't wait for the server. Every stored color is
 * a canonical `#rrggbb`, which keeps the CSS written from them free of
 * anything but colors.
 */

export const CUSTOM_THEMES_STORAGE_KEY = "matinee.themes"

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/

export interface CustomTheme extends ThemeDraft {
  id: string
  /** Saved from the guided editor, which only asks for background and accent. */
  guided: boolean
}

const customThemeStorage = createLocalStorageDriver(
  CUSTOM_THEMES_STORAGE_KEY,
  normalizeCustomThemes,
)

export function readCustomThemes(): readonly CustomTheme[] {
  return customThemeStorage.read()
}

export function refreshCustomThemes(): readonly CustomTheme[] {
  return customThemeStorage.refresh()
}

export function writeCustomThemes(
  themes: readonly CustomTheme[],
): readonly CustomTheme[] {
  return customThemeStorage.write([...themes])
}

/** The account's copy of a theme, with any roles it predates derived. */
export function customThemeFromAccount(theme: UserTheme): CustomTheme {
  return {
    id: theme.id,
    name: theme.name,
    variants: theme.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      appearance: variant.appearance,
      colors: completeThemeColors(variant.appearance, variant.colors),
    })),
    guided: theme.guided,
  }
}

export function accountThemeInput(theme: CustomTheme): UserThemeInput {
  return {
    name: theme.name,
    variants: theme.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      appearance: variant.appearance,
      colors: canonicalThemeColors(variant.colors),
    })),
    guided: theme.guided,
  }
}

/**
 * The variant's name, or its appearance when it has none. Unnamed variants
 * of the same appearance are numbered from the second on: "Dark", "Dark 2".
 */
export function customVariantLabel(
  variants: readonly CustomThemeVariant[],
  variant: CustomThemeVariant,
): string {
  const name = variant.name?.trim()
  if (name) return name
  const text = uiText()
  const appearance =
    variant.appearance === "light" ? text.lightVariant : text.darkVariant
  const number =
    variants
      .filter(
        (candidate) =>
          !candidate.name?.trim() &&
          candidate.appearance === variant.appearance,
      )
      .findIndex((candidate) => candidate.id === variant.id) + 1
  return number > 1 ? text.numberedVariant(appearance, number) : appearance
}

export function customThemeFamily(theme: CustomTheme): ThemeFamily {
  return {
    id: theme.id,
    label: theme.name,
    variants: theme.variants.map((variant): ThemeVariant => ({
      id: `${theme.id}:${variant.id}`,
      label: customVariantLabel(theme.variants, variant),
      appearance: variant.appearance,
      colors: variant.colors,
    })),
    custom: true,
  }
}

/** Gives a theme name that doesn't collide with `taken`, adding " 2", " 3", … */
export function uniqueThemeName(
  name: string,
  taken: readonly string[],
): string {
  const names = new Set(taken.map((candidate) => candidate.toLowerCase()))
  if (!names.has(name.toLowerCase())) return name
  for (let index = 2; ; index += 1) {
    const suffix = ` ${index}`
    const candidate = `${name.slice(0, THEME_NAME_MAX_LENGTH - suffix.length)}${suffix}`
    if (!names.has(candidate.toLowerCase())) return candidate
  }
}

function normalizeCustomThemes(value: JsonInput): CustomTheme[] {
  if (!Array.isArray(value)) return []
  const themes: CustomTheme[] = []
  for (const entry of value.slice(0, MAX_USER_THEMES)) {
    const theme = normalizeCustomTheme(entry)
    if (theme && !themes.some((existing) => existing.id === theme.id)) {
      themes.push(theme)
    }
  }
  return themes
}

function normalizeCustomTheme(value: JsonInput): CustomTheme | null {
  if (!isObjectRecord(value)) return null
  const { id, name } = value
  if (!isStringValue(id) || !UserThemeId.safeParse(id).success) {
    return null
  }
  if (!isStringValue(name) || !name.trim()) return null

  if (!Array.isArray(value.variants)) return null
  const variants = normalizeStoredVariants(value.variants)
  if (variants.length === 0) return null
  return {
    id,
    name: name.trim().slice(0, THEME_NAME_MAX_LENGTH),
    variants,
    guided: value.guided === true,
  }
}

function normalizeStoredVariants(
  value: readonly JsonValue[],
): CustomThemeVariant[] {
  const variants: CustomThemeVariant[] = []
  for (const entry of value.slice(0, MAX_THEME_VARIANTS)) {
    if (!isObjectRecord(entry)) continue
    const { id } = entry
    const appearance = THEME_APPEARANCES.find(
      (candidate) => candidate === entry.appearance,
    )
    const colors = normalizeStoredColors(entry.colors)
    if (
      !isStringValue(id) ||
      !UserThemeVariantId.safeParse(id).success ||
      variants.some((existing) => existing.id === id) ||
      !appearance ||
      !colors
    ) {
      continue
    }
    variants.push({ id, name: variantName(entry.name), appearance, colors })
  }
  return variants
}

function normalizeStoredColors(value: JsonValue): ThemeColors | null {
  if (!isObjectRecord(value)) return null
  const stored = (role: ThemeColorRole) => {
    const color = value[role]
    return isStringValue(color) && HEX_COLOR_RE.test(color) ? color : null
  }
  if (!THEME_COLOR_ROLES.every(stored)) return null
  return themeColorsFrom((role) => stored(role) ?? "")
}
