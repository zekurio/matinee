import { THEME_VARIANT_NAME_MAX_LENGTH } from "@matinee/contracts"
import { isStringValue, type JsonValue } from "@matinee/ui/lib/json"
import type { ThemeAppearance, ThemeColors } from "@matinee/ui/lib/theme-colors"

export interface CustomThemeVariant {
  /** Unique within its theme; the theme choice stores `<theme id>:<id>`. */
  id: string
  /** Null names it by its appearance, such as "Dark" or "Dark 2". */
  name: string | null
  appearance: ThemeAppearance
  colors: ThemeColors
}

export interface ThemeDraft {
  name: string
  /** At least one, in the order the theme's card shows them. */
  variants: CustomThemeVariant[]
}

export function newCustomThemeId(): string {
  return `custom-${randomHex(6)}`
}

/** A variant id that none of `taken` has yet. */
export function newThemeVariantId(
  taken: readonly CustomThemeVariant[] = [],
): string {
  for (;;) {
    const id = randomHex(4)
    if (!taken.some((variant) => variant.id === id)) return id
  }
}

/** A trimmed name that fits, or null for one that's missing or blank. */
export function variantName(value: JsonValue | undefined): string | null {
  if (!isStringValue(value)) return null
  return value.trim().slice(0, THEME_VARIANT_NAME_MAX_LENGTH).trim() || null
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}
