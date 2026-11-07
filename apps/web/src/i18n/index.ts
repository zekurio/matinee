import {
  type ArgsOf,
  type Message,
  type MessageValues,
  Plural,
} from "./catalog"
import source from "./locales/en/index"
import type { MessageKey, SourceMessages, Translation } from "./translation"

/*
 * The interface's translations. English is the source: `locales/en/`
 * holds every message and ships in the main bundle. Every other folder in
 * `locales/` is a language, named by its BCP 47 tag, that loads on its own
 * when picked. A key a translation leaves out reads the English text.
 *
 * Call `tr()` while rendering, never at module scope: switching languages
 * remounts the app under `LocaleBoundary`, which renders every message
 * again, but a value computed at import stays in the language it was
 * computed in.
 */

export type { MessageKey, Translation } from "./translation"
export { plural } from "./catalog"

export const SOURCE_LOCALE = "en"

const files = import.meta.glob<Translation>(
  ["./locales/*/index.ts", "!./locales/en/index.ts"],
  { import: "default" },
)

const loaders = new Map<string, () => Promise<Translation>>()
for (const [path, load] of Object.entries(files)) {
  const tag = path.slice("./locales/".length, -"/index.ts".length)
  if (Intl.getCanonicalLocales(tag)[0] !== tag) {
    throw new Error(
      `Name the folder of ${path} by its canonical language tag, like de or pt-BR.`,
    )
  }
  loaders.set(tag, load)
}

/** Every language the interface comes in, English first. */
export const LOCALES: readonly string[] = [
  SOURCE_LOCALE,
  ...[...loaders.keys()].sort(),
]

function baseLanguage(tag: string): string {
  try {
    return new Intl.Locale(tag).language
  } catch {
    return tag.toLowerCase()
  }
}

/**
 * The best language for tags in order of preference, like
 * `navigator.languages`: the tag itself, else the same language for
 * another region (`pt` for `pt-BR`, `pt-BR` for `pt-PT`), else English.
 */
export function matchLocale(requested: readonly string[]): string {
  for (const wanted of requested) {
    const exact = LOCALES.find(
      (locale) => locale.toLowerCase() === wanted.toLowerCase(),
    )
    if (exact) return exact
    const base = baseLanguage(wanted)
    const near =
      LOCALES.find((locale) => locale === base) ??
      LOCALES.find((locale) => baseLanguage(locale) === base)
    if (near) return near
  }
  return SOURCE_LOCALE
}

/** The language this browser asks for, among the ones there are. */
export function browserLocale(): string {
  return matchLocale(navigator.languages)
}

let current = SOURCE_LOCALE
let messages: Translation = {}
let latest = 0
const listeners = new Set<() => void>()

/** The interface's language, a tag from `LOCALES`. */
export function getLocale(): string {
  return current
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Loads a language and switches the interface to it. A language that
 * fails to load, or a switch that a later one overtakes, leaves the
 * interface as it is.
 */
export async function activateLocale(locale: string): Promise<void> {
  const request = ++latest
  let next: Translation = {}
  const load = loaders.get(locale)
  if (locale !== SOURCE_LOCALE) {
    if (!load) return
    try {
      next = await load()
    } catch {
      return
    }
  }
  if (request !== latest) return
  document.documentElement.lang = locale
  if (locale === current) return
  current = locale
  messages = next
  for (const listener of listeners) listener()
}

/**
 * A value made once per language, like an `Intl` formatter for the
 * current one.
 */
export function perLocale<Value>(make: (locale: string) => Value): () => Value {
  const made = new Map<string, Value>()
  return () => {
    let value = made.get(current)
    if (value === undefined) {
      value = make(current)
      made.set(current, value)
    }
    return value
  }
}

const pluralRules = perLocale((locale) => new Intl.PluralRules(locale))
const numbers = perLocale((locale) => new Intl.NumberFormat(locale))

/** The message for a key in the current language, or in English. */
export function lookup(key: MessageKey): Message {
  return messages[key] ?? source[key]
}

/** The text of a message, in the form its count picks for a plural. */
export function messageText(message: Message, count: number): string {
  if (!(message instanceof Plural)) return message
  return message.forms[pluralRules().select(count)] ?? message.forms.other
}

function isNumber(value: string | number): value is number {
  return Number.isFinite(value)
}

/** A placeholder's value as text: numbers in the language's digits. */
export function formatValue(value: string | number): string {
  return isNumber(value) ? numbers().format(value) : String(value)
}

/** `{name}` in a message, with the name captured. */
export const PLACEHOLDER = /\{(\w+)\}/g

/**
 * The message for a key in the interface's language, its placeholders
 * filled in: `tr("shell.home")`, `tr("account.label", { name })`, or
 * `tr("stats.plays", { count: 3 })` for a plural. Number values come out
 * in the language's digits, so pass a year or an id as a string.
 */
export function tr<Key extends MessageKey>(
  key: Key,
  ...args: ArgsOf<SourceMessages[Key]>
): string
export function tr(key: MessageKey, params?: MessageValues): string {
  const text = messageText(lookup(key), Number(params?.count ?? 0))
  if (!params) return text
  return text.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : formatValue(value)
  })
}

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(source, key)
}

/*
 * Text that arrives in English from code the catalog can't reach: the
 * server's error messages, and the contract schemas' validation messages.
 * The `server` and `validation` areas copy that text word for word as
 * their English source, so it translates by matching it. A `{name}` in
 * the copy matches any value there and carries it into the translation.
 * Text that has changed since shows as it came.
 */
const MATCHED_AREAS = ["server.", "validation."]
const exact = new Map<string, MessageKey>()
const patterns: { key: MessageKey; pattern: RegExp; names: string[] }[] = []
for (const key of Object.keys(source)) {
  if (!isMessageKey(key)) continue
  if (!MATCHED_AREAS.some((area) => key.startsWith(area))) continue
  const text = messageText(source[key], 1)
  const names = [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "")
  if (names.length === 0) {
    exact.set(text, key)
    continue
  }
  const parts = text
    .split(PLACEHOLDER)
    .map((part, index) =>
      index % 2 === 0 ? part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "(.+?)",
    )
  patterns.push({ key, pattern: new RegExp(`^${parts.join("")}$`), names })
}

/**
 * English text from the server or a schema in the interface's language,
 * when the catalog knows it; else the text as it is.
 */
export function translateKnown(text: string): string {
  const key = exact.get(text)
  if (key !== undefined) return messageText(lookup(key), 1)
  for (const { key: candidate, pattern, names } of patterns) {
    const match = pattern.exec(text)
    if (!match) continue
    const values = new Map(names.map((name, index) => [name, match[index + 1]]))
    return messageText(lookup(candidate), 1).replace(
      PLACEHOLDER,
      (placeholder, name: string) => values.get(name) ?? placeholder,
    )
  }
  return text
}

/**
 * A language's name in itself, for a language picker: "Deutsch" for `de`,
 * "Français" for `fr`.
 */
export function nativeName(locale: string): string {
  const name =
    new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}
