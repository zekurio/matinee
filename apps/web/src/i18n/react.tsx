import { Fragment, type ReactNode, useSyncExternalStore } from "react"

import type { Placeholders } from "./catalog"
import {
  getLocale,
  lookup,
  messageText,
  PLACEHOLDER,
  subscribeLocale,
} from "./index"
import type { RichKey, SourceMessages } from "./translation"

/** The interface's language, re-rendering when it changes. */
function useLocale(): string {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale)
}

/**
 * Mounts its children again in each language, so every `tr()` below runs
 * again, even in memoized components and outside React state.
 */
export function LocaleBoundary({ children }: { children: ReactNode }) {
  return <Fragment key={useLocale()}>{children}</Fragment>
}

type RichValues<Key extends RichKey> = {
  readonly [Name in Placeholders<SourceMessages[Key]>]: ReactNode
}

/**
 * `tr()` for a message whose placeholders hold elements, like a link or a
 * name in bold: `trRich("auth.signedInAs", { name: <b>{name}</b> })`.
 * Values render as given, so format numbers with `formatCount()`.
 */
export function trRich<Key extends RichKey>(
  key: Key,
  values: RichValues<Key>,
): ReactNode {
  const parts = messageText(lookup(key), 0).split(PLACEHOLDER)
  const filled: { readonly [name: string]: ReactNode } = values
  return parts.map((part, index) => {
    // Odd parts are the names `split` captured.
    if (index % 2 === 0) return part
    const value = filled[part]
    if (value === undefined) return `{${part}}`
    return <Fragment key={index}>{value}</Fragment>
  })
}
