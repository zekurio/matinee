/*
 * Writes the Android app's API client from the OpenAPI document: a
 * kotlinx.serialization class for each schema, and a suspend function for
 * each operation, grouped as the contract's router is. The app's
 * hand-written `ApiTransport` sends the requests.
 *
 * A schema it can't map fails the run instead of turning into JsonElement,
 * so a new shape in the contract gets a deliberate Kotlin form.
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

type KotlinType =
  | { kind: "String" | "Int" | "Long" | "Double" | "Boolean" }
  | { kind: "JsonElement" | "JsonObject" }
  | { kind: "class"; name: string }
  | { kind: "list"; item: Typed }
  | { kind: "map"; value: Typed }
  /** A field that may be left out, null, or a value: [Typed] says which value. */
  | { kind: "explicit"; value: Typed }

type Typed = { type: KotlinType; nullable: boolean }

type Property = { json: string; typed: Typed; optional: boolean }

type ClassDeclaration = {
  kind: "class"
  name: string
  properties: Property[]
  nested: Declaration[]
  /** For a union's variant: the union and the tag it's sent with. */
  variantOf?: { union: string; tag: string }
}

type Declaration =
  | ClassDeclaration
  | {
      kind: "union"
      name: string
      discriminator: string
      variants: ClassDeclaration[]
    }
  | { kind: "values"; name: string; values: Literal[] }

/** Where a schema's inline classes go, and what they're called from outside. */
type Scope = { declarations: Declaration[]; prefix: string }

const KEYWORDS = new Set([
  "as",
  "break",
  "class",
  "continue",
  "do",
  "else",
  "false",
  "for",
  "fun",
  "if",
  "in",
  "interface",
  "is",
  "null",
  "object",
  "package",
  "return",
  "super",
  "this",
  "throw",
  "true",
  "try",
  "typealias",
  "typeof",
  "val",
  "var",
  "when",
  "while",
])

const METHODS: readonly Method[] = ["get", "post", "put", "patch", "delete"]

class UnsupportedSchema extends Error {}

function literalKind(value: Literal): "string" | "number" | "boolean" | "null" {
  if (value === null) return "null"
  if (value === true || value === false) return "boolean"
  if (Number.isFinite(value)) return "number"
  return "string"
}

function pascal(name: string): string {
  return name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

function camel(name: string): string {
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

/** A constant's name for an enum value: `burn-in` is `BURN_IN`, `7d` is `_7D`. */
function constantName(value: string): string {
  const name = value
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .join("_")
    .toUpperCase()
  return /^[0-9]/.test(name) ? `_${name}` : name
}

function identifier(name: string): string {
  return KEYWORDS.has(name) ? `\`${name}\`` : name
}

function kotlinString(value: string): string {
  return JSON.stringify(value).replaceAll("$", "\\$")
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

class KotlinClient {
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
  ): KotlinType {
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

  /** The Kotlin type of [schema], declaring the classes it needs in [scope]. */
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

// Rendering

class Lines {
  readonly #lines: string[] = []
  #depth = 0

  line(text = ""): void {
    this.#lines.push(text === "" ? "" : "    ".repeat(this.#depth) + text)
  }

  indent(body: () => void): void {
    this.#depth++
    body()
    this.#depth--
  }

  toString(): string {
    return `${this.#lines.join("\n")}\n`
  }

  /**
   * `head(a, b)` and what follows, on one line when it fits in 100
   * columns and with one argument a line when it doesn't.
   */
  call(head: string, args: readonly string[], tail: string): void {
    const flat = `${head}(${args.join(", ")})${tail}`
    if (
      "    ".repeat(this.#depth).length + flat.length <= 100 ||
      args.length === 0
    ) {
      this.line(flat)
      return
    }
    this.line(`${head}(`)
    this.indent(() => {
      for (const arg of args) this.line(`${arg},`)
    })
    this.line(`)${tail}`)
  }
}

function typeName(typed: Typed): string {
  const base = baseTypeName(typed.type)
  return typed.nullable ? `${base}?` : base
}

function baseTypeName(type: KotlinType): string {
  switch (type.kind) {
    case "class":
      return type.name
    case "list":
      return `List<${typeName(type.item)}>`
    case "map":
      return `Map<String, ${typeName(type.value)}>`
    case "explicit":
      return `Explicit<${baseTypeName(type.value.type)}>`
    default:
      return type.kind
  }
}

function serializer(typed: Typed): string {
  const base = baseSerializer(typed.type)
  return typed.nullable ? `${base}.nullable` : base
}

function baseSerializer(type: KotlinType): string {
  switch (type.kind) {
    case "class":
      return `${type.name}.serializer()`
    case "list":
      return `ListSerializer(${serializer(type.item)})`
    case "map":
      return `MapSerializer(String.serializer(), ${serializer(type.value)})`
    case "explicit":
      return `Explicit.serializer(${serializer({ ...type.value, nullable: false })})`
    default:
      return `${type.kind}.serializer()`
  }
}

function renderProperty(lines: Lines, property: Property): void {
  const name = camel(property.json)
  if (name !== property.json)
    lines.line(`@SerialName(${kotlinString(property.json)})`)
  const fallback = property.optional ? " = null" : ""
  const type = property.optional
    ? typeName({ ...property.typed, nullable: true })
    : typeName(property.typed)
  lines.line(`val ${identifier(name)}: ${type}${fallback},`)
}

function renderDeclaration(lines: Lines, declaration: Declaration): void {
  switch (declaration.kind) {
    case "values": {
      lines.line(`object ${declaration.name} {`)
      lines.indent(() => {
        const strings = declaration.values.every(
          (value) => literalKind(value) === "string",
        )
        if (strings) {
          for (const value of declaration.values) {
            const text = String(value)
            lines.line(
              `const val ${constantName(text)} = ${kotlinString(text)}`,
            )
          }
          const names = declaration.values.map((value) =>
            constantName(String(value)),
          )
          lines.line(`val all = listOf(${names.join(", ")})`)
        } else {
          lines.line(
            `val all = listOf(${declaration.values.map(String).join(", ")})`,
          )
        }
      })
      lines.line("}")
      return
    }
    case "union": {
      lines.line("@Serializable")
      lines.line(
        `@JsonClassDiscriminator(${kotlinString(declaration.discriminator)})`,
      )
      lines.line(`sealed interface ${declaration.name} {`)
      lines.indent(() => {
        declaration.variants.forEach((variant, index) => {
          if (index > 0) lines.line()
          renderDeclaration(lines, variant)
        })
      })
      lines.line("}")
      return
    }
    case "class": {
      lines.line("@Serializable")
      const variant = declaration.variantOf
      if (variant) lines.line(`@SerialName(${kotlinString(variant.tag)})`)
      const parent = variant ? ` : ${variant.union}` : ""
      if (declaration.properties.length === 0) {
        lines.line(
          variant
            ? `data object ${declaration.name}${parent}`
            : `class ${declaration.name}`,
        )
        return
      }
      lines.line(`data class ${declaration.name}(`)
      lines.indent(() => {
        for (const property of declaration.properties) {
          renderProperty(lines, property)
        }
      })
      if (declaration.nested.length === 0) {
        lines.line(`)${parent}`)
        return
      }
      lines.line(`)${parent} {`)
      lines.indent(() => {
        declaration.nested.forEach((nested, index) => {
          if (index > 0) lines.line()
          renderDeclaration(lines, nested)
        })
      })
      lines.line("}")
    }
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

type Endpoint = {
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

function endpoint(
  client: KotlinClient,
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

function renderArgument(argument: Argument): string {
  const type = argument.optional
    ? typeName({ ...argument.typed, nullable: true })
    : typeName(argument.typed)
  return `${identifier(argument.name)}: ${type}${argument.optional ? " = null" : ""}`
}

/** A path parameter or query value as text. */
function text(argument: Argument): string {
  const name = identifier(argument.name)
  const nullable = argument.optional || argument.typed.nullable
  if (argument.typed.type.kind === "String") return name
  return nullable ? `${name}?.toString()` : `${name}.toString()`
}

function renderEndpoint(lines: Lines, endpoint: Endpoint): void {
  const ordered = [
    ...endpoint.arguments.filter((each) => each.place === "path"),
    ...(endpoint.body ? [endpoint.body] : []),
    ...endpoint.arguments.filter(
      (each) => each.place !== "path" && !each.optional,
    ),
    ...endpoint.arguments.filter(
      (each) => each.place !== "path" && each.optional,
    ),
  ]
  const parameters = ordered.map(renderArgument)

  const segments = endpoint.path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const parameter = /^\{(.+)\}$/.exec(segment)?.[1]
      if (parameter === undefined) return kotlinString(segment)
      const argument = endpoint.arguments.find(
        (each) => each.place === "path" && each.wire === parameter,
      )
      if (!argument)
        throw new UnsupportedSchema(
          `${endpoint.path}: no parameter ${parameter}`,
        )
      return text(argument)
    })
  const query = endpoint.arguments
    .filter((each) => each.place === "query")
    .map((each) => `${kotlinString(each.wire)} to ${text(each)}`)
  const files = endpoint.arguments.filter((each) => each.place === "file")
  const fields = endpoint.arguments.filter((each) => each.place === "form")
  const bodyFields = endpoint.arguments.filter((each) => each.place === "body")

  let body = "null"
  if (files.length > 0) {
    const formFields = fields.map(
      (each) => `${kotlinString(each.wire)} to ${text(each)}`,
    )
    const formFiles = files.map(
      (each) => `${kotlinString(each.wire)} to ${identifier(each.name)}`,
    )
    body = `transport.form(${list(formFields)}, ${list(formFiles)})`
  } else if (endpoint.body) {
    body = `transport.json(${serializer(endpoint.body.typed)}, ${identifier(endpoint.body.name)})`
  } else if (endpoint.input) {
    const values = bodyFields.map(
      (each) => `${identifier(each.name)} = ${identifier(each.name)}`,
    )
    body = `transport.json(${endpoint.input}.serializer(), ${endpoint.input}(${values.join(", ")}))`
  }

  const request = [
    kotlinString(endpoint.method.toUpperCase()),
    `listOf(${segments.join(", ")})`,
    list(query),
    body,
  ]

  lines.line(`/** ${endpoint.doc.join(" ")} */`)
  const name = identifier(endpoint.name)
  const output = endpoint.output
  if (endpoint.events) {
    if (output === "void")
      throw new UnsupportedSchema(`${endpoint.path}: events without data`)
    lines.call(`fun ${name}`, parameters, `: Flow<${typeName(output)}> =`)
    lines.indent(() =>
      lines.call("transport.events", [...request, serializer(output)], ""),
    )
  } else if (output === "void") {
    lines.call(`suspend fun ${name}`, parameters, " {")
    lines.indent(() => lines.call("transport.send", request, ""))
    lines.line("}")
  } else {
    lines.call(`suspend fun ${name}`, parameters, `: ${typeName(output)} =`)
    lines.indent(() =>
      lines.call("transport.call", [...request, serializer(output)], ""),
    )
  }
}

function list(items: readonly string[]): string {
  return items.length === 0 ? "emptyList()" : `listOf(${items.join(", ")})`
}

type Group = {
  path: string[]
  endpoints: Endpoint[]
  groups: Map<string, Group>
}

function groupClass(path: string[]): string {
  return `${path.map(pascal).join("")}Api`
}

function renderGroup(lines: Lines, group: Group, root: boolean): void {
  const name = root ? "ContractApi" : groupClass(group.path)
  lines.line(
    root
      ? `open class ${name}(transport: ApiTransport) {`
      : `class ${name} internal constructor(private val transport: ApiTransport) {`,
  )
  lines.indent(() => {
    for (const [key, child] of group.groups) {
      lines.line(
        `val ${identifier(camel(key))} = ${groupClass(child.path)}(transport)`,
      )
    }
    group.endpoints.forEach((each, index) => {
      if (index > 0 || group.groups.size > 0) lines.line()
      renderEndpoint(lines, each)
    })
  })
  lines.line("}")
  for (const child of group.groups.values()) {
    lines.line()
    renderGroup(lines, child, false)
  }
}

const HEADER = [
  "// Generated by `pnpm api:android` from the server's OpenAPI document.",
  "// Don't edit it: change packages/contracts and generate it again.",
]

/** The two Kotlin files, by name, for the app's `api` package. */
export function kotlinClient(document: Document): Map<string, string> {
  const components = new Map(Object.entries(document.components?.schemas ?? {}))
  const client = new KotlinClient(components)
  for (const name of components.keys()) client.component(name)

  const root: Group = { path: [], endpoints: [], groups: new Map() }
  const scope: Scope = { declarations: [], prefix: "" }
  const operationTypes = scope.declarations
  for (const [path, operations] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = operations[method]
      if (!operation) continue
      const each = endpoint(client, scope, method, path, operation)
      let group = root
      for (const key of each.group) {
        let child = group.groups.get(key)
        if (!child) {
          child = {
            path: [...group.path, key],
            endpoints: [],
            groups: new Map(),
          }
          group.groups.set(key, child)
        }
        group = child
      }
      group.endpoints.push(each)
    }
  }

  const models = new Lines()
  for (const declaration of [...client.declarations, ...operationTypes]) {
    models.line()
    renderDeclaration(models, declaration)
  }

  const api = new Lines()
  api.line()
  api.line("/** The contract's procedures, grouped as its router is. */")
  renderGroup(api, root, true)

  return new Map([
    [
      "ContractModels.kt",
      file(models.toString(), [
        "kotlinx.serialization.ExperimentalSerializationApi",
        "kotlinx.serialization.SerialName",
        "kotlinx.serialization.Serializable",
        "kotlinx.serialization.json.JsonClassDiscriminator",
        "kotlinx.serialization.json.JsonElement",
        "kotlinx.serialization.json.JsonObject",
      ]),
    ],
    [
      "ContractApi.kt",
      file(api.toString(), [
        "kotlinx.coroutines.flow.Flow",
        "kotlinx.serialization.builtins.ListSerializer",
        "kotlinx.serialization.builtins.MapSerializer",
        "kotlinx.serialization.builtins.nullable",
        "kotlinx.serialization.builtins.serializer",
        "kotlinx.serialization.json.JsonElement",
        "kotlinx.serialization.json.JsonObject",
      ]),
    ],
  ])
}

/** The file's header, package, and the imports [body] uses. */
function file(body: string, imports: readonly string[]): string {
  const discriminated = body.includes("@JsonClassDiscriminator")
  const used = imports.filter((name) => {
    const simple = name.split(".").pop() ?? name
    if (simple === "ExperimentalSerializationApi") return discriminated
    if (simple === "serializer") return body.includes(".serializer()")
    if (simple === "nullable") return body.includes(".nullable")
    return new RegExp(`\\b${simple}\\b`).test(body)
  })
  return [
    ...HEADER,
    ...(discriminated
      ? ["@file:OptIn(ExperimentalSerializationApi::class)"]
      : []),
    "",
    "package io.github.zekurio.matinee.api",
    "",
    ...used.map((name) => `import ${name}`),
    body,
  ].join("\n")
}
