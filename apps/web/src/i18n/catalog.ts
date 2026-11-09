/*
 * The building blocks of a message catalog. A catalog is a flat map from a
 * dotted key, like `shell.home`, to a message: a string with `{name}`
 * placeholders, or a `plural(...)` that picks its text by a count. Each
 * language splits its catalog into areas, one file per area, and every key
 * in an area starts with the area's name.
 */

/** The forms a plural can have, as `Intl.PluralRules` names them. */
export type PluralForms = {
  readonly zero?: string
  readonly one?: string
  readonly two?: string
  readonly few?: string
  readonly many?: string
  /** Every language has this one, and it stands in for any form left out. */
  readonly other: string
}

/** A message that reads differently by `count`, like "1 play" and "2 plays". */
export class Plural<Forms extends PluralForms = PluralForms> {
  constructor(readonly forms: Forms) {}
}

/**
 * A message that picks its form by the `count` param, using the language's
 * own plural rules. List the forms the language has: English has `one` and
 * `other`, Polish adds `few` and `many`. `{count}` is the formatted number.
 */
export function plural<const Forms extends PluralForms>(
  forms: Forms,
): Plural<Forms> {
  return new Plural(forms)
}

export type Message = string | Plural

/** What the source catalog may hold. */
export type MessageMap = { readonly [key: string]: Message }

/**
 * Declares one area of the source catalog, like `player` or `stats`. Every
 * key starts with the area and a dot, so areas can't collide. The type
 * keeps every string literal, so `tr()` knows each key's placeholders.
 */
export function defineMessages<
  const Area extends string,
  const Messages extends MessageMap,
>(
  area: Area,
  messages: Messages & {
    readonly [Key in keyof Messages]: Key extends `${Area}.${string}`
      ? Message
      : never
  },
): Messages {
  for (const key of Object.keys(messages)) {
    if (!key.startsWith(`${area}.`)) {
      throw new Error(`The message ${key} belongs outside the ${area} area.`)
    }
  }
  return messages
}

/** The names in a message's `{name}` placeholders. */
export type Placeholders<Text> =
  Text extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never

type UnionToIntersection<Union> = (
  Union extends string ? (value: Union) => void : never
) extends (value: infer Each) => void
  ? Each
  : never

/** Any string that keeps every one of these placeholders, in any order. */
type Keeping<Names extends string> = [Names] extends [never]
  ? string
  : UnionToIntersection<
      Names extends string ? `${string}{${Names}}${string}` : never
    >

/**
 * A translation of a source catalog: any subset of its keys, each as a
 * string that keeps the source's placeholders or as a plural where the
 * source has one. Keys left out read the source text.
 */
export type TranslationOf<Source extends MessageMap> = {
  readonly [Key in keyof Source]?: Source[Key] extends Plural
    ? Plural
    : Keeping<Placeholders<Source[Key]>>
}

/** What fills a message's placeholders. Numbers come out formatted. */
export type MessageValues = { readonly [name: string]: string | number }

type FormText<Forms> = Forms[keyof Forms] & string

/** The params a message takes: one per placeholder, and `count` for plurals. */
type ParamsOf<Source extends Message> =
  Source extends Plural<infer Forms>
    ? { readonly count: number } & {
        readonly [Name in Exclude<Placeholders<FormText<Forms>>, "count">]:
          | string
          | number
      }
    : { readonly [Name in Placeholders<Source>]: string | number }

/** A message's params as arguments: none when it has no placeholders. */
export type ArgsOf<Source extends Message> = Source extends Plural
  ? [params: ParamsOf<Source>]
  : [Placeholders<Source>] extends [never]
    ? []
    : [params: ParamsOf<Source>]
