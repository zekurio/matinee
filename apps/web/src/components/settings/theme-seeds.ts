import {
  THEME_NAME_MAX_LENGTH,
  THEME_VARIANT_NAME_MAX_LENGTH,
} from "@matinee/contracts"
import { themeVariantColors, type ThemeState } from "@matinee/ui/lib/theme"
import {
  canonicalThemeColors,
  THEME_APPEARANCES,
} from "@matinee/ui/lib/theme-colors"
import {
  newThemeVariantId,
  uniqueThemeName,
  type CustomTheme,
  type CustomThemeVariant,
} from "@matinee/ui/lib/theme-custom"
import {
  isMatineeThemeVariant,
  type ThemeFamily,
  type ThemeVariant,
} from "@matinee/ui/lib/theme-presets"

import { tr } from "@/i18n"
import type { ThemeEditorOpening } from "@/stores/theme-editor"

/**
 * A variant's name in the interface's language. Matinee's own are named by
 * their appearance in the presets, which can't translate.
 */
export function variantLabel(variant: ThemeVariant): string {
  return isMatineeThemeVariant(variant.id)
    ? tr(`themes.editor.${variant.appearance}`)
    : variant.label
}

/**
 * The variant's name inside its theme's card: "Catppuccin Mocha" reads as
 * "Mocha". Custom variants already have their own name or their appearance.
 */
export function variantShortName(
  family: ThemeFamily,
  variant: ThemeVariant,
): string {
  if (family.custom || isMatineeThemeVariant(variant.id)) {
    return variantLabel(variant)
  }
  return variant.label.startsWith(`${family.label} `)
    ? variant.label.slice(family.label.length + 1)
    : variant.label
}

/**
 * A bundled variant's name in a copy of its theme, short as on the card.
 * Names that only say light or dark, or repeat the theme's, are dropped so
 * the copy names it by its appearance.
 */
function copiedVariantName(
  family: ThemeFamily,
  variant: ThemeVariant,
): string | null {
  if (isMatineeThemeVariant(variant.id)) return null
  const name = variantShortName(family, variant)
  return name === family.label || /^(light|dark)$/i.test(name)
    ? null
    : name.slice(0, THEME_VARIANT_NAME_MAX_LENGTH)
}

/**
 * The variant to open: the one on screen if it's among `sources`, else the
 * first for the shown appearance. `variants` are copies of `sources`, in the
 * same order.
 */
function openingVariant(
  theme: ThemeState,
  sources: readonly ThemeVariant[],
  variants: readonly CustomThemeVariant[],
): string {
  const shown = sources.findIndex(
    (variant) => variant.id === theme[theme.appearance].id,
  )
  const opened =
    variants[shown] ??
    variants.find((variant) => variant.appearance === theme.appearance) ??
    variants[0]
  return opened?.id ?? ""
}

/** A new theme starts from whatever is on screen in each appearance. */
export function createSeed(theme: ThemeState): ThemeEditorOpening {
  return {
    themeId: null,
    name: "",
    variants: THEME_APPEARANCES.map((appearance) => ({
      id: appearance,
      name: null,
      appearance,
      colors: canonicalThemeColors(
        themeVariantColors(theme, theme[appearance]),
      ),
    })),
    selected: theme.appearance,
    guided: true,
  }
}

/** Copies every variant of `family`, with the colors it shows them in. */
export function duplicateSeed(
  theme: ThemeState,
  family: ThemeFamily,
): ThemeEditorOpening {
  const custom = family.custom
    ? theme.customThemes.find((entry) => entry.id === family.id)
    : undefined
  const variants =
    custom?.variants.map((variant) => ({ ...variant })) ??
    copiedVariants(theme, family)
  return {
    themeId: null,
    name: uniqueThemeName(
      tr("themes.copyName", { name: family.label }).slice(
        0,
        THEME_NAME_MAX_LENGTH,
      ),
      theme.customThemes.map((entry) => entry.name),
    ),
    variants,
    selected: openingVariant(theme, family.variants, variants),
    guided: custom?.guided ?? false,
  }
}

/** A bundled theme's variants as custom ones, colored as they show. */
function copiedVariants(
  theme: ThemeState,
  family: ThemeFamily,
): CustomThemeVariant[] {
  const copied: CustomThemeVariant[] = []
  for (const variant of family.variants) {
    copied.push({
      id: newThemeVariantId(copied),
      name: copiedVariantName(family, variant),
      appearance: variant.appearance,
      colors: canonicalThemeColors(themeVariantColors(theme, variant)),
    })
  }
  return copied
}

export function editSeed(
  theme: ThemeState,
  family: ThemeFamily,
  custom: CustomTheme,
): ThemeEditorOpening {
  return {
    themeId: custom.id,
    name: custom.name,
    variants: custom.variants,
    selected: openingVariant(theme, family.variants, custom.variants),
    guided: custom.guided,
  }
}
