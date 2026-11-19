import { ANDROID_PLURALS, ANDROID_STRINGS } from "./android.gen"
import { OWN_PLURALS, OWN_STRINGS } from "./own"

/*
 * The app's words. Those it shares with the Android app come from
 * Android's string resources (see scripts/strings.mjs), so both TV apps
 * read alike; those only a Samsung TV needs are in own.ts. The TV's own
 * language picks between English and German.
 */

type Language = keyof typeof ANDROID_STRINGS

export type StringKey =
  | keyof (typeof ANDROID_STRINGS)["en"]
  | keyof (typeof OWN_STRINGS)["en"]
export type PluralKey =
  | keyof (typeof ANDROID_PLURALS)["en"]
  | keyof (typeof OWN_PLURALS)["en"]

type PluralForms = { one?: string; other: string }

function pickLanguage(): Language {
  const tag = navigator.language.toLowerCase()
  return tag === "de" || tag.startsWith("de-") ? "de" : "en"
}

/** The language the app is in. */
export const language = pickLanguage()

/** The TV's locale, for dates and numbers, which follow its region too. */
export const locale = navigator.language || language

const strings = new Map<string, string>([
  ...Object.entries(ANDROID_STRINGS[language]),
  ...Object.entries(OWN_STRINGS[language]),
])
const plurals = new Map<string, PluralForms>([
  ...Object.entries(ANDROID_PLURALS[language]),
  ...Object.entries(OWN_PLURALS[language]),
])

function fill(text: string, values: readonly (string | number)[]): string {
  return text.replace(/\{(\d+)\}/g, (whole, index: string) => {
    const value = values[Number(index)]
    return value === undefined ? whole : String(value)
  })
}

/** The words for `key`, with `{0}`, `{1}` filled from `values`. */
export function tr(key: StringKey, ...values: (string | number)[]): string {
  return fill(strings.get(key) ?? key, values)
}

/** Names a key without reading it, for a table of them. */
export function key(name: StringKey): StringKey {
  return name
}

let rules: Intl.PluralRules | null = null

/**
 * The words for `count` of something. `values` fill the text, and are the
 * count alone when left out.
 */
export function plural(
  name: PluralKey,
  count: number,
  ...values: (string | number)[]
): string {
  // Engines before Chromium 63 have no plural rules. English and German
  // both say "one" for one and nothing else, so that stands in.
  if (!rules && "PluralRules" in Intl) rules = new Intl.PluralRules(language)
  const forms = plurals.get(name)
  if (!forms) return name
  const one = rules ? rules.select(count) === "one" : count === 1
  const form = one ? (forms.one ?? forms.other) : forms.other
  return fill(form, values.length ? values : [count])
}
