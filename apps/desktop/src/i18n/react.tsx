import { Fragment, type ReactNode } from "react"

import type { Placeholders } from "./catalog"
import type en from "./en"
import { type MessageKey, messageText } from "./index"

type RichKey = {
  [Key in MessageKey]: [Placeholders<(typeof en)[Key]>] extends [never]
    ? never
    : Key
}[MessageKey]

/**
 * A message with elements in its placeholders, such as an address in
 * bold: `trRich("signIn.codeEnter", { address: <strong>…</strong> })`.
 */
export function trRich<Key extends RichKey>(
  key: Key,
  params: { readonly [Name in Placeholders<(typeof en)[Key]>]: ReactNode },
): ReactNode {
  const values = new Map<string, ReactNode>(Object.entries(params))
  // Split around the placeholders: text, a name, text, a name, and so on.
  return messageText(key)
    .split(/\{(\w+)\}/)
    .map((part, index) =>
      index % 2 === 0 ? (
        part
      ) : (
        <Fragment key={index}>{values.get(part) ?? `{${part}}`}</Fragment>
      ),
    )
}
