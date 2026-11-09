import type { AnySchema } from "@orpc/contract"
import { Type } from "typebox"
import type { TSchema } from "typebox"
import { Guard } from "typebox/guard"

import {
  getJsonForm,
  getJsonKeywords,
  nullables,
  records,
  unwrapSchema,
  wrappers,
} from "./schema-annotations"
import type { SchemaBoundaryInput } from "./schema-validation"

/*
 * JSON Schema for the `t` builder, as oRPC's OpenAPI generator and its
 * SmartCoercionPlugin take it: an oRPC ConditionalSchemaConverter. TypeBox
 * schemas are JSON Schema already, but the document should read as it did
 * when the contract was zod, so this follows @orpc/zod's converter: the
 * same keywords, the same required keys, and `$ref`s where zod matched a
 * shared schema. What the builder hides from TypeBox (limits checked by
 * refinements, what a codec parses with, which schema a wrapper wraps)
 * comes from `schema-annotations.ts`.
 */

type Strategy = "input" | "output"

/** oRPC's SchemaConvertOptions. This package doesn't depend on @orpc/openapi. */
export type SchemaConvertOptions = {
  strategy: Strategy
  /** Shared schemas, written as a `$ref` wherever they appear. */
  components?: readonly {
    allowedStrategies: readonly Strategy[]
    schema: AnySchema
    required: boolean
    ref: string
  }[]
  /** How deep a schema must sit before it may become a `$ref`. */
  minStructureDepthForRef?: number
}

type JsonType =
  | "array"
  | "boolean"
  | "integer"
  | "null"
  | "number"
  | "object"
  | "string"

/** The JSON Schema this converter writes, a subset of oRPC's JSONSchema. */
export type JsonSchema = {
  $ref?: string
  additionalProperties?: JsonSchema | boolean
  allOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  const?: SchemaBoundaryInput
  contentMediaType?: string
  default?: SchemaBoundaryInput
  enum?: readonly SchemaBoundaryInput[]
  exclusiveMaximum?: number
  exclusiveMinimum?: number
  format?: string
  items?: JsonSchema
  maxItems?: number
  maxLength?: number
  maximum?: number
  minItems?: number
  minLength?: number
  minimum?: number
  multipleOf?: number
  not?: JsonSchema
  pattern?: string
  properties?: Record<string, JsonSchema>
  propertyNames?: JsonSchema
  required?: string[]
  type?: JsonType
  /** How oRPC's coercion and serializer revive the value. */
  "x-native-type"?: "date"
}

type Converted = [required: boolean, json: JsonSchema]

/** The keywords TypeBox stores as plain properties of a schema. */
type StoredKeywords = {
  additionalProperties?: TSchema | boolean
  default?: SchemaBoundaryInput
  exclusiveMaximum?: number
  exclusiveMinimum?: number
  format?: string
  maxItems?: number
  maxLength?: number
  maximum?: number
  minItems?: number
  minLength?: number
  minimum?: number
  multipleOf?: number
  pattern?: string
  type?: string
}

export class TypeBoxToJsonSchemaConverter {
  // zod's converter tells these apart by identity: a union drops them.
  readonly #anyJson: JsonSchema = {}
  readonly #unsupportedJson: JsonSchema = { not: {} }
  readonly #undefinedJson: JsonSchema = { not: {} }
  readonly #maxStructureDepth = 10

  condition(schema: AnySchema | undefined): boolean {
    return (
      schema !== undefined &&
      schema["~standard"].vendor === "matinee" &&
      Type.IsSchema(schema)
    )
  }

  convert(
    schema: AnySchema | undefined,
    options: SchemaConvertOptions,
  ): Converted {
    if (!Type.IsSchema(schema)) return [false, this.#anyJson]
    return this.#convert(schema, options, 0)
  }

  #convert(
    schema: TSchema,
    options: SchemaConvertOptions,
    depth: number,
  ): Converted {
    const node = unwrapSchema(schema)
    if (depth > this.#maxStructureDepth) return [false, this.#anyJson]
    const ref = this.#componentRef(node, options, depth)
    if (ref) return ref

    // A wrapper reads as what it wraps, at the same depth, as zod's did.
    const wrapper = wrappers.get(node)
    if (wrapper) {
      const [, json] = this.#convert(wrapper.source, options, depth)
      return wrapper.kind === "default"
        ? [false, { ...json, default: defaultValue(node) }]
        : [false, json]
    }
    if (nullables.has(node) && Type.IsUnion(node) && node.anyOf[0]) {
      const [required, json] = this.#convert(node.anyOf[0], options, depth)
      return [required, { anyOf: [json, { type: "null" }] }]
    }

    const [required, json] = this.#convertForm(node, options, depth)
    return [required && !Type.IsOptional(node), json]
  }

  #componentRef(
    node: TSchema,
    options: SchemaConvertOptions,
    depth: number,
  ): Converted | undefined {
    if (
      options.minStructureDepthForRef &&
      options.minStructureDepthForRef > depth
    ) {
      return undefined
    }
    // `.nullable()` keeps the schema it was called on, not the builder's
    // proxy around it, so components match by the TypeBox schema.
    const component = options.components?.find(
      (candidate) =>
        Type.IsSchema(candidate.schema) &&
        unwrapSchema(candidate.schema) === node &&
        candidate.allowedStrategies.includes(options.strategy),
    )
    return component && [component.required, { $ref: component.ref }]
  }

  #convertForm(
    node: TSchema,
    options: SchemaConvertOptions,
    depth: number,
  ): Converted {
    const form = getJsonForm(node)
    switch (form?.kind) {
      case "date":
        return [
          true,
          { type: "string", format: "date-time", "x-native-type": "date" },
        ]
      case "file": {
        const types = (form.mime ?? ["*/*"]).map((type): JsonSchema => ({
          type: "string",
          contentMediaType: type,
        }))
        return [
          true,
          types.length === 1 && types[0] ? types[0] : { anyOf: types },
        ]
      }
      case "custom":
        return [true, this.#unsupportedJson]
      // zod's pipe: the input before the transform; the output is anything.
      case "transform":
        return options.strategy === "input"
          ? this.#convert(form.source, options, depth)
          : [false, this.#anyJson]
      case "parses":
        return this.#convert(form.source, options, depth)
      case undefined: {
        // SAFETY: TypeBox keeps a schema's JSON Schema keywords as its own properties.
        const stored = node as TSchema & StoredKeywords
        const [required, json] = this.#convertType(node, options, depth)
        return stored.default === undefined
          ? [required, json]
          : [false, { ...json, default: defaultValue(node) }]
      }
    }
  }

  #convertType(
    node: TSchema,
    options: SchemaConvertOptions,
    depth: number,
  ): Converted {
    // SAFETY: TypeBox keeps a schema's JSON Schema keywords as its own properties.
    const stored = node as TSchema & StoredKeywords
    if (Type.IsVoid(node)) return [false, this.#undefinedJson]
    if (Type.IsUnknown(node) || Type.IsAny(node)) return [false, this.#anyJson]
    if (Type.IsUnion(node))
      return this.#convertUnion(node.anyOf, options, depth)
    if (Type.IsEnum(node)) return [true, enumJson(node.enum)]
    if (Type.IsLiteral(node)) return [true, { const: node.const }]
    if (Type.IsString(node)) return [true, stringJson(node)]
    if (Type.IsNumber(node) || Type.IsInteger(node)) {
      return [true, numberJson(node)]
    }
    if (Type.IsBoolean(node)) return [true, { type: "boolean" }]
    if (Type.IsNull(node)) return [true, { type: "null" }]
    const record = records.get(node)
    if (record) {
      return [
        true,
        {
          type: "object",
          propertyNames: this.#convert(record.key, options, depth + 1)[1],
          additionalProperties: this.#convert(
            record.value,
            options,
            depth + 1,
          )[1],
        },
      ]
    }
    if (Type.IsArray(node)) {
      const keywords = getJsonKeywords(node)
      const json: JsonSchema = { type: "array" }
      const minItems = lowerBound(stored.minItems, keywords?.minItems)
      const maxItems = upperBound(stored.maxItems, keywords?.maxItems)
      if (minItems !== undefined) json.minItems = minItems
      if (maxItems !== undefined) json.maxItems = maxItems
      json.items = this.#arrayItem(
        this.#convert(node.items, options, depth + 1),
        options,
      )
      return [true, json]
    }
    if (Type.IsRecord(node)) {
      const value = Object.values(node.patternProperties)[0] ?? Type.Unknown()
      return [
        true,
        {
          type: "object",
          propertyNames: { type: "string" },
          additionalProperties: this.#convert(value, options, depth + 1)[1],
        },
      ]
    }
    if (Type.IsObject(node)) {
      const json: JsonSchema = { type: "object" }
      for (const [key, value] of Object.entries(node.properties)) {
        const [required, property] = this.#convert(value, options, depth + 1)
        json.properties ??= {}
        json.properties[key] = property
        if (required) {
          json.required ??= []
          json.required.push(key)
        }
      }
      const additional = stored.additionalProperties
      if (additional === false) json.additionalProperties = false
      // zod's looseObject took unknown keys as unknown values.
      if (additional === true) json.additionalProperties = this.#anyJson
      if (Type.IsSchema(additional)) {
        json.additionalProperties = this.#convert(
          additional,
          options,
          depth + 1,
        )[1]
      }
      return [true, json]
    }
    return [true, this.#unsupportedJson]
  }

  #convertUnion(
    types: TSchema[],
    options: SchemaConvertOptions,
    depth: number,
  ): Converted {
    const anyOf: JsonSchema[] = []
    let required = true
    for (const type of types) {
      const [itemRequired, json] = this.#convert(type, options, depth + 1)
      if (!itemRequired) required = false
      if (json === this.#undefinedJson) continue
      if (options.strategy === "input" && json === this.#unsupportedJson) {
        continue
      }
      anyOf.push(json)
    }
    return [required, { anyOf }]
  }

  /** An optional item of an output array arrives as null, as zod said. */
  #arrayItem(
    [required, json]: Converted,
    options: SchemaConvertOptions,
  ): JsonSchema {
    if (
      required ||
      options.strategy === "input" ||
      json.default !== undefined
    ) {
      return json
    }
    if (json === this.#undefinedJson) return { type: "null" }
    return { anyOf: [json, { type: "null" }] }
  }
}

function stringJson(node: TSchema): JsonSchema {
  // SAFETY: TypeBox keeps a schema's JSON Schema keywords as its own properties.
  const stored = node as TSchema & StoredKeywords
  const keywords = getJsonKeywords(node)
  const json: JsonSchema = { type: "string" }
  const minLength = lowerBound(stored.minLength, keywords?.minLength)
  const maxLength = upperBound(stored.maxLength, keywords?.maxLength)
  if (minLength !== undefined) json.minLength = minLength
  if (maxLength !== undefined) json.maxLength = maxLength
  const format = keywords?.format ?? stored.format
  // zod's regex() is a format too, written as its pattern.
  if (format !== undefined && format !== "regex") {
    json.format = format
    return json
  }
  // zod wrote patterns only for strings without a format.
  const patterns = [
    ...(stored.pattern === undefined ? [] : [stored.pattern]),
    ...(keywords?.patterns ?? []),
  ]
  const [pattern, ...others] = patterns
  if (pattern !== undefined) json.pattern = pattern
  if (others.length > 0)
    json.allOf = others.map((source) => ({ pattern: source }))
  return json
}

function numberJson(node: TSchema): JsonSchema {
  // SAFETY: TypeBox keeps a schema's JSON Schema keywords as its own properties.
  const stored = node as TSchema & StoredKeywords
  const keywords = getJsonKeywords(node)
  const integer = stored.type === "integer" || keywords?.type === "integer"
  const json: JsonSchema = { type: integer ? "integer" : "number" }
  const minimum = lowerBound(stored.minimum, keywords?.minimum)
  const maximum = upperBound(stored.maximum, keywords?.maximum)
  if (minimum !== undefined) json.minimum = minimum
  if (maximum !== undefined) json.maximum = maximum
  if (stored.exclusiveMinimum !== undefined) {
    json.exclusiveMinimum = stored.exclusiveMinimum
  }
  if (stored.exclusiveMaximum !== undefined) {
    json.exclusiveMaximum = stored.exclusiveMaximum
  }
  if (stored.multipleOf !== undefined) json.multipleOf = stored.multipleOf
  // `int64()`, for clients that pick an integer's size.
  if (integer && stored.format === "int64") json.format = "int64"
  return json
}

function enumJson(values: readonly SchemaBoundaryInput[]): JsonSchema {
  const json: JsonSchema = { enum: values }
  if (values.every(Guard.IsString)) json.type = "string"
  else if (
    values.every((value) => Guard.IsNumber(value) && Number.isFinite(value))
  ) {
    json.type = "number"
  }
  return json
}

/** The default a schema fills in. A function default is called, as TypeBox does. */
function defaultValue(node: TSchema): SchemaBoundaryInput {
  // SAFETY: TypeBox keeps a schema's JSON Schema keywords as its own properties.
  const value = (node as TSchema & StoredKeywords).default
  return Guard.IsFunction(value) ? value() : value
}

function lowerBound(...values: (number | undefined)[]) {
  const numbers = values.filter(Guard.IsNumber)
  return numbers.length > 0 ? Math.max(...numbers) : undefined
}

function upperBound(...values: (number | undefined)[]) {
  const numbers = values.filter(Guard.IsNumber)
  return numbers.length > 0 ? Math.min(...numbers) : undefined
}
