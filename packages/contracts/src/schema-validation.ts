import { Type } from "typebox"
import type { TObject, TRefineCheckCallback, TSchema, TUnion } from "typebox"
import { Compile, type Validator } from "typebox/compile"
import type { TLocalizedValidationError, TRefineError } from "typebox/error"
import { Guard } from "typebox/guard"
import { Environment, Settings } from "typebox/system"
import {
  Clone,
  DecodeUnsafe,
  Errors,
  HasCodec,
  UnionPrioritySort,
} from "typebox/value"

import { plainSchema, unwrapSchema } from "./schema-annotations"
import type { StaticOutput } from "./schema-types"

/*
 * Markers for parsing, under symbols so TypeBox and the OpenAPI document
 * don't see them. TypeBox's Update copies symbol keys, so the copies that
 * later methods make keep them.
 */

/** Marks `t.coerce` schemas, whose input goes through `Number()` first. */
export const coerced = Symbol("matinee.schema.coerced")

/**
 * Marks `.catch()` and `t.preprocess()`, which run on a missing key as on
 * undefined, as zod's did.
 */
export const runsWhenMissing = Symbol("matinee.schema.runsWhenMissing")

/** Marks the unions `.nullable()` makes, which take null before their schema. */
export const nullableUnion = Symbol("matinee.schema.nullable")

type Markers = {
  [coerced]?: true
  [nullableUnion]?: true
  [runsWhenMissing]?: true
}

/** The `path` of a refinement, below the value it checks, by its check. */
export const refinementPaths = new WeakMap<
  TRefineCheckCallback,
  PropertyKey[]
>()

export type ValidationIssue = {
  path: PropertyKey[]
  message: string
}

export type SchemaBoundaryInput = Parameters<typeof DecodeUnsafe>[2]

export type RefinementContext = {
  addIssue(issue: ValidationIssue & { code?: string }): void
}

export type SafeParseResult<Value> =
  | { success: true; data: Value; error?: never }
  | { success: false; data?: never; error: SchemaError }

export class SchemaError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues[0]?.message ?? "Invalid value")
  }
}

export function parse<SchemaType extends TSchema>(
  valueSchema: SchemaType,
  value: SchemaBoundaryInput,
): StaticOutput<SchemaType> {
  // SAFETY: decode checked the value against the schema before decoding it,
  // or returned undefined for an optional schema.
  return decode(valueSchema, value) as StaticOutput<SchemaType>
}

export function safeParse<SchemaType extends TSchema>(
  valueSchema: SchemaType,
  value: SchemaBoundaryInput,
): SafeParseResult<StaticOutput<SchemaType>> {
  try {
    return { success: true, data: parse(valueSchema, value) }
  } catch (cause) {
    if (cause instanceof SchemaError) return { success: false, error: cause }
    throw cause
  }
}

/** TypeBox's Check, compiled the first time a schema checks a value. */
export function checkValue(
  valueSchema: TSchema,
  value: SchemaBoundaryInput,
): boolean {
  return validate(compiled(valueSchema), value)
}

/**
 * The value a refinement sees: decoded by the schema it refines, so a check
 * after `trim()` gets the trimmed string. TypeBox checks before it decodes.
 */
export function decodedValue(
  valueSchema: TSchema,
  value: SchemaBoundaryInput,
): SchemaBoundaryInput {
  const entry = compiled(valueSchema)
  return entry.hasCodec ? decodeCodecs(entry, Clone(value)) : value
}

/*
 * What parsing needs of a schema, worked out once: the graph without the
 * builder's proxies, whether it has codecs to run, and, the first time
 * they're needed, a compiled check and the union order decoding uses.
 */
type Compiled = {
  node: TSchema
  hasCodec: boolean
  validator?: Validator
  decoder?: TSchema
}

const compiledSchemas = new WeakMap<TSchema, Compiled>()

function compiled(valueSchema: TSchema): Compiled {
  const raw = unwrapSchema(valueSchema)
  const known = compiledSchemas.get(raw)
  if (known) return known
  const node = plainSchema(raw)
  const entry = compiledSchemas.get(node) ?? {
    node,
    hasCodec: HasCodec(node),
  }
  compiledSchemas.set(raw, entry)
  compiledSchemas.set(node, entry)
  return entry
}

function validate(entry: Compiled, value: SchemaBoundaryInput) {
  entry.validator ??= Compile(entry.node)
  return entry.validator.Check(value)
}

/*
 * TypeBox's Decode, without its Convert step, which turns null into "null"
 * or 1.5 into 1 where zod refused them. Coercion happens only where a
 * schema asks for it with `t.coerce`.
 */
function decode(valueSchema: TSchema, value: SchemaBoundaryInput) {
  const entry = compiled(valueSchema)
  const [prepared, holes] = prepareRoot(entry, value)
  // TypeBox's check takes undefined for an optional schema only as an
  // object's property. zod's took it as the whole value too.
  if (prepared === undefined && Type.IsOptional(entry.node)) return prepared
  if (!validate(entry, prepared)) {
    throw new SchemaError(issues(entry.node, prepared))
  }
  // Without codecs, decoding gives back the value it was given, except that
  // it fills the holes of the arrays it walks with undefined.
  return entry.hasCodec || holes ? decodeCodecs(entry, prepared) : prepared
}

/** Set when `prepare` or `detach` made an array with holes. */
let sawHoles = false

/** The prepared value, and whether it has arrays with holes. */
function prepareRoot(
  entry: Compiled,
  value: SchemaBoundaryInput,
): [SchemaBoundaryInput, boolean] {
  // A default or a refinement may parse another value on the way.
  const outer = sawHoles
  sawHoles = false
  try {
    return [prepareCopy(planOf(entry.node), value), sawHoles]
  } finally {
    sawHoles = outer
  }
}

/** `items.map(each)`, noting whether it skipped holes. */
function mapItems(
  items: SchemaBoundaryInput[],
  each: (item: SchemaBoundaryInput) => SchemaBoundaryInput,
) {
  let visited = 0
  const mapped = items.map((item) => {
    visited++
    return each(item)
  })
  if (visited !== items.length) sawHoles = true
  return mapped
}

/** Set while `decodeCodecs` has turned TypeBox's own union sorting off. */
let sortedHere = false

/**
 * TypeBox's DecodeUnsafe. It sorts the schema's unions before every call,
 * rebuilding the whole schema; this sorts them once and has TypeBox skip
 * it, which gives the same order.
 */
function decodeCodecs(entry: Compiled, value: SchemaBoundaryInput) {
  if (!sortedHere && !Settings.Get().unionPrioritySort) {
    return DecodeUnsafe({}, entry.node, value)
  }
  entry.decoder ??= UnionPrioritySort(entry.node)
  if (sortedHere) return DecodeUnsafe({}, entry.decoder, value)
  sortedHere = true
  Settings.Set({ unionPrioritySort: false })
  try {
    return DecodeUnsafe({}, entry.decoder, value)
  } finally {
    Settings.Set({ unionPrioritySort: true })
    sortedHere = false
  }
}

/** A value `detach` keeps as it is, so the steps after it write into it. */
function kept(value: SchemaBoundaryInput) {
  // Most values are plain objects, which it copies.
  if (
    Guard.IsObject(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return false
  }
  return (
    !Guard.IsArray(value) &&
    Guard.IsClassInstance(value) &&
    !(value instanceof Error)
  )
}

/**
 * A copy for the steps that write into it. TypeBox's Clone keeps class
 * instances as they are, so `prepare` would delete keys from an error a caller
 * still holds. Errors are copied like plain objects; other class instances,
 * such as Dates, stay as they are.
 */
function detach(value: SchemaBoundaryInput): SchemaBoundaryInput {
  if (Guard.IsArray(value)) return mapItems(value, detach)
  if (!Guard.IsObjectNotArray(value) || kept(value)) return value
  return Object.fromEntries(
    Object.getOwnPropertyNames(value)
      .filter((key) => key !== "__proto__")
      .map((key) => [key, detach(value[key])]),
  )
}

/*
 * How `prepare` treats a schema node, worked out once and linked to the
 * plans of the nodes inside it. Checks run in the order `prepare` made
 * them before: coercion first.
 */
type Node = Record<PropertyKey, SchemaBoundaryInput>
type Field = { key: string; plan: Plan; whenMissing: boolean }
type ObjectPlan = {
  kind: "object"
  node: TSchema
  fields: Field[]
  names: Set<string>
  properties: TObject["properties"]
  additional: SchemaBoundaryInput
  additionalPlan: Plan | undefined
  /** No key is `__proto__`, which copies leave out. */
  plainKeys: boolean
  /** Copiers for the key orders inputs came in. */
  orders: { keys: string[]; copy: Copier }[]
}
type RecordPlan = { kind: "record"; node: TSchema; keys: RegExp; item: Plan }
type Plan =
  | { kind: "coerced"; node: TSchema }
  | { kind: "array"; node: TSchema; items: Plan }
  | { kind: "nullable"; node: TSchema; first: Plan }
  | { kind: "union"; node: TUnion }
  | ObjectPlan
  | RecordPlan
  | { kind: "value"; node: TSchema }

const plans = new WeakMap<TSchema, Plan>()

function planOf(node: TSchema): Plan {
  const known = plans.get(node)
  if (known) return known
  const plan = makePlan(node)
  plans.set(node, plan)
  return plan
}

function makePlan(node: TSchema): Plan {
  // SAFETY: These are the markers the builder sets; TypeBox leaves them unset.
  const marked = node as TSchema & Markers
  if (marked[coerced]) return { kind: "coerced", node }
  if (Type.IsArray(node)) {
    return { kind: "array", node, items: planOf(node.items) }
  }
  if (Type.IsUnion(node)) {
    // A nullable takes null before its schema sees it.
    const [first] = node.anyOf
    return marked[nullableUnion] && first
      ? { kind: "nullable", node, first: planOf(first) }
      : { kind: "union", node }
  }
  if (Type.IsObject(node)) {
    const additional = Guard.HasPropertyKey(node, "additionalProperties")
      ? node.additionalProperties
      : undefined
    const keys = Object.keys(node.properties)
    return {
      kind: "object",
      node,
      fields: Object.entries(node.properties).map(([key, schema]) => ({
        key,
        plan: planOf(schema),
        whenMissing: runsOnMissingKey(schema),
      })),
      names: new Set(keys),
      properties: node.properties,
      additional,
      additionalPlan: Type.IsSchema(additional)
        ? planOf(additional)
        : undefined,
      plainKeys: !keys.includes("__proto__"),
      orders: [],
    }
  }
  // A record's keys that its pattern doesn't take go, as TypeBox's Clean
  // dropped them.
  if (Type.IsRecord(node)) {
    const [entry] = Object.entries(node.patternProperties)
    return entry
      ? {
          kind: "record",
          node,
          keys: new RegExp(entry[0]),
          item: planOf(entry[1]),
        }
      : { kind: "value", node }
  }
  return { kind: "value", node }
}

/*
 * Everything before the check, in one walk of the schema, so each step sees
 * the others' work wherever the schema sits, as in zod's parse. It fills in
 * defaults, lets undefined through an optional and null through a nullable,
 * coerces, runs a catch on a missing key, and strips the keys an object
 * doesn't name. A strict object keeps them for the check to report.
 *
 * `prepareCopy` gives what `prepare` gives for `detach(input)`, copying as
 * it goes instead of first copying the whole input. `prepare` writes into
 * the value it's given: a default's clone, or a class instance `detach`
 * keeps.
 */
function prepareCopy(
  plan: Plan,
  input: SchemaBoundaryInput,
): SchemaBoundaryInput {
  if (input === undefined) return prepare(plan, input)
  switch (plan.kind) {
    case "value":
      return Guard.IsObject(input) ? detach(input) : input
    case "coerced":
      return Number(detach(input))
    case "array":
      return Guard.IsArray(input)
        ? mapItems(input, (item) => prepareCopy(plan.items, item))
        : detach(input)
    case "nullable":
      return input === null ? input : prepareCopy(plan.first, input)
    case "union":
      return prepareUnion(plan.node, detach(input))
    case "object":
      if (!Guard.IsObjectNotArray(input)) return detach(input)
      return kept(input) ? prepareObject(plan, input) : copyObject(plan, input)
    case "record":
      if (!Guard.IsObjectNotArray(input)) return detach(input)
      return kept(input) ? prepareRecord(plan, input) : copyRecord(plan, input)
  }
}

function prepare(plan: Plan, input: SchemaBoundaryInput): SchemaBoundaryInput {
  // A default fills in the input, as TypeBox's Default does.
  const value = input === undefined ? defaultInput(plan.node) : input
  if (value === undefined && Type.IsOptional(plan.node)) return value
  switch (plan.kind) {
    case "value":
      return value
    case "coerced":
      return value === undefined ? value : Number(value)
    case "array":
      return Guard.IsArray(value)
        ? mapItems(value, (item) => prepare(plan.items, item))
        : value
    case "nullable":
      return value === null ? value : prepare(plan.first, value)
    case "union":
      return prepareUnion(plan.node, value)
    case "object":
      return Guard.IsObjectNotArray(value) ? prepareObject(plan, value) : value
    case "record":
      return Guard.IsObjectNotArray(value) ? prepareRecord(plan, value) : value
  }
}

function defaultInput(node: TSchema): SchemaBoundaryInput {
  // SAFETY: `default` is the JSON Schema keyword `$default` stores.
  const { default: value } = node as TSchema & { default?: SchemaBoundaryInput }
  return Guard.IsFunction(value) ? value() : Clone(value)
}

/** The value as the first option that takes it once prepared, as zod tried them. */
function prepareUnion(
  node: TUnion,
  value: SchemaBoundaryInput,
): SchemaBoundaryInput {
  for (const option of node.anyOf) {
    const candidate = prepare(planOf(option), Clone(value))
    if (checkValue(option, candidate)) return candidate
  }
  return value
}

function prepareObject(plan: ObjectPlan, value: Node): Node {
  for (const { key, plan: field, whenMissing } of plan.fields) {
    const present = hasKey(value, key)
    const prepared = prepare(field, value[key])
    if (present || prepared !== undefined) value[key] = prepared
    // The check then takes the key, and the catch decodes undefined.
    else if (whenMissing) value[key] = undefined
  }
  // zod's looseObject kept unknown keys, and its strict objects reported them.
  if (Guard.IsBoolean(plan.additional)) return value
  for (const key of Guard.Keys(value)) {
    if (hasKey(plan.properties, key)) continue
    if (plan.additionalPlan) {
      value[key] = prepare(plan.additionalPlan, value[key])
    } else Reflect.deleteProperty(value, key)
  }
  return value
}

/**
 * `prepareObject` on a copy, for an input `detach` would have copied: the
 * same keys in the same order, each value prepared from the input's.
 */
function copyObject(plan: ObjectPlan, input: Node) {
  const keys = Object.getOwnPropertyNames(input)
  const copy = copierFor(plan, keys)
  return copy ? copy(input) : copyObjectKeys(plan, input, keys)
}

type Copier = (input: Node) => Node

/** The most key orders an object schema keeps a copier for. */
const MAX_ORDERS = 8

/**
 * A copier for inputs with exactly the schema's keys in this order. Code
 * builds objects in the schema's order; JSON from Postgres comes in its
 * own, so a schema usually sees one or two.
 */
function copierFor(plan: ObjectPlan, keys: string[]): Copier | undefined {
  for (const order of plan.orders) {
    if (sameKeys(order.keys, keys)) return order.copy
  }
  if (plan.orders.length >= MAX_ORDERS || !onlyFields(plan, keys)) {
    return undefined
  }
  const copy = fieldCopier(plan, keys)
  plan.orders.push({ keys, copy })
  return copy
}

function sameKeys(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index]) return false
  }
  return true
}

/** The input's keys are the schema's, each once, in any order. */
function onlyFields(plan: ObjectPlan, keys: string[]) {
  return (
    plan.plainKeys &&
    keys.length === plan.fields.length &&
    keys.every((key) => plan.names.has(key))
  )
}

/**
 * `copyObjectKeys` for inputs with these keys, as one function: it reads
 * the values in the input's order, prepares them in the schema's, and
 * returns them as an object literal in the input's order, which V8 builds
 * much faster than an object whose keys are set one at a time. Where code
 * can't be evaluated (a CSP without 'unsafe-eval', or TypeBox's
 * acceleration turned off), it is `copyObjectKeys`, as TypeBox's checks
 * fall back too.
 */
function fieldCopier(plan: ObjectPlan, keys: string[]): Copier {
  if (!Environment.CanEvaluate()) {
    return (input) => copyObjectKeys(plan, input, keys)
  }
  const plans = plan.fields.map((field) => field.plan)
  const names = keys.map((key) => JSON.stringify(key))
  const read = names.map((name, index) => `const r${index} = input[${name}]`)
  const prepare = plan.fields.map(
    ({ key }, index) =>
      `const v${index} = prepare(plans[${index}], r${keys.indexOf(key)})`,
  )
  const fields = plan.fields.map(({ key }) => key)
  const build = names.map(
    (name, index) => `${name}: v${fields.indexOf(keys[index] ?? "")}`,
  )
  // SAFETY: The code is a function of the plans and prepareCopy that
  // returns a Copier, which reads, prepares, and returns the input's keys.
  const create = Environment.Evaluate(
    "plans",
    "prepare",
    `return (input) => { ${[...read, ...prepare].join("; ")}; return { ${build.join(", ")} } }`,
  ) as (plans: Plan[], prepare: typeof prepareCopy) => Copier
  return create(plans, prepareCopy)
}

function copyObjectKeys(plan: ObjectPlan, input: Node, keys: string[]) {
  const value: Node = {}
  for (const key of keys) if (key !== "__proto__") value[key] = input[key]
  for (const { key, plan: field, whenMissing } of plan.fields) {
    const present = hasKey(value, key)
    // An own value is the input's, which `detach` would have copied; one
    // from the prototype, like `toString`, it would have left as it is.
    const prepared = Object.hasOwn(value, key)
      ? prepareCopy(field, value[key])
      : prepare(field, value[key])
    if (present || prepared !== undefined) value[key] = prepared
    else if (whenMissing) value[key] = undefined
  }
  // The other keys: kept as copies, prepared by the additional schema, or
  // dropped. A key on the prototype of the properties stays, as before.
  for (const key of Guard.Keys(value)) {
    if (plan.names.has(key)) continue
    if (Guard.IsBoolean(plan.additional) || hasKey(plan.properties, key)) {
      value[key] = detach(value[key])
    } else if (plan.additionalPlan) {
      value[key] = prepareCopy(plan.additionalPlan, value[key])
    } else Reflect.deleteProperty(value, key)
  }
  return value
}

function prepareRecord(plan: RecordPlan, value: Node): Node {
  for (const key of Guard.Keys(value)) {
    if (plan.keys.test(key)) value[key] = prepare(plan.item, value[key])
    else Reflect.deleteProperty(value, key)
  }
  return value
}

function copyRecord(plan: RecordPlan, input: Node) {
  const value: Node = {}
  for (const key of Object.getOwnPropertyNames(input)) {
    if (key !== "__proto__" && plan.keys.test(key)) {
      value[key] = prepareCopy(plan.item, input[key])
    }
  }
  return value
}

/** TypeBox's test for a key, as its check of required keys uses it. */
function hasKey(value: Node, key: string) {
  return Guard.HasPropertyKey(value, key)
}

/** A schema that decodes a missing key, as zod's catch and preprocess did. */
function runsOnMissingKey(valueSchema: TSchema): boolean {
  // SAFETY: These are the markers the builder sets; TypeBox leaves them unset.
  const node = unwrapSchema(valueSchema) as TSchema & Markers
  if (Type.IsOptional(node)) return false
  if (node[runsWhenMissing]) return true
  const [first] = Type.IsUnion(node) ? node.anyOf : []
  return Boolean(node[nullableUnion] && first && runsOnMissingKey(first))
}

function issues(
  valueSchema: TSchema,
  value: SchemaBoundaryInput,
): ValidationIssue[] {
  // The key a strict object doesn't name fails `false`, then its object.
  const errors = Errors(valueSchema, value).filter(
    (error) =>
      error.keyword !== "boolean" ||
      !error.schemaPath.endsWith("/additionalProperties"),
  )
  return errors
    .filter((error) => !unionNoise(error, errors))
    .flatMap((error) => errorIssues(valueSchema, value, error))
    .map((issue) => ({ issue, rank: issueRank(valueSchema, issue.path) }))
    .sort((a, b) => compareRanks(a.rank, b.rank))
    .map(({ issue }) => issue)
}

function errorIssues(
  valueSchema: TSchema,
  value: SchemaBoundaryInput,
  error: TLocalizedValidationError,
): ValidationIssue[] {
  // One issue per missing key, at the key, as zod reports them.
  if (error.keyword === "required") {
    return error.params.requiredProperties.map((key) => ({
      path: issuePath(value, `${error.instancePath}/${pointerKey(key)}`),
      message: `must have required properties ${key}`,
    }))
  }
  // One issue for all of them, at the object, in zod's words.
  if (error.keyword === "additionalProperties") {
    const keys = error.params.additionalProperties
    return [
      {
        path: issuePath(value, error.instancePath),
        message: `Unrecognized key${keys.length > 1 ? "s" : ""}: ${keys
          .map((key) => `"${key}"`)
          .join(", ")}`,
      },
    ]
  }
  return [
    {
      path: [
        ...issuePath(value, error.instancePath),
        ...(error.keyword === "~refine"
          ? refinementPath(valueSchema, error)
          : []),
      ],
      message: error.message,
    },
  ]
}

/**
 * Where an issue sits in the schema: each key's place among its object's
 * properties, or the array index. TypeBox lists missing keys before the
 * rest; zod went in property order, which decides the first issue.
 */
function issueRank(valueSchema: TSchema, path: PropertyKey[]) {
  const rank: number[] = []
  let current: TSchema | undefined = valueSchema
  for (const key of path) {
    const object: TObject | undefined =
      current && branch(current, Type.IsObject)
    if (object) {
      const keys = Object.keys(object.properties)
      const index = keys.indexOf(String(key))
      rank.push(index === -1 ? keys.length : index)
      current = object.properties[String(key)]
    } else {
      rank.push(Number(String(key)) || 0)
      current = current && branch(current, Type.IsArray)?.items
    }
  }
  return rank
}

/** The schema, or the branch of a nullable one, that `guard` picks. */
function branch<Branch extends TSchema>(
  valueSchema: TSchema,
  guard: (candidate: TSchema) => candidate is Branch,
) {
  if (guard(valueSchema)) return valueSchema
  return Type.IsUnion(valueSchema) ? valueSchema.anyOf.find(guard) : undefined
}

function compareRanks(a: number[], b: number[]) {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  // A value's own checks run after those inside it, so its issues follow.
  return b.length - a.length
}

/**
 * A nullable value that fails reports only its own errors, as zod did, not
 * the "must be null" of the other branch or the union's summary.
 */
function unionNoise(
  error: TLocalizedValidationError,
  errors: TLocalizedValidationError[],
) {
  const noise = (candidate: TLocalizedValidationError) =>
    candidate.keyword === "anyOf" ||
    (candidate.keyword === "type" && candidate.params.type === "null")
  return (
    noise(error) &&
    errors.some(
      (other) =>
        !noise(other) &&
        (other.instancePath === error.instancePath ||
          other.instancePath.startsWith(`${error.instancePath}/`)),
    )
  )
}

/** The `path` the failed refinement was given, found through its schema. */
function refinementPath(valueSchema: TSchema, error: TRefineError) {
  let node: SchemaBoundaryInput = valueSchema
  for (const part of error.schemaPath.split("/").slice(1)) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~")
    node = Guard.IsArray(node)
      ? node[Number(key)]
      : Guard.IsObjectNotArray(node)
        ? node[key]
        : undefined
  }
  const check = Type.IsRefine(node)
    ? node["~refine"][error.params.index]?.check
    : undefined
  return (check && refinementPaths.get(check)) ?? []
}

/** A JSON pointer as path keys, with array indexes as numbers. */
function issuePath(value: SchemaBoundaryInput, pointer: string) {
  const path: PropertyKey[] = []
  let current = value
  for (const part of pointer.split("/").slice(1)) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~")
    if (Guard.IsArray(current)) {
      const index = Number(key)
      path.push(index)
      current = current[index]
    } else {
      path.push(key)
      current = Guard.IsObjectNotArray(current) ? current[key] : undefined
    }
  }
  return path
}

function pointerKey(key: string) {
  return key.replaceAll("~", "~0").replaceAll("/", "~1")
}
