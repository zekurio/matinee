import { MAX_THEME_VARIANTS, THEME_NAME_MAX_LENGTH } from "@matinee/contracts"
import {
  isObjectRecord,
  isStringValue,
  type JsonInput,
  type JsonValue,
} from "@matinee/ui/lib/json"
import {
  completeThemeColors,
  defaultThemeBackground,
  opaqueThemeColor,
  THEME_APPEARANCES,
  THEME_COLOR_ROLES,
  type ThemeAppearance,
  type ThemeColorOverrides,
  type ThemeColors,
} from "@matinee/ui/lib/theme-colors"
import {
  newThemeVariantId,
  variantName,
  type CustomThemeVariant,
  type ThemeDraft,
} from "@matinee/ui/lib/theme-draft"
import { stripJsonComments } from "@matinee/ui/lib/theme-jsonc"
import { readVsCodeTheme } from "@matinee/ui/lib/theme-vscode"

const THEME_FILE_VERSION = 2
const THEME_SOURCE_MAX_BYTES = 256 * 1024

export interface ThemeSource {
  text: string
  /** File name, used when the theme doesn't carry its own. */
  name: string | null
}

/** The exported file: versioned so the format can grow. */
interface ThemeFile {
  version: typeof THEME_FILE_VERSION
  name: string
  variants: ThemeFileVariant[]
}

interface ThemeFileVariant {
  name?: string
  appearance: ThemeAppearance
  colors: ThemeColors
}

export interface ThemeImport {
  themes: ThemeDraft[]
  errors: string[]
}

export function serializeThemeFile(theme: ThemeDraft): string {
  const file: ThemeFile = {
    version: THEME_FILE_VERSION,
    name: theme.name,
    variants: theme.variants.map(themeFileVariant),
  }
  return `${JSON.stringify(file, null, 2)}\n`
}

/** Unnamed variants leave the name out, so it reads first when present. */
function themeFileVariant(variant: CustomThemeVariant): ThemeFileVariant {
  const { appearance, colors } = variant
  return variant.name
    ? { name: variant.name, appearance, colors }
    : { appearance, colors }
}

/**
 * Reads Matinee theme files and VS Code color themes. Light and dark files of
 * the same VS Code theme ("Foo Light", "Foo Dark") merge into one theme.
 */
export function importThemeSources(
  sources: readonly ThemeSource[],
): ThemeImport {
  const themes: ThemeDraft[] = []
  const errors: string[] = []
  for (const source of sources) {
    const result = parseThemeSource(source)
    if (isStringValue(result)) {
      errors.push(source.name ? `${source.name}: ${result}` : result)
    } else {
      themes.push(result)
    }
  }
  return { themes: pairThemeDrafts(themes), errors }
}

function parseThemeSource(source: ThemeSource): ThemeDraft | string {
  if (new Blob([source.text]).size > THEME_SOURCE_MAX_BYTES) {
    return "Theme files can be at most 256 KB."
  }

  let json: JsonInput
  try {
    json = JSON.parse(stripJsonComments(source.text))
  } catch {
    return "This isn't valid JSON."
  }
  if (!isObjectRecord(json)) return "Expected a theme object."

  const fallbackName = source.name
    ? source.name.replace(/\.jsonc?$/i, "").replace(/[-_.]+/g, " ")
    : "Imported theme"
  if (json.version !== undefined) return parseMatineeThemeFile(json)
  if (isObjectRecord(json.colors) || Array.isArray(json.tokenColors)) {
    const theme = readVsCodeTheme(json)
    if (isStringValue(theme)) return theme
    return {
      name: (theme.name ?? fallbackName).slice(0, THEME_NAME_MAX_LENGTH),
      variants: [
        {
          id: newThemeVariantId(),
          name: null,
          appearance: theme.appearance,
          colors: theme.colors,
        },
      ],
    }
  }
  return "Expected a Matinee or VS Code theme."
}

function parseMatineeThemeFile(
  json: Record<string, JsonValue>,
): ThemeDraft | string {
  if (json.version !== THEME_FILE_VERSION) {
    return "Unsupported theme file version."
  }
  const name = isStringValue(json.name) ? json.name.trim() : ""
  if (!name || name.length > THEME_NAME_MAX_LENGTH) {
    return `A theme needs a name of 1 to ${THEME_NAME_MAX_LENGTH} characters.`
  }

  const variants = parseThemeVariants(json.variants)
  if (isStringValue(variants)) return variants
  if (variants.length === 0) return "A theme needs light or dark colors."
  if (variants.length > MAX_THEME_VARIANTS) {
    return `A theme can have at most ${MAX_THEME_VARIANTS} variants.`
  }
  return { name, variants }
}

function parseThemeVariants(
  value: JsonValue | undefined,
): CustomThemeVariant[] | string {
  if (!Array.isArray(value)) return "Expected a list of variants."
  const variants: CustomThemeVariant[] = []
  for (const entry of value) {
    if (!isObjectRecord(entry)) return "Expected a list of variants."
    const appearance = THEME_APPEARANCES.find(
      (candidate) => candidate === entry.appearance,
    )
    if (!appearance) return 'A variant\'s appearance must be "light" or "dark".'
    const colors = parseThemeColors(appearance, entry.colors ?? {})
    if (isStringValue(colors)) return colors
    variants.push({
      id: newThemeVariantId(variants),
      name: variantName(entry.name),
      appearance,
      colors,
    })
  }
  return variants
}

function parseThemeColors(
  appearance: ThemeAppearance,
  value: JsonValue,
): ThemeColors | string {
  if (!isObjectRecord(value)) {
    return `Expected ${appearance} colors to be an object.`
  }

  const background = value.background
  const backgroundColor = isStringValue(background)
    ? opaqueThemeColor(background, defaultThemeBackground(appearance))
    : defaultThemeBackground(appearance)
  if (!backgroundColor) {
    return `"${String(background)}" isn't a color.`
  }

  const overrides: ThemeColorOverrides = {}
  for (const [key, color] of Object.entries(value)) {
    const role = THEME_COLOR_ROLES.find((candidate) => candidate === key)
    if (!role) return `Unknown theme color "${key}".`
    const normalized = isStringValue(color)
      ? opaqueThemeColor(color, backgroundColor)
      : null
    if (!normalized) {
      return `"${String(color)}" isn't a color.`
    }
    overrides[role] = normalized
  }
  return completeThemeColors(appearance, overrides)
}

function pairThemeDrafts(drafts: readonly ThemeDraft[]): ThemeDraft[] {
  const paired: ThemeDraft[] = []
  for (const draft of drafts) {
    const variant = singleVariant(draft)
    const baseName = variant ? stripAppearanceSuffix(draft.name) : null
    const partner =
      variant && baseName
        ? paired.find((candidate) => {
            const candidateVariant = singleVariant(candidate)
            return (
              candidateVariant !== null &&
              candidateVariant.appearance !== variant.appearance &&
              stripAppearanceSuffix(candidate.name)?.toLowerCase() ===
                baseName.toLowerCase()
            )
          })
        : undefined
    if (variant && baseName && partner) {
      const added = partner.variants.some(
        (candidate) => candidate.id === variant.id,
      )
        ? { ...variant, id: newThemeVariantId(partner.variants) }
        : variant
      // Light first, as the bundled themes list theirs.
      const variants = [...partner.variants, added]
      partner.name = baseName
      partner.variants = THEME_APPEARANCES.flatMap((appearance) =>
        variants.filter((candidate) => candidate.appearance === appearance),
      )
    } else {
      paired.push({ ...draft })
    }
  }
  return paired
}

function singleVariant(draft: ThemeDraft): CustomThemeVariant | null {
  const [variant, ...rest] = draft.variants
  return variant && rest.length === 0 ? variant : null
}

function stripAppearanceSuffix(name: string): string | null {
  const stripped = name.replace(/[\s\-_(]*(light|dark)\)?$/i, "").trim()
  return stripped && stripped !== name ? stripped : null
}
