import type { StandardSchemaV1 } from "@standard-schema/spec"
import type {
  Type,
  StaticDecode,
  StaticEncode,
  TArray,
  TCodec,
  TEnum,
  TEnumValue,
  TObject,
  TOptional,
  TPartial,
  TProperties,
  TSchema,
  TUnion,
} from "typebox"

import type {
  RefinementContext,
  SafeParseResult,
  SchemaBoundaryInput,
} from "./schema-validation"

export const defaulted = Symbol("matinee.schema.defaulted")
const caught = Symbol("matinee.schema.caught")
const inputType = Symbol("matinee.schema.inputType")

type Defaulted = { [defaulted]: true }
/** A `.catch()`, which takes a missing key as zod's did. */
type Caught = { [caught]: true }
export type InputType<Value> = { [inputType]: Value }

type OptionalInputKeys<Fields extends TProperties> = {
  [Key in keyof Fields]: Fields[Key] extends TOptional | Defaulted | Caught
    ? Key
    : never
}[keyof Fields]

type ObjectInput<Fields extends TProperties> = {
  [Key in Exclude<keyof Fields, OptionalInputKeys<Fields>>]: StaticInput<
    Fields[Key]
  >
} & {
  [Key in OptionalInputKeys<Fields>]?: StaticInput<Fields[Key]>
}

/** What parsing takes. An optional or defaulted schema also takes undefined. */
export type StaticInput<SchemaType extends TSchema> = SchemaType extends
  | TOptional
  | Defaulted
  ? ValueInput<SchemaType> | undefined
  : ValueInput<SchemaType>

type ValueInput<SchemaType extends TSchema> =
  SchemaType extends InputType<infer Input>
    ? Input
    : SchemaType extends TArray<infer Items>
      ? StaticInput<Items>[]
      : SchemaType extends TUnion<infer Types>
        ? StaticInput<Types[number]>
        : SchemaType extends TObject<infer Fields>
          ? ObjectInput<Fields>
          : StaticEncode<SchemaType>

/**
 * What parsing gives. TypeBox's decoded type reads `optional` only as a
 * property modifier, but parsing an optional schema on its own gives
 * undefined for undefined, unless a default fills that in.
 */
export type StaticOutput<SchemaType extends TSchema> =
  SchemaType extends Defaulted
    ? StaticDecode<SchemaType>
    : SchemaType extends TOptional
      ? StaticDecode<SchemaType> | undefined
      : StaticDecode<SchemaType>

type UnwrapSchema<Value> =
  Value extends Schema<infer SchemaType>
    ? SchemaType
    : Value extends TSchema
      ? Value
      : never

export type UnwrapProperties<Fields extends TProperties> = {
  [Key in keyof Fields]: UnwrapSchema<Fields[Key]>
}

// Fields replace existing properties of the same name, as the runtime spread does.
type ExtendedObject<SchemaType extends TSchema, Fields extends TProperties> =
  SchemaType extends TObject<infer Existing>
    ? TObject<Omit<Existing, keyof Fields> & UnwrapProperties<Fields>>
    : TObject<UnwrapProperties<Fields>>

type OmittedObject<SchemaType extends TSchema, Keys extends string> =
  SchemaType extends TObject<infer Existing>
    ? TObject<Omit<Existing, Keys>>
    : SchemaType

type PickedObject<SchemaType extends TSchema, Keys extends string> =
  SchemaType extends TObject<infer Existing>
    ? TObject<Pick<Existing, Extract<keyof Existing, Keys>>>
    : SchemaType

/** The values of an enum schema. */
type EnumValue<SchemaType extends TSchema> =
  SchemaType extends TEnum<infer Values extends TEnumValue[]>
    ? Values[number]
    : never

type SchemaMethods<SchemaType extends TSchema> = {
  readonly ["shape"]: SchemaType extends TObject<infer Fields>
    ? Fields
    : TProperties
  /** The Standard Schema interface, for oRPC and TanStack Router. */
  readonly ["~standard"]: StandardSchemaV1.Props<
    StaticInput<SchemaType>,
    StaticOutput<SchemaType>
  >
  optional(): Schema<TOptional<SchemaType>>
  nullable(): Schema<TUnion<[SchemaType, ReturnType<typeof Type.Null>]>>
  /**
   * Fills in a missing input before parsing, as zod's prefault(), so it
   * takes what parsing takes, not what it gives.
   */
  $default(
    value: StaticInput<SchemaType> | (() => StaticInput<SchemaType>),
  ): Schema<SchemaType & Defaulted>
  /** An optional schema may fall back to nothing. */
  catch(value: StaticOutput<SchemaType>): Schema<SchemaType & Caught>
  refine(
    check: (value: StaticDecode<SchemaType>) => boolean,
    message?: string | { message?: string; path?: PropertyKey[] },
  ): Schema<SchemaType>
  superRefine(
    check: (
      value: StaticDecode<SchemaType>,
      context: RefinementContext,
    ) => void,
  ): Schema<SchemaType>
  transform<Output>(
    decode: (value: StaticDecode<SchemaType>) => Output,
  ): Schema<TCodec<SchemaType, Output>>
  trim(): Schema<SchemaType>
  min(value: number, message?: string): Schema<SchemaType>
  max(value: number, message?: string): Schema<SchemaType>
  /** Exactly this many items or characters. */
  length(value: number, message?: string): Schema<SchemaType>
  /** For `t.file()`: the media types it may have. */
  mime(types: readonly string[], message?: string): Schema<SchemaType>
  int(message?: string): Schema<SchemaType>
  /**
   * After `int()`: a number that may pass 2^31, like a size in bytes. The
   * OpenAPI document marks it `format: int64`, so generated clients give
   * it a 64-bit type instead of an Int.
   */
  int64(): Schema<SchemaType>
  positive(): Schema<SchemaType>
  nonnegative(): Schema<SchemaType>
  multipleOf(value: number): Schema<SchemaType>
  regex(pattern: RegExp, message?: string): Schema<SchemaType>
  url(): Schema<SchemaType>
  uuid(): Schema<SchemaType>
  datetime(options?: { offset?: boolean }): Schema<SchemaType>
  strict(): Schema<SchemaType>
  extend<Fields extends TProperties>(
    fields: Fields,
  ): Schema<ExtendedObject<SchemaType, Fields>>
  partial(): Schema<TPartial<SchemaType>>
  omit<Keys extends string>(mask: { [Key in Keys]: true }): Schema<
    OmittedObject<SchemaType, Keys>
  >
  pick<Keys extends string>(mask: { [Key in Keys]: true }): Schema<
    PickedObject<SchemaType, Keys>
  >
  /** For enums: the enum without these values, as zod's exclude(). */
  exclude<Values extends EnumValue<SchemaType>>(
    values: readonly Values[],
  ): Schema<TEnum<Exclude<EnumValue<SchemaType>, Values>[]>>
  /** For enums: the enum with only these values, as zod's extract(). */
  extract<Values extends EnumValue<SchemaType>>(
    values: readonly Values[],
  ): Schema<TEnum<Values[]>>
  parse(value: SchemaBoundaryInput): StaticOutput<SchemaType>
  safeParse(
    value: SchemaBoundaryInput,
  ): SafeParseResult<StaticOutput<SchemaType>>
}

export type Schema<SchemaType extends TSchema = TSchema> = SchemaType &
  SchemaMethods<SchemaType>
