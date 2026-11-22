/*
 * Reads the server's OpenAPI document for the Flutter app's generated
 * client: a declaration for each schema that needs a class or constants,
 * and an endpoint for each operation, with the types of its arguments and
 * its output. dart-client.ts writes them as Dart.
 *
 * A schema it can't map fails the run instead of turning into untyped
 * JSON, so a new shape in the contract gets a deliberate form.
 */

type Literal = string | number | boolean | null

/** A JSON value, as a schema's `default`. */
type Value = Literal | readonly Value[] | { readonly [key: string]: Value }

type JsonType =
  | "array"
  | "boolean"
  | "integer"
  | "null"
  | "number"
  | "object"
  | "string"

/**
 * The JSON Schema in the document: what TypeBoxToJsonSchemaConverter
 * writes, and the event streams oRPC wraps around it.
 */
export type Schema = {
  $ref?: string
  type?: JsonType | JsonType[]
  properties?: Record<string, Schema>
  required?: string[]
  items?: Schema
  additionalProperties?: Schema | boolean
  anyOf?: Schema[]
  oneOf?: Schema[]
  enum?: Literal[]
  const?: Literal
  format?: string
  contentMediaType?: string
  not?: Schema
  default?: Value
}

type Method = "get" | "post" | "put" | "patch" | "delete"

type Parameter = {
  name: string
  in: string
  required?: boolean
  schema?: Schema
}

type Content = Record<string, { schema?: Schema }>

type Operation = {
  operationId?: string
  summary?: string
  description?: string
  parameters?: Parameter[]
  requestBody?: { content?: Content }
  responses?: Record<string, { content?: Content }>
}

export type Document = {
  paths?: Record<string, Partial<Record<Method, Operation>>>
  components?: { schemas?: Record<string, Schema> }
}

type WireType =
  | { kind: "String" | "Int" | "Long" | "Double" | "Boolean" }
  | { kind: "JsonElement" | "JsonObject" }
  | { kind: "class"; name: string }
  | { kind: "list"; item: Typed }
  | { kind: "map"; value: Typed }
  /** A field that may be left out, null, or a value: [Typed] says which value. */
  | { kind: "explicit"; value: Typed }

export type Typed = { type: WireType; nullable: boolean }

type Property = { json: string; typed: Typed; optional: boolean }

type ClassDeclaration = {
  kind: "class"
  name: string
  properties: Property[]
  nested: Declaration[]
  /** For a union's variant: the union and the tag it's sent with. */
  variantOf?: { union: string; tag: string }
}

export type Declaration =
  | ClassDeclaration
  | {
      kind: "union"
      name: string
      discriminator: string
      variants: ClassDeclaration[]
    }
  | { kind: "values"; name: string; values: Literal[] }

/** Where a schema's inline classes go, and what they're called from outside. */
export type Scope = { declarations: Declaration[]; prefix: string }

export const METHODS: readonly Method[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
]

class UnsupportedSchema extends Error {}

function literalKind(value: Literal): "string" | "number" | "boolean" | "null" {
  if (value === null) return "null"
  if (value === true || value === false) return "boolean"
  if (Number.isFinite(value)) return "number"
  return "string"
}

export function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

export function camel(name: string): string {
  const joined = pascal(name)
  return joined.charAt(0).toLowerCase() + joined.slice(1)
}

/** What one item of a list called [name] is called: `directories` holds a `Directory`. */
function singular(name: string): string {
  if (name.endsWith("ies")) return `${name.slice(0, -3)}y`
  if (name.endsWith("sses")) return name.slice(0, -2)
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1)
  return name
}

function isNull(schema: Schema): boolean {
  return schema.type === "null"
}

/** `undefined` in the contract: an output that sends nothing back. */
function isVoid(schema: Schema): boolean {
  if (schema.not !== undefined) return true
  const members = schema.anyOf ?? schema.oneOf
  return members !== undefined && members.every(isVoid)
}

function refName(ref: string): string {
  const name = ref.split("/").pop()
  if (!name) throw new UnsupportedSchema(`a $ref without a name: ${ref}`)
  return name
}

export class SchemaWalker {
  readonly #components: Map<string, Schema>
  /** Top-level declarations, in the order the document names them. */
  readonly #declarations: Declaration[] = []
  readonly #declared = new Set<string>()

  constructor(components: Map<string, Schema>) {
    this.#components = components
  }

  get declarations(): readonly Declaration[] {
    return this.#declarations
  }

  /** Declare the component [name] if it needs a class or constants. */
  component(name: string): void {
    if (this.#declared.has(name)) return
    this.#declared.add(name)
    const schema = this.#component(name)
    const scope = { declarations: this.#declarations, prefix: "" }
    if (this.#isClass(schema)) {
      this.#declareClass(schema, scope, name, name)
      return
    }
    const values = this.#values(schema)
    if (values.length > 0) {
      this.#declarations.push({ kind: "values", name, values })
    }
  }

  #component(name: string): Schema {
    const schema = this.#components.get(name)
    if (!schema) throw new UnsupportedSchema(`no component named ${name}`)
    return schema
  }

  /** Whether a schema becomes a class of its own, rather than a String or a list. */
  #isClass(schema: Schema): boolean {
    if (schema.$ref !== undefined) {
      return this.#isClass(this.#component(refName(schema.$ref)))
    }
    if (schema.type === "object") return schema.properties !== undefined
    const members = (schema.anyOf ?? schema.oneOf ?? []).filter(
      (member) => !isNull(member),
    )
    return members.length > 1 && this.#discriminator(members) !== undefined
  }

  /** The enum values or string constants of a schema, for an object of constants. */
  #values(schema: Schema): Literal[] {
    if (schema.enum) return schema.enum
    const members = schema.anyOf ?? schema.oneOf ?? []
    return members.flatMap((member) =>
      member.const === undefined ? [] : [member.const],
    )
  }

  /** The property every member sets to a different string, as a union's tag. */
  #discriminator(members: Schema[]): string | undefined {
    const first = members[0]
    if (!first?.properties) return undefined
    for (const key of Object.keys(first.properties)) {
      const tags = members.map((member) => member.properties?.[key]?.const)
      const strings = tags.every(
        (tag) => tag !== undefined && literalKind(tag) === "string",
      )
      if (
        strings &&
        members.every((member) => member.required?.includes(key)) &&
        new Set(tags).size === members.length
      ) {
        return key
      }
    }
    return undefined
  }

  #declareClass(
    schema: Schema,
    scope: Scope,
    name: string,
    where: string,
  ): WireType {
    const qualified = scope.prefix ? `${scope.prefix}.${name}` : name
    if (
      scope.declarations.some((declaration) => declaration.name === name) ||
      (scope.prefix !== "" && this.#components.has(name))
    ) {
      throw new UnsupportedSchema(
        `${where}: a class named ${qualified} would shadow another`,
      )
    }
    const members = (schema.anyOf ?? schema.oneOf ?? []).filter(
      (member) => !isNull(member),
    )
    if (members.length > 1) {
      const discriminator = this.#discriminator(members)
      if (discriminator === undefined) {
        throw new UnsupportedSchema(`${where}: a union without a string tag`)
      }
      const variants = members.map((member) => {
        const tag = String(member.properties?.[discriminator]?.const)
        if (this.#components.has(pascal(tag))) {
          throw new UnsupportedSchema(
            `${where}: the variant ${qualified}.${pascal(tag)} would shadow a schema`,
          )
        }
        const variant = this.#objectClass(
          member,
          `${qualified}.${pascal(tag)}`,
          pascal(tag),
          `${where}.${tag}`,
          discriminator,
        )
        variant.variantOf = { union: qualified, tag }
        return variant
      })
      scope.declarations.push({ kind: "union", name, discriminator, variants })
      return { kind: "class", name: qualified }
    }
    scope.declarations.push(
      this.#objectClass(schema, qualified, name, where, undefined),
    )
    return { kind: "class", name: qualified }
  }

  #objectClass(
    schema: Schema,
    qualified: string,
    name: string,
    where: string,
    skip: string | undefined,
  ): ClassDeclaration {
    const declaration: ClassDeclaration = {
      kind: "class",
      name,
      properties: [],
      nested: [],
    }
    const scope = { declarations: declaration.nested, prefix: qualified }
    for (const [json, property] of Object.entries(schema.properties ?? {})) {
      if (json === skip) continue
      const optional = !schema.required?.includes(json)
      const typed = this.type(property, scope, pascal(json), `${where}.${json}`)
      declaration.properties.push({
        json,
        optional,
        // Left out, null, and a value are three things to send, unless
        // the contract fills in null when it's left out.
        typed:
          optional && typed.nullable && property.default !== null
            ? {
                type: { kind: "explicit", value: { ...typed, nullable: true } },
                nullable: true,
              }
            : typed,
      })
    }
    return declaration
  }

  /** The type of [schema], declaring the classes it needs in [scope]. */
  type(schema: Schema, scope: Scope, name: string, where: string): Typed {
    if (schema.$ref !== undefined) {
      const component = refName(schema.$ref)
      this.component(component)
      const target = this.#component(component)
      if (this.#isClass(target)) {
        return { type: { kind: "class", name: component }, nullable: false }
      }
      return this.type(target, scope, component, component)
    }

    const members = schema.anyOf ?? schema.oneOf
    if (members) {
      const present = members.filter((member) => !isNull(member))
      const nullable = present.length < members.length
      const only = present[0]
      if (present.length === 1 && only) {
        const typed = this.type(only, scope, name, where)
        return { ...typed, nullable: nullable || typed.nullable }
      }
      if (present.every((member) => this.#isText(member))) {
        return { type: { kind: "String" }, nullable }
      }
      if (this.#discriminator(present) !== undefined) {
        const type = this.#declareClass({ anyOf: present }, scope, name, where)
        return { type, nullable }
      }
      throw new UnsupportedSchema(`${where}: a union of different types`)
    }

    const types = Array.isArray(schema.type)
      ? schema.type
      : schema.type === undefined
        ? []
        : [schema.type]
    const nullable = types.includes("null")
    const type = types.find((each) => each !== "null")

    if (schema.enum) {
      const kinds = new Set(schema.enum.map(literalKind))
      if (kinds.size === 1 && kinds.has("string")) {
        return { type: { kind: "String" }, nullable }
      }
      if (kinds.size === 1 && kinds.has("number")) {
        const whole = schema.enum.every((value) => Number.isInteger(value))
        return { type: { kind: whole ? "Int" : "Double" }, nullable }
      }
      throw new UnsupportedSchema(`${where}: an enum of mixed types`)
    }
    if (schema.const !== undefined) {
      const kind = literalKind(schema.const)
      if (kind === "string") return { type: { kind: "String" }, nullable }
      if (kind === "boolean") return { type: { kind: "Boolean" }, nullable }
      if (kind === "number") {
        const whole = Number.isInteger(schema.const)
        return { type: { kind: whole ? "Int" : "Double" }, nullable }
      }
      throw new UnsupportedSchema(`${where}: a null constant`)
    }

    switch (type) {
      case "string":
        return { type: { kind: "String" }, nullable }
      case "boolean":
        return { type: { kind: "Boolean" }, nullable }
      case "number":
        return { type: { kind: "Double" }, nullable }
      case "integer":
        return { type: { kind: this.#integer(schema) }, nullable }
      case "array": {
        if (!schema.items) throw new UnsupportedSchema(`${where}: no items`)
        const item = this.type(
          schema.items,
          scope,
          singular(name),
          `${where}[]`,
        )
        return { type: { kind: "list", item }, nullable }
      }
      case "object": {
        if (schema.properties) {
          const declared = this.#declareClass(schema, scope, name, where)
          return { type: declared, nullable }
        }
        const values = schema.additionalProperties
        if (values !== undefined && values !== true && values !== false) {
          const value = this.type(values, scope, singular(name), `${where}{}`)
          return { type: { kind: "map", value }, nullable }
        }
        return { type: { kind: "JsonObject" }, nullable }
      }
      case undefined:
        // `{}` is anything at all, and `{ not: {} }` a `t.custom()` value
        // the document can't describe; both stay JSON.
        if (Object.keys(schema).length === 0 || schema.not !== undefined) {
          return { type: { kind: "JsonElement" }, nullable }
        }
        throw new UnsupportedSchema(`${where}: a schema without a type`)
      default:
        throw new UnsupportedSchema(`${where}: a ${type} schema`)
    }
  }

  /**
   * Int, unless the contract marks the number `int64` because it can pass
   * 2^31, as a size in bytes can. `int()` alone allows 2^53, which an
   * index or a count never reaches.
   */
  #integer(schema: Schema): "Int" | "Long" {
    return schema.format === "int64" ? "Long" : "Int"
  }

  #isText(schema: Schema): boolean {
    if (schema.$ref !== undefined) {
      return this.#isText(this.#component(refName(schema.$ref)))
    }
    if (schema.type === "string") return true
    if (schema.const !== undefined)
      return literalKind(schema.const) === "string"
    if (schema.enum) {
      return schema.enum.every((value) => literalKind(value) === "string")
    }
    const members = schema.anyOf ?? schema.oneOf
    return (
      members !== undefined && members.every((member) => this.#isText(member))
    )
  }
}

// Operations

type Argument = {
  name: string
  typed: Typed
  optional: boolean
  /** How the request carries it. */
  place: "path" | "query" | "body" | "form" | "file"
  /** Its name there. */
  wire: string
}

export type Endpoint = {
  group: string[]
  name: string
  method: Method
  path: string
  doc: string[]
  arguments: Argument[]
  /** An inline JSON body's class, which the arguments fill. */
  input?: string
  /** A body that is one schema of its own, passed whole. */
  body?: Argument
  output: Typed | "void"
  events: boolean
}

function isFile(schema: Schema): boolean {
  if (schema.contentMediaType !== undefined) return true
  const members = schema.anyOf ?? schema.oneOf
  return members !== undefined && members.length > 0 && members.every(isFile)
}

export function endpoint(
  client: SchemaWalker,
  scope: Scope,
  method: Method,
  path: string,
  operation: Operation,
): Endpoint {
  const id = operation.operationId
  if (!id) throw new UnsupportedSchema(`${method} ${path}: no operationId`)
  const segments = id.split(".")
  const name = segments.pop()
  if (!name) throw new UnsupportedSchema(`${id}: an empty operationId`)
  const typeName = pascal(id)

  const doc: string[] = []
  if (operation.summary) doc.push(operation.summary)
  if (operation.description) doc.push(operation.description)
  doc.push(`\`${method.toUpperCase()} ${path}\``)

  const result: Endpoint = {
    group: segments,
    name,
    method,
    path,
    doc,
    arguments: [],
    output: "void",
    events: false,
  }

  for (const parameter of operation.parameters ?? []) {
    if (parameter.in !== "path" && parameter.in !== "query") {
      throw new UnsupportedSchema(`${id}: a ${parameter.in} parameter`)
    }
    if (!parameter.schema)
      throw new UnsupportedSchema(`${id}: ${parameter.name} has no schema`)
    const typed = client.type(
      parameter.schema,
      scope,
      `${typeName}${pascal(parameter.name)}`,
      `${id}.${parameter.name}`,
    )
    if (
      typed.type.kind === "list" ||
      typed.type.kind === "map" ||
      typed.type.kind === "class"
    ) {
      throw new UnsupportedSchema(`${id}: ${parameter.name} isn't plain text`)
    }
    result.arguments.push({
      name: camel(parameter.name),
      typed,
      optional: parameter.required !== true,
      place: parameter.in,
      wire: parameter.name,
    })
  }

  const content = operation.requestBody?.content ?? {}
  const form = content["multipart/form-data"]?.schema
  const json = content["application/json"]?.schema
  const formFields = Object.entries(form?.properties ?? {})
  if (form && formFields.some(([, field]) => isFile(field))) {
    for (const [wire, field] of formFields) {
      const file = isFile(field)
      result.arguments.push({
        name: camel(wire),
        typed: file
          ? { type: { kind: "class", name: "FilePart" }, nullable: false }
          : client.type(
              field,
              scope,
              `${typeName}${pascal(wire)}`,
              `${id}.${wire}`,
            ),
        optional: !form.required?.includes(wire),
        place: file ? "file" : "form",
        wire,
      })
    }
  } else if (json?.$ref !== undefined) {
    const component = refName(json.$ref)
    result.body = {
      name: camel(component),
      typed: client.type(json, scope, component, id),
      optional: false,
      place: "body",
      wire: "",
    }
  } else if (json?.properties) {
    const input = `${typeName}Input`
    const typed = client.type(json, scope, input, `${id}.input`)
    const declared = scope.declarations.find((each) => each.name === input)
    if (typed.type.kind !== "class" || declared?.kind !== "class") {
      throw new UnsupportedSchema(`${id}: an input that isn't an object`)
    }
    result.input = typed.type.name
    for (const property of declared.properties) {
      result.arguments.push({
        name: camel(property.json),
        typed: property.typed,
        optional: property.optional,
        place: "body",
        wire: property.json,
      })
    }
  } else if (json && Object.keys(json).length > 0) {
    throw new UnsupportedSchema(`${id}: a body that isn't an object`)
  }

  const responses = operation.responses ?? {}
  const success = responses["200"] ?? responses["201"] ?? responses["204"]
  const events = success?.content?.["text/event-stream"]?.schema
  const output = success?.content?.["application/json"]?.schema
  if (events) {
    const message = (events.oneOf ?? events.anyOf ?? []).find(
      (each) => each.properties?.event?.const === "message",
    )
    const data = message?.properties?.data
    if (!data)
      throw new UnsupportedSchema(`${id}: an event stream without messages`)
    result.events = true
    result.output = client.type(data, scope, `${typeName}Event`, `${id}.event`)
  } else if (output && !isVoid(output)) {
    result.output = client.type(
      output,
      scope,
      `${typeName}Output`,
      `${id}.output`,
    )
  }
  return result
}
