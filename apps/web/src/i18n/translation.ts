import type { Placeholders, Plural, TranslationOf } from "./catalog"
import type source from "./locales/en/index"

/** The English catalog, which every other language translates. */
export type SourceMessages = typeof source

export type MessageKey = keyof SourceMessages & string

/** What a language's `locales/<tag>/index.ts` default-exports. */
export type Translation = TranslationOf<SourceMessages>

/** Keys of plain messages with at least one placeholder, for `trRich()`. */
export type RichKey = {
  [Key in MessageKey]: SourceMessages[Key] extends Plural
    ? never
    : [Placeholders<SourceMessages[Key]>] extends [never]
      ? never
      : Key
}[MessageKey]
