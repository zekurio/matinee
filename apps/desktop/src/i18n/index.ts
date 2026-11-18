import { setUiText } from "@matinee/ui/lib/ui-text"

import type { ArgsOf, TranslationOf } from "./catalog"
import de from "./de"
import en from "./en"

/*
 * The pages' text, in English (`en.ts`, the source) and German (`de.ts`).
 * A message is a string with `{name}` placeholders. The language comes from
 * `navigator.languages` once, at start: these pages have no switch of their
 * own, and the shell reloads them often enough. Both catalogs are small,
 * so both ship in the bundle.
 *
 * Call `tr()` while rendering, never at module scope.
 */

type Source = typeof en
export type MessageKey = keyof Source & string

const catalogs = new Map<string, TranslationOf<Source>>([
  ["en", en],
  ["de", de],
])

function baseLanguage(tag: string): string {
  try {
    return new Intl.Locale(tag).language
  } catch {
    return tag.toLowerCase()
  }
}

/** The first language in `requested` there is a catalog for, else English. */
function pickLocale(requested: readonly string[]): string {
  for (const tag of requested) {
    const base = baseLanguage(tag)
    if (catalogs.has(base)) return base
  }
  return "en"
}

const locale = pickLocale(navigator.languages)
const messages = catalogs.get(locale) ?? en

const PLACEHOLDER = /\{(\w+)\}/g

/** A message's text in the interface's language, placeholders and all. */
export function messageText(key: MessageKey): string {
  return messages[key]
}

/**
 * The message for a key, its placeholders filled in:
 * `tr("servers.title")`, `tr("signIn.on", { host })`.
 */
export function tr<Key extends MessageKey>(
  key: Key,
  ...args: ArgsOf<Source[Key]>
): string
export function tr(
  key: MessageKey,
  params?: { readonly [name: string]: string },
): string {
  const text = messageText(key)
  if (!params) return text
  return text.replace(
    PLACEHOLDER,
    (match, name: string) => params[name] ?? match,
  )
}

/** The interface's language, a BCP 47 tag. */
export function getLocale(): string {
  return locale
}

/**
 * Sets the page's language and hands the shared components their text,
 * once at start.
 */
export function applyLocale(): void {
  document.documentElement.lang = locale
  setUiText({
    locale,
    close: tr("ui.close"),
    cancel: tr("ui.cancel"),
    loading: tr("ui.loading"),
    notifications: tr("ui.notifications"),
    closeToast: tr("ui.closeToast"),
    pickColor: (label) => tr("ui.pickColor", { label }),
    colorArea: (label) => tr("ui.colorArea", { label }),
    colorHue: (label) => tr("ui.colorHue", { label }),
    colorHex: (label) => tr("ui.colorHex", { label }),
    previousMonth: tr("ui.previousMonth"),
    nextMonth: tr("ui.nextMonth"),
    today: (date) => tr("ui.today", { date }),
    selected: (date) => tr("ui.selected", { date }),
  })
}
