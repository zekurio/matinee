const names = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "none",
})

// A language with an optional region: `en`, `eng`, `pt-BR`, `es-419`.
const CODE = /^[a-z]{2,3}(-[a-z]{2}|-\d{3})?$/i
// Codes that name no language in particular.
const NOT_A_LANGUAGE = new Set(["und", "mul", "mis", "zxx"])

/**
 * A BCP 47 tag for a code from a file name or stream tag. `eng`, `en`, and
 * `ENG` all give `en`, and `ger` gives `de`. Null for `und` and for words
 * that aren't language codes.
 */
export function languageTag(code: string): string | null {
  if (!CODE.test(code)) return null
  const [tag] = Intl.getCanonicalLocales(code)
  if (!tag || NOT_A_LANGUAGE.has(tag) || !names.of(tag)) return null
  return tag
}

let byName: Map<string, string> | null = null

/** The tag for a language's English name, like `English` or `german`. */
export function languageFromName(name: string): string | null {
  if (!byName) {
    byName = new Map()
    const letters = "abcdefghijklmnopqrstuvwxyz"
    for (const a of letters) {
      for (const b of letters) {
        const tag = languageTag(a + b)
        const full = tag ? names.of(tag)?.toLowerCase() : undefined
        if (tag && full && !byName.has(full)) byName.set(full, tag)
      }
    }
  }
  return byName.get(name.toLowerCase()) ?? null
}

/** `English`, `Brazilian Portuguese`. Null for an unknown tag. */
export function languageName(tag: string): string | null {
  try {
    return names.of(tag) ?? null
  } catch {
    return null
  }
}

/**
 * What a track menu shows: the language, the language and the track's own
 * title, or the title alone when it already names the language. A track with
 * neither gets `unnamed`, such as "Track 2".
 */
export function trackLabel(
  language: string | null,
  title: string | null,
  unnamed: string,
): string {
  const name = language ? languageName(language) : null
  if (!title) return name ?? unnamed
  if (!name || title.toLowerCase().includes(name.toLowerCase())) return title
  return `${name} (${title})`
}
