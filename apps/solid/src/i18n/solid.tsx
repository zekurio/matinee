import type { JSX } from "@solidjs/web"
import { createSignal, type ParentProps, Show } from "solid-js"

import type { Placeholders } from "@/i18n/catalog"
import {
  getLocale,
  lookup,
  messageText,
  PLACEHOLDER,
  subscribeLocale,
} from "@/i18n/index"
import type { RichKey, SourceMessages } from "@/i18n/translation"

const [locale, setLocale] = createSignal(getLocale())
subscribeLocale(() => setLocale(getLocale()))

/** The interface's language, as a signal. */
export { locale }

/**
 * Builds its children again in each language, so every `tr()` below runs
 * again, wherever it was called.
 */
export function LocaleBoundary(props: ParentProps) {
  return (
    <Show when={locale()} keyed>
      {(_locale) => props.children}
    </Show>
  )
}

type RichValues<Key extends RichKey> = {
  readonly [Name in Placeholders<SourceMessages[Key]>]: JSX.Element
}

/**
 * `tr()` for a message whose placeholders hold elements, like a link or a
 * name in bold: `trRich("auth.signedInAs", { name: <b>{name}</b> })`.
 */
export function trRich<Key extends RichKey>(
  key: Key,
  values: RichValues<Key>,
): JSX.Element {
  const parts = messageText(lookup(key), 0).split(PLACEHOLDER)
  const filled: { readonly [name: string]: JSX.Element } = values
  return parts.map((part, index) => {
    // Odd parts are the names `split` captured.
    if (index % 2 === 0) return part
    return filled[part] ?? `{${part}}`
  })
}
