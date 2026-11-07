const names = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "code",
})

/** `English` for `en`, `Brazilian Portuguese` for `pt-BR`. */
export function languageName(tag: string): string {
  try {
    return names.of(tag) ?? tag
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
