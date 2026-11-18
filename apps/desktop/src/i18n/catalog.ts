/*
 * What a catalog is: a flat map from a dotted key to a string with
 * `{name}` placeholders, which `tr()` fills in.
 */

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
 * A translation of a source catalog: every key of it, each a string that
 * keeps the source's placeholders.
 */
export type TranslationOf<Source> = {
  readonly [Key in keyof Source]: Keeping<Placeholders<Source[Key]>>
}

/** A message's params as arguments: none when it has no placeholders. */
export type ArgsOf<Text> = [Placeholders<Text>] extends [never]
  ? []
  : [params: { readonly [Name in Placeholders<Text>]: string }]
