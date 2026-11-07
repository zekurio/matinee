import type { StandardSchemaV1 } from "@standard-schema/spec"
import { Type } from "typebox"
import type {
  TArray,
  TEnum,
  TEnumValue,
  TLiteral,
  TLiteralValue,
  TObject,
  TOptional,
  TProperties,
  TNumber,
  TSchema,
} from "typebox"
import { Guard } from "typebox/guard"

import {
  annotate,
  getJsonForm,
  type JsonKeywords,
  nullables,
  proxyTargets,
  rawSchema,
  records,
  withJsonForm,
  wrappers,
} from "./schema-annotations"
import {
  defaulted,
  type InputType,
  type Schema,
  type StaticOutput,
  type UnwrapProperties,
} from "./schema-types"
import {
  checkValue,
  coerced,
  decodedValue,
  nullableUnion,
  parse,
  refinementPaths,
  runsWhenMissing,
  safeParse,
  type SchemaError,
  type SchemaBoundaryInput,
  type RefinementContext,
  type ValidationIssue,
} from "./schema-validation"

export type { Schema, StaticInput, StaticOutput } from "./schema-types"
export {
  parse,
  safeParse,
  SchemaError,
  type SchemaBoundaryInput,
} from "./schema-validation"

/*
 * A zod-like builder over TypeBox, from alloy. Every schema is also a
 * Standard Schema (`~standard`), so it goes straight into an oRPC contract
 * or a TanStack Router `validateSearch`.
 */

const trimmed = Symbol("matinee.schema.trimmed")

// zod's: RFC 9562 versions 1 to 8 with the variant bits, plus the nil and max
// UUIDs. TypeBox's format takes any hex in that layout.
const UUID =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/

type SchemaMetadata = {
  [defaulted]?: true
  [trimmed]?: true
  additionalProperties?: boolean | TSchema
  default?: SchemaBoundaryInput
  enum?: TEnumValue[]
  maximum?: number
  minimum?: number
  properties?: TProperties
  type?: string
}

type SchemaUpdates = {
  additionalProperties?: boolean | TSchema
  default?: SchemaBoundaryInput
  exclusiveMinimum?: number
  format?: string
  maximum?: number
  maxItems?: number
  minimum?: number
  minItems?: number
  multipleOf?: number
  type?: string
}

function schema<SchemaType extends TSchema>(
  value: SchemaType,
): Schema<SchemaType> {
  // SAFETY: The proxy preserves the schema and provides every declared adapter method.
  const proxy = new Proxy(value, {
    // TanStack Router looks for the Standard Schema with `in`.
    has(target, property) {
      return property === "~standard" || property in target
    },
    get(target, property) {
      // SAFETY: These are the metadata fields that this adapter writes and reads.
      const targetRecord = target as TSchema & SchemaMetadata
      if (property === "~standard") return standardSchema(target)
      if (property === rawSchema) return target
      if (property === "optional") {
        return () => {
          const optional = Type.Optional(target)
          wrappers.set(optional, { kind: "optional", source: target })
          return schema(optional)
        }
      }
      if (property === "nullable") {
        return () => {
          const nullable = Object.assign(Type.Union([target, Type.Null()]), {
            [nullableUnion]: true as const,
          })
          nullables.add(nullable)
          return schema(nullable)
        }
      }
      if (property === "$default") {
        return (defaultValue: SchemaBoundaryInput) => {
          const withDefault = Object.assign(
            copySchema(target, { default: defaultValue }),
            { [defaulted]: true as const },
          )
          wrappers.set(withDefault, { kind: "default", source: target })
          return schema(withDefault)
        }
      }
      if (property === "catch") {
        return (defaultValue: SchemaBoundaryInput) => {
          const caught = withJsonForm(
            Object.assign(
              Type.Decode(Type.Unknown(), (input) => {
                const result = safeParse(target, input)
                return result.success ? result.data : defaultValue
              }),
              { [runsWhenMissing]: true as const },
            ),
            { kind: "parses", source: target },
          )
          const withDefault = targetRecord[defaulted]
            ? Object.assign(caught, {
                default: targetRecord.default,
                [defaulted]: true as const,
              })
            : caught
          // An optional key stays optional.
          return schema(
            Type.IsOptional(target) ? Type.Optional(withDefault) : withDefault,
          )
        }
      }
      if (property === "refine") {
        return (
          check: (input: SchemaBoundaryInput) => boolean,
          options?: string | { message?: string; path?: PropertyKey[] },
        ) => {
          const message = Guard.IsString(options) ? options : options?.message
          const refinement = (input: SchemaBoundaryInput) =>
            check(decodedValue(target, input))
          const path = Guard.IsString(options) ? undefined : options?.path
          if (path) refinementPaths.set(refinement, path)
          return schema(
            Type.Refine(target, refinement, () => message ?? "Invalid value"),
          )
        }
      }
      if (property === "superRefine") {
        return (
          check: (
            input: SchemaBoundaryInput,
            context: RefinementContext,
          ) => void,
        ) =>
          schema(
            Type.Refine(
              target,
              (input) =>
                refinementIssues(decodedValue(target, input), check).length ===
                0,
              (input) =>
                refinementIssues(decodedValue(target, input), check)[0]
                  ?.message ?? "Invalid value",
            ),
          )
      }
      if (property === "transform") {
        return (decode: (input: SchemaBoundaryInput) => SchemaBoundaryInput) =>
          schema(
            withJsonForm(Type.Decode(target, decode), {
              kind: "transform",
              source: target,
            }),
          )
      }
      if (property === "trim") {
        return () =>
          schema(
            Object.assign(
              Type.Decode(target, (input) =>
                Guard.IsString(input) ? input.trim() : input,
              ),
              { [trimmed]: true },
            ),
          )
      }
      if (property === "min" || property === "max") {
        return (limit: number, message?: string) =>
          schema(withLimit(target, property, limit, message))
      }
      if (property === "int") {
        return (message?: string) =>
          schema(
            message === undefined
              ? copySchema(
                  target,
                  {
                    type: "integer",
                    // zod's int() takes safe integers only.
                    minimum: Math.max(
                      targetRecord.minimum ?? Number.MIN_SAFE_INTEGER,
                      Number.MIN_SAFE_INTEGER,
                    ),
                    maximum: Math.min(
                      targetRecord.maximum ?? Number.MAX_SAFE_INTEGER,
                      Number.MAX_SAFE_INTEGER,
                    ),
                  },
                  "Integer",
                )
              : annotate(
                  Type.Refine(target, Number.isSafeInteger, () => message),
                  {
                    type: "integer",
                    minimum: Number.MIN_SAFE_INTEGER,
                    maximum: Number.MAX_SAFE_INTEGER,
                  },
                ),
          )
      }
      if (property === "positive") {
        return () => schema(copySchema(target, { exclusiveMinimum: 0 }))
      }
      if (property === "nonnegative") {
        return () => schema(copySchema(target, { minimum: 0 }))
      }
      if (property === "multipleOf") {
        return (multipleOf: number) =>
          schema(copySchema(target, { multipleOf }))
      }
      if (property === "regex") {
        return (pattern: RegExp, message?: string) =>
          schema(
            withStringCheck(
              target,
              (input) => {
                pattern.lastIndex = 0
                return pattern.test(input)
              },
              message ?? `Invalid string: must match pattern ${pattern}`,
              { format: "regex", patterns: [pattern.source] },
            ),
          )
      }
      if (property === "url") {
        return () =>
          schema(withStringCheck(target, isUrl, urlMessage, urlKeywords))
      }
      if (property === "uuid") {
        return () =>
          schema(withStringCheck(target, isUuid, uuidMessage, uuidKeywords))
      }
      if (property === "datetime") {
        return () =>
          schema(withStringValidation(target, { format: "date-time" }))
      }
      if (property === "strict") {
        return () => schema(copySchema(target, { additionalProperties: false }))
      }
      if (property === "shape") return targetRecord.properties
      if (property === "extend") {
        return (fields: TProperties) =>
          schema(
            Type.Object(
              {
                ...targetRecord.properties,
                ...fields,
              },
              {
                additionalProperties: targetRecord.additionalProperties,
              },
            ),
          )
      }
      if (property === "partial") {
        return () => {
          const partial = Type.Partial(target)
          // Each key wraps the original, as zod's partial() did.
          const fields = Type.IsObject(partial) ? partial.properties : {}
          for (const [key, field] of Object.entries(fields)) {
            const source = targetRecord.properties?.[key]
            if (source) wrappers.set(field, { kind: "optional", source })
          }
          return schema(partial)
        }
      }
      if (property === "exclude" || property === "extract") {
        return (values: readonly TEnumValue[]) =>
          schema(
            Type.Enum(
              (targetRecord.enum ?? []).filter(
                (value) => values.includes(value) === (property === "extract"),
              ),
            ),
          )
      }
      if (property === "omit") {
        return (mask: Record<string, true>) =>
          schema(Type.Omit(target, Object.keys(mask)))
      }
      if (property === "pick") {
        return (mask: Record<string, true>) =>
          schema(Type.Pick(target, Object.keys(mask)))
      }
      if (property === "length") {
        return (length: number, message?: string) =>
          schema(
            withLimit(
              withLimit(target, "min", length, message),
              "max",
              length,
              message,
            ),
          )
      }
      if (property === "mime") {
        return (types: readonly string[], message?: string) => {
          const form = getJsonForm(target)
          // Each call narrows the types, as zod's mime checks did.
          const mime =
            form?.kind === "file" && form.mime
              ? form.mime.filter((type) => types.includes(type))
              : types
          return schema(
            withJsonForm(
              Type.Refine(
                target,
                (input: SchemaBoundaryInput) =>
                  !(input instanceof Blob) || types.includes(input.type),
                () => message ?? `Invalid input: expected ${types.join(" | ")}`,
              ),
              { kind: "file", mime },
            ),
          )
        }
      }
      if (property === "parse")
        return (input: SchemaBoundaryInput) => parse(target, input)
      if (property === "safeParse") {
        return (input: SchemaBoundaryInput) => safeParse(target, input)
      }
      // SAFETY: The proxy forwards only property keys read from the wrapped schema.
      return target[property as keyof SchemaType]
    },
  }) as Schema<SchemaType>
  proxyTargets.set(proxy, value)
  return proxy
}

type StandardSchema = {
  version: 1
  vendor: string
  validate: (
    value: SchemaBoundaryInput,
  ) =>
    | { value: SchemaBoundaryInput; issues?: undefined }
    | { issues: ValidationIssue[] }
}

/** One adapter per schema, as oRPC reads it on every call. */
const standardSchemas = new WeakMap<TSchema, StandardSchema>()

/**
 * The Standard Schema adapter: `safeParse`, with its defaults, trimming,
 * coercion, and refinements, returning the decoded value or the issues.
 */
function standardSchema(valueSchema: TSchema): StandardSchema {
  const known = standardSchemas.get(valueSchema)
  if (known) return known
  const adapter: StandardSchema = {
    version: 1,
    vendor: "matinee",
    validate: (value) => {
      const result = safeParse(valueSchema, value)
      return result.success
        ? { value: result.data }
        : { issues: result.error.issues }
    },
  }
  standardSchemas.set(valueSchema, adapter)
  return adapter
}

function withLimit(
  value: TSchema,
  kind: "min" | "max",
  limit: number,
  message?: string,
) {
  // SAFETY: TypeBox schemas store their validation keywords as own metadata.
  const valueRecord = value as TSchema & SchemaMetadata
  // Strings count code points, as zod and TypeBox do, and say so in zod's
  // words. A trimmed string counts what remains.
  if (valueRecord[trimmed] || valueRecord.type === "string") {
    return annotate(
      Type.Refine(
        value,
        (input) => {
          if (!Guard.IsString(input)) return true
          const length = Array.from(
            valueRecord[trimmed] ? input.trim() : input,
          ).length
          return kind === "min" ? length >= limit : length <= limit
        },
        () =>
          message ??
          (kind === "min"
            ? `Too small: expected string to have >=${limit} characters`
            : `Too big: expected string to have <=${limit} characters`),
      ),
      kind === "min" ? { minLength: limit } : { maxLength: limit },
    )
  }
  // A custom message needs a refinement; keyword errors use TypeBox's text.
  // A file counts its bytes, as zod's file() does.
  if (message !== undefined) {
    return annotate(
      Type.Refine(
        value,
        (input) => {
          const size = Guard.IsArray(input)
            ? input.length
            : Guard.IsNumber(input)
              ? input
              : input instanceof Blob
                ? input.size
                : null
          if (size === null) return true
          return kind === "min" ? size >= limit : size <= limit
        },
        () => message,
      ),
      limitKeywords(valueRecord.type, kind, limit),
    )
  }
  if (valueRecord.type === "array") {
    return kind === "min"
      ? copySchema(value, { minItems: limit })
      : copySchema(value, { maxItems: limit })
  }
  return kind === "min"
    ? copySchema(value, { minimum: limit })
    : copySchema(value, { maximum: limit })
}

/** The keyword a refined limit stands for. A file's size has none. */
function limitKeywords(
  type: string | undefined,
  kind: "min" | "max",
  limit: number,
): JsonKeywords {
  if (type === "array") {
    return kind === "min" ? { minItems: limit } : { maxItems: limit }
  }
  if (type === "number" || type === "integer") {
    return kind === "min" ? { minimum: limit } : { maximum: limit }
  }
  return {}
}

/** A check on the string, or on what `trim()` leaves of it. */
function withStringCheck<SchemaType extends TSchema>(
  value: SchemaType,
  test: (input: string) => boolean,
  message: string,
  keywords: JsonKeywords,
) {
  // SAFETY: TypeBox schemas store their validation keywords as own metadata.
  const valueRecord = value as TSchema & SchemaMetadata
  return annotate(
    Type.Refine(
      value,
      (input) =>
        Guard.IsString(input) &&
        test(valueRecord[trimmed] ? input.trim() : input),
      () => message,
    ),
    keywords,
  )
}

function withStringValidation(value: TSchema, options: { format?: string }) {
  // SAFETY: TypeBox schemas store their validation keywords as own metadata.
  const valueRecord = value as TSchema & SchemaMetadata
  if (!valueRecord[trimmed]) return copySchema(value, options)
  const validationSchema = Type.String(options)
  return annotate(
    Type.Refine(
      value,
      (input) =>
        Guard.IsString(input) && checkValue(validationSchema, input.trim()),
    ),
    options,
  )
}

// zod's url(): anything the WHATWG URL parser takes.
const isUrl = (input: string) => URL.canParse(input)
const urlMessage = "Invalid URL"
const urlKeywords = { format: "uri" }
const isUuid = (input: string) => UUID.test(input)
const uuidMessage = "Invalid UUID"
const uuidKeywords = { format: "uuid", patterns: [UUID.source] }

function copySchema(value: TSchema, updates: SchemaUpdates, kind?: string) {
  // SAFETY: The clone keeps the TypeBox schema prototype and all descriptors.
  const copy = Object.create(
    Object.getPrototypeOf(value),
    Object.getOwnPropertyDescriptors(value),
  ) as TSchema & SchemaMetadata
  Object.assign(copy, updates)
  if (kind) {
    Object.defineProperty(copy, "~kind", {
      value: kind,
      writable: true,
      configurable: true,
    })
  }
  return copy
}

function refinementIssues(
  value: SchemaBoundaryInput,
  check: (value: SchemaBoundaryInput, context: RefinementContext) => void,
) {
  const issues: ValidationIssue[] = []
  check(value, { addIssue: (issue) => issues.push(issue) })
  return issues
}

function object<Fields extends TProperties>(fields: Fields) {
  // SAFETY: UnwrapProperties matches the runtime schema values passed to Type.Object.
  return schema(Type.Object(fields as UnwrapProperties<Fields>)) as Schema<
    TObject<UnwrapProperties<Fields>>
  >
}

function looseObject<Fields extends TProperties>(fields: Fields) {
  // SAFETY: UnwrapProperties matches the runtime schema values passed to Type.Object.
  return schema(
    Type.Object(fields as UnwrapProperties<Fields>, {
      additionalProperties: true,
    }),
  ) as Schema<TObject<UnwrapProperties<Fields>>>
}

function array<Items extends TSchema>(items: Items): Schema<TArray<Items>> {
  return schema(Type.Array(items))
}

function enumSchema<Values extends TEnumValue[]>(
  values: readonly [...Values],
): Schema<TEnum<Values>> {
  return schema(Type.Enum(values))
}

function literal<Value extends TLiteralValue>(
  value: Value,
): Schema<TLiteral<Value>> {
  return schema(Type.Literal(value))
}

/**
 * An object with some of the enum's values as keys, as zod's partialRecord.
 * Keys outside the enum fail.
 */
function partialRecord<Key extends string, Value extends TSchema>(
  keys: Schema<TEnum<Key[]>>,
  value: Value,
) {
  // SAFETY: The entries map each of the enum's keys to the optional value schema.
  const fields = Object.fromEntries(
    keys.enum.map((key) => [String(key), Type.Optional(value)]),
  ) as { [Name in Key]: TOptional<Value> }
  const record = Type.Object(fields, { additionalProperties: false })
  records.set(record, { key: keys, value })
  return schema(record)
}

const validDate = (value: Date) => !Number.isNaN(value.getTime())
const dateMessage = "Invalid input: expected date"

function date() {
  return schema(
    withJsonForm(
      Type.Refine(
        Type.Unsafe<Date>(Type.Unknown()),
        (value) => value instanceof Date && validDate(value),
        () => dateMessage,
      ),
      { kind: "date" },
    ),
  )
}

/** A Date from a Date, an ISO string, or epoch milliseconds, as zod's coerce. */
function coercedDate() {
  return withJsonForm(
    schema(Type.Union([Type.String(), Type.Number(), date()]))
      .transform((value) => new Date(value))
      .refine(validDate, dateMessage),
    { kind: "date" },
  )
}

/** A number that parsing passes through `Number()` first, as zod's coerce. */
function coercedNumber(): TNumber {
  return Object.assign(Type.Number(), { [coerced]: true })
}

export const t = {
  array,
  boolean: () => schema(Type.Boolean()),
  coerce: {
    // SAFETY: This changes only the accepted input type; the decoded value stays numeric.
    number: () =>
      schema(coercedNumber()) as Schema<TNumber & InputType<string | number>>,
    date: coercedDate,
  },
  /**
   * A value of a type the schema doesn't describe, like zod's custom(). It
   * passes as it is when `check` accepts it.
   */
  custom: <Value>(check?: (value: SchemaBoundaryInput) => boolean) =>
    schema(
      withJsonForm(
        Type.Refine(
          Type.Unsafe<Value>(Type.Unknown()),
          (value) => check?.(value) ?? true,
          () => "Invalid input",
        ),
        { kind: "custom" },
      ),
    ),
  /** A valid Date instance, as RPC outputs carry them. */
  date,
  enum: enumSchema,
  /** An uploaded file. `min` and `max` count bytes; `mime` checks the type. */
  file: () =>
    schema(
      withJsonForm(
        Type.Refine(
          Type.Unsafe<File>(Type.Unknown()),
          (value) => value instanceof File,
          () => "Invalid input: expected file",
        ),
        { kind: "file" },
      ),
    ),
  flattenError: (error: SchemaError) => ({
    fieldErrors: groupIssues(error.issues),
  }),
  instanceof: <Value>(
    constructor: abstract new (...args: never[]) => Value,
    _options?: { message?: string },
  ) =>
    schema(
      withJsonForm(
        Type.Refine(
          Type.Unsafe<Value>(Type.Unknown()),
          (value) => value instanceof constructor,
        ),
        { kind: "custom" },
      ),
    ),
  iso: {
    datetime: (_options?: { offset?: boolean }) =>
      schema(Type.String({ format: "date-time" })),
  },
  looseObject,
  literal,
  number: () => schema(Type.Number()),
  object,
  partialRecord,
  preprocess: <SchemaType extends TSchema>(
    preprocess: (value: SchemaBoundaryInput) => SchemaBoundaryInput,
    valueSchema: SchemaType,
  ) =>
    schema(
      withJsonForm(
        Object.assign(
          Type.Decode(Type.Unknown(), (value) =>
            parse(valueSchema, preprocess(value)),
          ),
          { [runsWhenMissing]: true as const },
        ),
        { kind: "parses", source: valueSchema },
      ),
    ),
  record: <Value extends TSchema>(key: TSchema, value: Value) => {
    // Keys are checked as strings; the document names the key schema.
    const record = Type.Record(Type.String(), value)
    records.set(record, { key, value })
    return schema(record)
  },
  string: () => schema(Type.String()),
  /** An object that rejects keys it doesn't name. */
  strictObject: <Fields extends TProperties>(fields: Fields) =>
    object(fields).strict(),
  union: <Types extends TSchema[]>(types: [...Types]) =>
    schema(Type.Union(types)),
  unknown: () => schema(Type.Unknown()),
  url: () =>
    schema(withStringCheck(Type.String(), isUrl, urlMessage, urlKeywords)),
  uuid: () =>
    schema(withStringCheck(Type.String(), isUuid, uuidMessage, uuidKeywords)),
  void: () => schema(Type.Void()),
}

export namespace t {
  export type infer<SchemaType extends TSchema> = StaticOutput<SchemaType>
  export type output<SchemaType extends TSchema> = StaticOutput<SchemaType>
  export type RefinementCtx = RefinementContext
  /**
   * Any schema that parses to `Output`, for `satisfies` checks against a
   * type declared elsewhere, as zod's `ZodType<Output>`.
   */
  export type Type<Output> = StandardSchemaV1<unknown, Output>
}

function groupIssues(issues: ValidationIssue[]) {
  return issues.reduce<Record<string, ValidationIssue[]>>((groups, issue) => {
    const key = String(issue.path[0] ?? "")
    groups[key] = [...(groups[key] ?? []), issue]
    return groups
  }, {})
}
