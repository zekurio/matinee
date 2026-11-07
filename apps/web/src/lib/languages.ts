import { perLocale, tr } from "@/i18n"

const names = perLocale(
  (locale) =>
    new Intl.DisplayNames([locale], { type: "language", fallback: "code" }),
)

/**
 * A language's name in the interface's language: `English` for `en`,
 * `Brazilian Portuguese` for `pt-BR`.
 */
export function languageName(tag: string): string {
  try {
    return names().of(tag) ?? tag
  } catch {
    return tag
  }
}

/** `pt-BR` and `pt` are the same language here. */
export function baseLanguage(tag: string | null): string | null {
  if (!tag) return null
  try {
    return new Intl.Locale(tag).language
  } catch {
    return tag.toLowerCase()
  }
}

export function sameLanguage(a: string | null, b: string | null): boolean {
  const base = baseLanguage(a)
  return base !== null && base === baseLanguage(b)
}

/** The language this browser asks pages for, like `en` or `de`. */
export function deviceLanguage(): string {
  return baseLanguage(navigator.language) ?? "en"
}

// Codes that name no language in particular.
const NOT_A_LANGUAGE = new Set(["und", "mul", "mis", "zxx"])

/**
 * A BCP 47 tag for a stream's language code, as the server's
 * `languageTag` makes them: `en` for `eng`, `de` for `ger`. Null for `und`
 * and codes that aren't languages.
 */
export function languageTag(code: string | null): string | null {
  if (!code || !/^[a-z]{2,3}(-[a-z]{2}|-\d{3})?$/i.test(code)) return null
  try {
    const [tag] = Intl.getCanonicalLocales(code)
    return tag && !NOT_A_LANGUAGE.has(tag) ? tag : null
  } catch {
    return null
  }
}

/**
 * A track's name in the interface's language: its language, plus its own
 * title when that adds something, like "Japanese (Signs & Songs)". The
 * server's `trackLabel` does the same in English. `unnamed` stands in for
 * a track with neither.
 */
export function trackLabel(
  language: string | null,
  title: string | null,
  unnamed: string,
): string {
  const name = language ? languageName(language) : null
  if (!title) return name ?? unnamed
  if (!name || title.toLowerCase().includes(name.toLowerCase())) return title
  return tr("player.track.withTitle", { language: name, title })
}
