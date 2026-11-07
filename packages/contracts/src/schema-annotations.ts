import type { TSchema } from "typebox"
import { Guard } from "typebox/guard"

import type { SchemaBoundaryInput } from "./schema-validation"

/*
 * What the OpenAPI document needs to know about a schema that its TypeBox
 * form doesn't say: the limits a refinement checks, what a codec parses
 * with, and which schema a wrapper wraps. Everything here sits under symbol
 * keys or in weak maps, so TypeBox's validation and messages don't see it.
 * `schema-json.ts` reads it back.
 */

/** JSON Schema keywords that refinements check. */
export const jsonKeywords = Symbol("matinee.schema.jsonKeywords")

export type JsonKeywords = {
  /** zod's: a later regex() or uuid() replaces an earlier check's format. */
  format?: string
  maxItems?: number
  maxLength?: number
  maximum?: number
  minItems?: number
  minLength?: number
  minimum?: number
  /** Regex sources, in the order they were added. */
  patterns?: readonly string[]
  type?: "integer"
}

/** What a schema stands for when its TypeBox form is only `Unknown` or a codec. */
export const jsonForm = Symbol("matinee.schema.jsonForm")

export type JsonForm =
  /** A Date, sent as an ISO string. */
  | { kind: "date" }
  | { kind: "file"; mime?: readonly string[] }
  /** `t.custom()` and `t.instanceof()`, which zod couldn't describe. */
  | { kind: "custom" }
  /** `.transform()`: reads as `source`, writes as anything. */
  | { kind: "transform"; source: TSchema }
  /** `.catch()` and `t.preprocess()`: reads and writes as `source`. */
  | { kind: "parses"; source: TSchema }

/**
 * Schemas that wrap another as zod's optional and default did, keyed by the
 * exact object. A copy that a later method makes is a different schema, as
 * a zod clone was.
 */
export const wrappers = new WeakMap<
  TSchema,
  { kind: "optional" | "default"; source: TSchema }
>()

/** Unions that `.nullable()` made, which zod kept apart from other unions. */
export const nullables = new WeakSet<TSchema>()

/** The key and value schemas of `t.record()` and `t.partialRecord()`. */
export const records = new WeakMap<TSchema, { key: TSchema; value: TSchema }>()

/** Read through a builder proxy: the TypeBox schema it wraps. */
export const rawSchema = Symbol("matinee.schema.raw")

/**
 * The TypeBox schema each builder proxy wraps. Unlike `rawSchema`, which an
 * object answers too when its prototype is a proxy, this names only the
 * proxies themselves.
 */
export const proxyTargets = new WeakMap<TSchema, TSchema>()

type Annotated = {
  [jsonForm]?: JsonForm
  [jsonKeywords]?: JsonKeywords
  [rawSchema]?: TSchema
}

/** The TypeBox schema under a builder proxy, or the schema itself. */
export function unwrapSchema(value: TSchema): TSchema {
  // SAFETY: Builder proxies answer `rawSchema`; other schemas leave it unset.
  return (value as TSchema & Annotated)[rawSchema] ?? value
}

/** Each node of a schema graph without builder proxies, by the node it copies. */
const plainNodes = new WeakMap<object, SchemaBoundaryInput>()

/**
 * The schema with every builder proxy inside it replaced by the schema it
 * wraps, so TypeBox walks its own objects. Through a proxy, each keyword it
 * reads goes through the proxy's traps, which made checking large values
 * slow. Only the nodes that held a proxy are copied, with all their keys
 * and descriptors, symbol markers included; the rest stay as they are.
 */
export function plainSchema<SchemaType extends TSchema>(
  value: SchemaType,
): SchemaType {
  // SAFETY: plainNode gives back the schema itself or a copy with the same keys.
  return plainNode(value) as SchemaType
}

type Node = Record<PropertyKey, SchemaBoundaryInput>

function plainNode(value: SchemaBoundaryInput): SchemaBoundaryInput {
  if (!Guard.IsObject(value)) return value
  const raw = proxyTargets.get(value) ?? value
  const known = plainNodes.get(raw)
  if (known !== undefined) return known
  // A node that refers back to itself stays as it is.
  plainNodes.set(raw, raw)
  const plain = Guard.IsArray(raw) ? plainArray(raw) : plainObject(raw)
  plainNodes.set(raw, plain)
  return plain
}

function plainArray(value: SchemaBoundaryInput[]) {
  const items = value.map(plainNode)
  return items.some((item, index) => item !== value[index]) ? items : value
}

function plainObject(value: TSchema | Node) {
  // Class instances, such as a Date default, hold no schemas.
  if (Guard.IsClassInstance(value)) return value
  const descriptors = Object.getOwnPropertyDescriptors(value)
  let changed = false
  for (const key of Object.getOwnPropertyNames(descriptors)) {
    const descriptor = descriptors[key]
    if (!descriptor || !("value" in descriptor)) continue
    const plain = plainNode(descriptor.value)
    if (plain === descriptor.value) continue
    descriptor.value = plain
    changed = true
  }
  return changed
    ? Object.create(Object.getPrototypeOf(value), descriptors)
    : value
}

export function getJsonKeywords(value: TSchema): JsonKeywords | undefined {
  // SAFETY: Only `annotate` writes this key, with a JsonKeywords object.
  return (value as TSchema & Annotated)[jsonKeywords]
}

export function getJsonForm(value: TSchema): JsonForm | undefined {
  // SAFETY: Only `withJsonForm` writes this key, with a JsonForm.
  return (value as TSchema & Annotated)[jsonForm]
}

/**
 * Adds keywords to a schema the caller just made, narrowing limits that
 * are already there as zod's checks narrowed them.
 */
export function annotate<SchemaType extends TSchema>(
  value: SchemaType,
  keywords: JsonKeywords,
): SchemaType {
  hide(value, jsonKeywords, mergeKeywords(getJsonKeywords(value), keywords))
  return value
}

/** Sets what a schema the caller just made stands for. */
export function withJsonForm<SchemaType extends TSchema>(
  value: SchemaType,
  form: JsonForm,
): SchemaType {
  hide(value, jsonForm, form)
  return value
}

function hide(value: TSchema, key: symbol, content: JsonForm | JsonKeywords) {
  // Hidden like TypeBox's own `~` keys, so Clone and Update carry it to
  // the copies that later methods make.
  Object.defineProperty(value, key, {
    value: content,
    writable: true,
    configurable: true,
    enumerable: false,
  })
}

const lowerBounds = ["minLength", "minItems", "minimum"] as const
const upperBounds = ["maxLength", "maxItems", "maximum"] as const

function mergeKeywords(
  current: JsonKeywords | undefined,
  added: JsonKeywords,
): JsonKeywords {
  const merged: JsonKeywords = { ...current, ...added }
  for (const key of lowerBounds) {
    const values = [current?.[key], added[key]].filter(Guard.IsNumber)
    if (values.length > 0) merged[key] = Math.max(...values)
  }
  for (const key of upperBounds) {
    const values = [current?.[key], added[key]].filter(Guard.IsNumber)
    if (values.length > 0) merged[key] = Math.min(...values)
  }
  if (current?.patterns && added.patterns) {
    merged.patterns = [...current.patterns, ...added.patterns]
  }
  return merged
}
