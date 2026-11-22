import { METHODS, SchemaWalker, camel, endpoint, pascal } from "./openapi-walker"
import type {
  Declaration,
  Document,
  Endpoint,
  Scope,
  Typed,
} from "./openapi-walker"

// Dart flattens the walker's nested type names and writes the JSON
// conversions its models need.
type Argument = Endpoint["arguments"][number]
type Model = Extract<Declaration, { kind: "class" }>

const keywords = new Set([
  "assert",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "else",
  "enum",
  "extends",
  "false",
  "final",
  "finally",
  "for",
  "if",
  "in",
  "is",
  "new",
  "null",
  "rethrow",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "var",
  "void",
  "while",
  "with",
])

function identifier(name: string): string {
  if (!/^[A-Za-z]/.test(name)) return `value${pascal(name)}`
  return keywords.has(name) ? `${name}Value` : name
}

function member(name: string): string {
  if (
    [
      "fromJson",
      "toJson",
      "runtimeType",
      "hashCode",
      "noSuchMethod",
      "toString",
    ].includes(name)
  ) {
    return `${name}Value`
  }
  return identifier(name)
}

function quote(value: string): string {
  const escaped = JSON.stringify(value)
    .slice(1, -1)
    .replaceAll('\\"', '"')
    .replaceAll("'", "\\'")
    .replaceAll("$", "\\$")
  return `'${escaped}'`
}

function flatName(name: string): string {
  return name.replaceAll(".", "")
}

function nullable(typed: Typed, value = true): Typed {
  return { ...typed, nullable: value }
}

function typeName(typed: Typed): string {
  const type = typed.type
  let name: string
  switch (type.kind) {
    case "class":
      name = flatName(type.name)
      break
    case "list":
      name = `List<${typeName(type.item)}>`
      break
    case "map":
      name = `Map<String, ${typeName(type.value)}>`
      break
    case "explicit":
      name = `Explicit<${typeName(nullable(type.value, false))}>`
      break
    case "JsonElement":
      return "Object?"
    case "JsonObject":
      name = "JsonMap"
      break
    case "Int":
    case "Long":
      name = "int"
      break
    case "Double":
      name = "double"
      break
    case "Boolean":
      name = "bool"
      break
    case "String":
      name = "String"
      break
  }
  return typed.nullable ? `${name}?` : name
}

function decoder(typed: Typed): string {
  if (typed.type.kind === "class" && !typed.nullable) {
    return `${flatName(typed.type.name)}.fromJson`
  }
  return `(value) => ${decode(typed, "value")}`
}

function decode(typed: Typed, value: string): string {
  const type = typed.type
  switch (type.kind) {
    case "class":
      if (typed.nullable)
        return `readNullable(${value}, ${decoder(nullable(typed, false))})`
      return `${flatName(type.name)}.fromJson(${value})`
    case "list":
    case "map": {
      const read = type.kind === "list" ? "readList" : "readMap"
      const item = type.kind === "list" ? type.item : type.value
      if (typed.nullable) {
        return `readNullable(${value}, (value) => ${read}(value, ${decoder(item)}))`
      }
      return `${read}(${value}, ${decoder(item)})`
    }
    case "explicit":
      throw new Error(
        "An Explicit field must be decoded from its parent object",
      )
    case "JsonElement":
      return value
    case "Double":
      if (typed.nullable) return `(${value} as num?)?.toDouble()`
      return `(${value} as num).toDouble()`
    default:
      return `${value} as ${typeName(typed)}`
  }
}

function encode(typed: Typed, value: string): string {
  const type = typed.type
  const access = typed.nullable ? "?." : "."
  switch (type.kind) {
    case "class":
      return `${value}${access}toJson()`
    case "list": {
      const item = encode(type.item, "item")
      if (item === "item") return value
      return `${value}${access}map((item) => ${item}).toList()`
    }
    case "map": {
      const item = encode(type.value, "item")
      if (item === "item") return value
      return `${value}${access}map((key, item) => MapEntry(key, ${item}))`
    }
    case "explicit":
      return encode(type.value, `${value}${access}value`)
    default:
      return value
  }
}

class DartLines {
  readonly #lines: string[] = []
  #depth = 0

  line(value = ""): void {
    this.#lines.push(value === "" ? "" : `${"  ".repeat(this.#depth)}${value}`)
  }

  indent(body: () => void): void {
    this.#depth++
    body()
    this.#depth--
  }

  fits(line: string): boolean {
    return this.#depth * 2 + line.length <= 80 && !line.includes("\n")
  }

  delimited(opening: string, entries: string[], closing: string): void {
    const flat = `${opening}${entries.join(", ")}${closing}`
    if (this.fits(flat) || entries.length === 0) {
      this.line(flat)
      return
    }
    this.line(opening)
    this.indent(() => entries.forEach((entry) => this.line(`${entry},`)))
    this.line(closing)
  }

  call(head: string, args: string[], tail: string): void {
    this.delimited(`${head}(`, args, `)${tail}`)
  }

  signature(
    head: string,
    positional: string[],
    named: string[],
    tail: string,
  ): void {
    if (named.length === 0) {
      this.call(head, positional, tail)
      return
    }
    const args = [...positional, `{${named.join(", ")}}`]
    const flat = `${head}(${args.join(", ")})${tail}`
    if (this.fits(flat)) {
      this.line(flat)
      return
    }
    if (positional.length === 0) {
      this.line(`${head}({`)
    } else {
      this.line(`${head}(`)
      this.indent(() => {
        for (const parameter of positional.slice(0, -1))
          this.line(`${parameter},`)
        this.line(`${positional.at(-1)}, {`)
      })
    }
    this.indent(() => named.forEach((arg) => this.line(`${arg},`)))
    this.line(`})${tail}`)
  }

  toString(): string {
    return `${this.#lines.join("\n")}\n`
  }
}

function checkNames(where: string, names: string[]): void {
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) throw new Error(`${where}: duplicate Dart name ${name}`)
    seen.add(name)
  }
}

function renderValues(
  lines: DartLines,
  name: string,
  values: Declaration & { kind: "values" },
): void {
  lines.line(`abstract final class ${name} {`)
  lines.indent(() => {
    if (values.values.every((value) => String(value) === value)) {
      const constants = values.values.map((value) => {
        const wire = String(value)
        const key = identifier(camel(wire))
        return { key: key === "all" ? "allValue" : key, wire }
      })
      checkNames(
        name,
        constants.map(({ key }) => key),
      )
      for (const { key, wire } of constants) {
        lines.line(`static const ${key} = ${quote(wire)};`)
      }
      lines.line()
      renderValuesList(
        lines,
        constants.map(({ key }) => key),
        "String",
      )
      return
    }
    if (!values.values.every((value) => Number.isFinite(value))) {
      throw new Error(
        `${name}: Dart constants must be all strings or all numbers`,
      )
    }
    const whole = values.values.every((value) => Number.isInteger(value))
    renderValuesList(lines, values.values.map(String), whole ? "int" : "double")
  })
  lines.line("}")
}

function renderValuesList(
  lines: DartLines,
  items: string[],
  type: string,
): void {
  lines.delimited(`static const all = <${type}>[`, items, "];")
}

function renderUnion(
  lines: DartLines,
  name: string,
  declaration: Extract<Declaration, { kind: "union" }>,
): void {
  lines.line(`sealed class ${name} {`)
  lines.indent(() => {
    lines.line(`const ${name}();`)
    lines.line()
    lines.line(`factory ${name}.fromJson(Object? json) {`)
    lines.indent(() => {
      lines.line("final fields = json as JsonMap;")
      lines.line(
        `return switch (fields[${quote(declaration.discriminator)}]) {`,
      )
      lines.indent(() => {
        for (const variant of declaration.variants) {
          lines.line(
            `${quote(variant.variantOf?.tag ?? "")} => ${name}${variant.name}.fromJson(fields),`,
          )
        }
        lines.call(
          "final tag => throw FormatException",
          [quote(`Unknown ${name} tag`), "tag"],
          ",",
        )
      })
      lines.line("};")
    })
    lines.line("}")
    lines.line()
    lines.line("JsonMap toJson();")
  })
  lines.line("}")
}

function readProperty(property: Model["properties"][number]): string {
  const name = member(camel(property.json))
  const key = quote(property.json)
  const type = property.typed.type
  if (type.kind === "explicit") {
    const read = decoder(nullable(type.value, false))
    return `${name}: readExplicit(fields, ${key}, ${read})`
  }
  const typed = property.optional ? nullable(property.typed) : property.typed
  return `${name}: ${decode(typed, `fields[${key}]`)}`
}

function renderRead(
  lines: DartLines,
  property: Model["properties"][number],
): void {
  const entry = readProperty(property)
  if (lines.fits(`${entry},`)) {
    lines.line(`${entry},`)
    return
  }
  const key = quote(property.json)
  const name = member(camel(property.json))
  const typed = property.optional ? nullable(property.typed) : property.typed
  const value = `fields[${key}]`
  const type = typed.type
  if (type.kind === "explicit") {
    lines.call(
      `${name}: readExplicit`,
      ["fields", key, decoder(nullable(type.value, false))],
      ",",
    )
  } else if (typed.nullable && ["class", "list", "map"].includes(type.kind)) {
    lines.call(
      `${name}: readNullable`,
      [value, decoder(nullable(typed, false))],
      ",",
    )
  } else if (type.kind === "map") {
    lines.call(`${name}: readMap`, [value, decoder(type.value)], ",")
  } else if (type.kind === "list") {
    lines.call(`${name}: readList`, [value, decoder(type.item)], ",")
  } else if (type.kind === "class") {
    lines.call(`${name}: ${flatName(type.name)}.fromJson`, [value], ",")
  } else {
    lines.line(`${name}:`)
    lines.indent(() =>
      lines.indent(() => lines.line(`${decode(typed, value)},`)),
    )
  }
}

function renderModel(
  lines: DartLines,
  name: string,
  model: Model,
  discriminator: string | undefined,
): void {
  const parent = model.variantOf
  const properties = model.properties
  checkNames(
    name,
    properties.map((property) => member(camel(property.json))),
  )

  lines.line(
    parent
      ? `final class ${name} extends ${flatName(parent.union)} {`
      : `final class ${name} {`,
  )
  lines.indent(() => {
    const parameters = properties.map(
      (property) =>
        `${property.optional ? "" : "required "}this.${member(camel(property.json))}`,
    )
    lines.signature(`const ${name}`, [], parameters, ";")
    lines.line()
    if (properties.length === 0) {
      const factory = `factory ${name}.fromJson(Object? json) =>`
      const create = `const ${name}();`
      if (lines.fits(`${factory} ${create}`)) lines.line(`${factory} ${create}`)
      else {
        lines.line(factory)
        lines.indent(() => lines.indent(() => lines.line(create)))
      }
    } else {
      lines.line(`factory ${name}.fromJson(Object? json) {`)
      lines.indent(() => {
        lines.line("final fields = json as JsonMap;")
        const result = `return ${name}(${properties.map(readProperty).join(", ")});`
        if (properties.length === 1 && lines.fits(result)) {
          lines.line(result)
        } else {
          lines.line(`return ${name}(`)
          lines.indent(() =>
            properties.forEach((property) => renderRead(lines, property)),
          )
          lines.line(");")
        }
      })
      lines.line("}")
      lines.line()
      for (const property of properties) {
        const type = typeName(
          property.optional ? nullable(property.typed) : property.typed,
        )
        lines.line(`final ${type} ${member(camel(property.json))};`)
      }
    }

    lines.line()
    if (parent) lines.line("@override")
    const entries = properties.map(({ json, typed, optional }) => {
      const name = member(camel(json))
      const key = quote(json)
      if (!optional) return `${key}: ${encode(typed, name)}`
      if (typed.type.kind === "explicit") {
        return `if (${name} case final field?) ${key}: ${encode(nullable(typed, false), "field")}`
      }
      return `${key}: ?${encode(nullable(typed), name)}`
    })
    if (parent && discriminator !== undefined) {
      entries.unshift(`${quote(discriminator)}: ${quote(parent.tag)}`)
    }
    lines.delimited("JsonMap toJson() => {", entries, "};")
  })
  lines.line("}")
}

function renderDeclarations(
  lines: DartLines,
  declarations: readonly Declaration[],
  names: Set<string>,
  prefix = "",
  discriminator?: string,
): void {
  for (const declaration of declarations) {
    const name = prefix + declaration.name
    if (names.has(name)) throw new Error(`Duplicate Dart model name ${name}`)
    names.add(name)
    lines.line()
    switch (declaration.kind) {
      case "values":
        renderValues(lines, name, declaration)
        break
      case "union":
        renderUnion(lines, name, declaration)
        renderDeclarations(
          lines,
          declaration.variants,
          names,
          name,
          declaration.discriminator,
        )
        break
      case "class":
        renderModel(lines, name, declaration, discriminator)
        renderDeclarations(lines, declaration.nested, names, name)
    }
  }
}

function parameter(argument: Argument): string {
  const type = typeName(
    argument.optional ? nullable(argument.typed) : argument.typed,
  )
  return `${type} ${member(argument.name)}`
}

function wireText(argument: Argument): string {
  const name = member(argument.name)
  switch (argument.typed.type.kind) {
    case "String":
      return name
    case "Int":
    case "Long":
    case "Double":
    case "Boolean":
      return argument.optional || argument.typed.nullable
        ? `${name}?.toString()`
        : `${name}.toString()`
    default:
      throw new Error(
        `${argument.wire}: cannot send ${typeName(argument.typed)} as text`,
      )
  }
}

function wireEntry(argument: Argument, value: string): string {
  const omit = argument.optional || argument.typed.nullable
  return `${quote(argument.wire)}: ${omit ? "?" : ""}${value}`
}

function requestPath(operation: Endpoint, pathArguments: Argument[]): string[] {
  return operation.path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const placeholder = /^\{(.+)\}$/.exec(segment)?.[1]
      if (placeholder === undefined) return quote(segment)
      const argument = pathArguments.find(({ wire }) => wire === placeholder)
      if (!argument || argument.optional || argument.typed.nullable) {
        throw new Error(
          `${operation.path}: invalid path parameter ${placeholder}`,
        )
      }
      return wireText(argument)
    })
}

function renderBody(lines: DartLines, operation: Endpoint): void {
  if (operation.body) {
    lines.call(
      "final body = JsonBody",
      [encode(operation.body.typed, member(operation.body.name))],
      ";",
    )
    return
  }
  if (operation.input) {
    const fields = operation.arguments.filter((each) => each.place === "body")
    const args = fields.map(({ name }) => `${member(name)}: ${member(name)}`)
    lines.call(`final input = ${flatName(operation.input)}`, args, ";")
    lines.line("final body = JsonBody(input.toJson());")
    return
  }
  const files = operation.arguments.filter(
    (argument) => argument.place === "file",
  )
  if (files.length === 0) return
  const fields = operation.arguments.filter(
    (argument) => argument.place === "form",
  )
  const fileEntries = files.map((argument) =>
    wireEntry(argument, member(argument.name)),
  )
  const fieldEntries = fields.map((argument) =>
    wireEntry(argument, wireText(argument)),
  )
  if (fieldEntries.length === 0) {
    const flat = `final body = MultipartBody(files: {${fileEntries.join(", ")}});`
    if (lines.fits(flat)) {
      lines.line(flat)
      return
    }
  }
  lines.line("final body = MultipartBody(")
  lines.indent(() => {
    renderMap(lines, "fields", fieldEntries)
    renderMap(lines, "files", fileEntries)
  })
  lines.line(");")
}

function renderMap(lines: DartLines, name: string, entries: string[]): void {
  if (entries.length === 0) return
  lines.delimited(`${name}: {`, entries, "},")
}

function renderEndpoint(lines: DartLines, operation: Endpoint): void {
  const pathArguments = operation.arguments.filter(
    (argument) => argument.place === "path",
  )
  const positional = operation.body
    ? [...pathArguments, operation.body]
    : pathArguments
  const named = operation.arguments.filter(
    (argument) => argument.place !== "path",
  )
  checkNames(
    operation.path,
    [...positional, ...named].map(({ name }) => member(name)),
  )

  for (const doc of operation.doc) {
    for (const line of doc.split("\n")) lines.line(line ? `/// ${line}` : "///")
  }
  const output = operation.output
  if (operation.events && output === "void")
    throw new Error(`${operation.path}: events without data`)
  const result = output === "void" ? "void" : typeName(output)
  const kind = operation.events ? "Stream" : "Future"
  lines.signature(
    `${kind}<${result}> ${member(operation.name)}`,
    positional.map(parameter),
    named.map(
      (argument) =>
        `${argument.optional ? "" : "required "}${parameter(argument)}`,
    ),
    " {",
  )
  lines.indent(() => {
    renderBody(lines, operation)
    const method = operation.events
      ? "events"
      : output === "void"
        ? "send"
        : "call"
    const verb = quote(operation.method.toUpperCase())
    const path = requestPath(operation, pathArguments)
    const args = output === "void" ? [] : [decoder(output)]
    const query = named.filter((argument) => argument.place === "query")
    const body =
      operation.body ||
      operation.input ||
      named.some((argument) => argument.place === "file")
    if (body) args.push("body: body")

    const head = `return _transport.${method}`
    if (query.length === 0 && (!body || output === "void")) {
      const closing = args.length === 0 ? "]);" : `], ${args.join(", ")});`
      if (lines.fits(closing)) {
        lines.delimited(`${head}(${verb}, [`, path, closing)
        return
      }
    }
    args.unshift(verb, `[${path.join(", ")}]`)
    if (query.length === 0) {
      lines.call(head, args, ";")
      return
    }
    lines.line(`${head}(`)
    lines.indent(() => {
      args.forEach((arg) => lines.line(`${arg},`))
      renderMap(
        lines,
        "query",
        query.map((argument) => wireEntry(argument, wireText(argument))),
      )
    })
    lines.line(");")
  })
  lines.line("}")
}

type Group = {
  name: string
  operations: Endpoint[]
  children: Map<string, Group>
}

function addEndpoint(root: Group, operation: Endpoint): void {
  let group = root
  for (const segment of operation.group) {
    let next = group.children.get(segment)
    if (!next) {
      const prefix = group === root ? "" : group.name
      next = {
        name: prefix + pascal(segment),
        operations: [],
        children: new Map(),
      }
      group.children.set(segment, next)
    }
    group = next
  }
  group.operations.push(operation)
}

function renderGroup(
  lines: DartLines,
  group: Group,
  names: Set<string>,
  root = false,
): void {
  const name = `${group.name}Api`
  if (names.has(name)) throw new Error(`Duplicate Dart API class name ${name}`)
  names.add(name)
  const children = [...group.children].map(([key, child]) => ({
    field: member(camel(key)),
    type: `${child.name}Api`,
  }))
  checkNames(name, [
    ...children.map(({ field }) => field),
    ...group.operations.map(({ name }) => member(name)),
  ])

  const keepsTransport = group.operations.length > 0
  lines.line(`${root ? "" : "final "}class ${name} {`)
  lines.indent(() => {
    const transport =
      keepsTransport && children.length === 0 && !root
        ? "this._transport"
        : "ApiTransport transport"
    const constructor = `${name}${root ? "" : "._"}(${transport})`
    const initializers = children.map(
      ({ field, type }) => `${field} = ${type}._(transport)`,
    )
    if (keepsTransport && transport !== "this._transport")
      initializers.unshift("_transport = transport")
    if (initializers.length === 0) lines.line(`${constructor};`)
    else {
      lines.line(constructor)
      lines.indent(() => {
        initializers.forEach((initializer, index) => {
          const prefix = index === 0 ? ": " : "  "
          const suffix = index === initializers.length - 1 ? ";" : ","
          lines.line(`${prefix}${initializer}${suffix}`)
        })
      })
    }
    if (keepsTransport || children.length > 0) lines.line()
    if (keepsTransport) lines.line("final ApiTransport _transport;")
    for (const { type, field } of children)
      lines.line(`final ${type} ${field};`)
    for (const operation of group.operations) {
      lines.line()
      renderEndpoint(lines, operation)
    }
  })
  lines.line("}")
  for (const child of group.children.values()) {
    lines.line()
    renderGroup(lines, child, names)
  }
}

const header = [
  "// Generated by `pnpm api:dart` from the server's OpenAPI document.",
  "// Change packages/contracts and generate it again.",
  "",
]

export function dartClient(document: Document): Map<string, string> {
  const components = new Map(Object.entries(document.components?.schemas ?? {}))
  const client = new SchemaWalker(components)
  for (const name of components.keys()) client.component(name)

  const root: Group = { name: "Contract", operations: [], children: new Map() }
  const scope: Scope = { declarations: [], prefix: "" }
  for (const [path, operations] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = operations[method]
      if (operation)
        addEndpoint(root, endpoint(client, scope, method, path, operation))
    }
  }

  const modelNames = new Set([
    "ApiTransport",
    "Explicit",
    "FilePart",
    "JsonBody",
    "JsonMap",
    "MultipartBody",
  ])
  const models = new DartLines()
  renderDeclarations(
    models,
    [...client.declarations, ...scope.declarations],
    modelNames,
  )

  const api = new DartLines()
  api.line()
  api.line("/// The contract's procedures, grouped as its router is.")
  renderGroup(api, root, modelNames, true)

  return new Map([
    ["contract_models.dart", dartFile(models, ["explicit.dart", "json.dart"])],
    [
      "contract_api.dart",
      dartFile(api, [
        "contract_models.dart",
        "explicit.dart",
        "json.dart",
        "transport.dart",
      ]),
    ],
  ])
}

const importSymbols = new Map([
  ["explicit.dart", /\bExplicit\b/],
  ["json.dart", /\b(?:JsonMap|readList|readMap|readNullable|readExplicit)\b/],
])

function dartFile(lines: DartLines, imports: string[]): string {
  const body = lines.toString()
  const used = imports.filter(
    (file) => importSymbols.get(file)?.test(body) ?? true,
  )
  return [
    ...header,
    ...used.map((file) => `import ${quote(file)};`),
    body,
  ].join("\n")
}
