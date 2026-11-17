import {
  KotlinClient,
  Lines,
  METHODS,
  camel,
  endpoint,
  pascal,
} from "./kotlin-client"
import type {
  Declaration,
  Document,
  Endpoint,
  Scope,
  Typed,
} from "./kotlin-client"

// Share the schema walker and operation ordering with Android, not its source renderer.
// Dates stay ISO strings, just as on Android. int64 is Int64; other numbers are Double.
const quote = JSON.stringify
const keywords = new Set([
  "default",
  "case",
  "repeat",
  "switch",
  "in",
  "is",
  "as",
  "class",
  "struct",
  "enum",
  "protocol",
  "extension",
  "func",
  "let",
  "var",
  "return",
  "throw",
  "throws",
  "try",
  "init",
  "self",
  "true",
  "false",
  "nil",
  "import",
  "where",
  "associatedtype",
  "deinit",
  "subscript",
  "operator",
  "static",
  "public",
  "private",
  "internal",
  "fileprivate",
  "open",
  "break",
  "continue",
  "do",
  "else",
  "for",
  "if",
  "while",
  "catch",
])
const id = (raw: string): string => {
  const name = raw === "self" ? "isSelf" : raw
  return keywords.has(name)
    ? `\`${name}\``
    : /^[0-9]/.test(name)
      ? `_${name}`
      : name
}
function type(t: Typed): string {
  let base: string
  switch (t.type.kind) {
    case "class":
      base = t.type.name
      break
    case "list":
      base = `[${type(t.type.item)}]`
      break
    case "map":
      base = `[String: ${type(t.type.value)}]`
      break
    case "explicit":
      return `Explicit<${type({ ...t.type.value, nullable: false })}>`
    case "Long":
      base = "Int64"
      break
    case "Boolean":
      base = "Bool"
      break
    case "JsonElement":
      base = "JSONValue"
      break
    case "JsonObject":
      base = "[String: JSONValue]"
      break
    default:
      base = t.type.kind
  }
  return base + (t.nullable ? "?" : "")
}
function declaration(l: Lines, d: Declaration): void {
  if (d.kind === "values") {
    l.line(`public enum ${d.name} {`)
    l.indent(() => {
      for (const v of d.values)
        l.line(
          `public static let ${id(String(v).replaceAll(/[^a-zA-Z0-9_]/g, "_"))} = ${quote(v)}`,
        )
      l.line(
        `public static let knownValues = [${d.values.map((value) => quote(value)).join(", ")}]`,
      )
    })
    l.line("}")
    return
  }
  if (d.kind === "union") {
    l.line(`public enum ${d.name}: Codable, Sendable, Hashable {`)
    l.indent(() => {
      for (const v of d.variants) l.line(`case ${id(camel(v.name))}(${v.name})`)
      l.line(
        `private enum CodingKeys: String, CodingKey { case tag = ${quote(d.discriminator)} }`,
      )
      l.line("public init(from decoder: any Decoder) throws {")
      l.indent(() => {
        l.line(
          "let container = try decoder.container(keyedBy: CodingKeys.self)",
        )
        l.line("let tag = try container.decode(String.self, forKey: .tag)")
        l.line("switch tag {")
        for (const v of d.variants)
          l.line(
            `case ${quote(v.variantOf?.tag)}: self = .${id(camel(v.name))}(try ${v.name}(from: decoder))`,
          )
        l.line(
          'default: throw DecodingError.dataCorruptedError(forKey: .tag, in: container, debugDescription: "Unknown union tag: \\(tag)")',
        )
        l.line("}")
      })
      l.line("}")
      l.line("public func encode(to encoder: any Encoder) throws {")
      l.indent(() => {
        l.line("var container = encoder.container(keyedBy: CodingKeys.self)")
        l.line("switch self {")
        for (const v of d.variants) {
          l.line(`case .${id(camel(v.name))}(let value):`)
          l.indent(() => {
            l.line(
              `try container.encode(${quote(v.variantOf?.tag)}, forKey: .tag)`,
            )
            l.line("try value.encode(to: encoder)")
          })
        }
        l.line("}")
      })
      l.line("}")
      for (const v of d.variants) declaration(l, v)
    })
    l.line("}")
    return
  }
  const fieldType = (p: (typeof d.properties)[number]): string =>
    type({ ...p.typed, nullable: p.optional || p.typed.nullable })
  l.line(`public struct ${d.name}: Codable, Sendable, Hashable {`)
  l.indent(() => {
    for (const p of d.properties)
      l.line(`public var ${id(camel(p.json))}: ${fieldType(p)}`)
    l.line(
      `public init(${d.properties.map((p) => `${id(camel(p.json))}: ${fieldType(p)}${p.typed.type.kind === "explicit" ? " = .omitted" : p.optional ? " = nil" : ""}`).join(", ")}) {`,
    )
    l.indent(() => {
      for (const p of d.properties)
        l.line(`self.${id(camel(p.json))} = ${id(camel(p.json))}`)
    })
    l.line("}")
    // Swift writes the keys, the decoder, and the encoder itself, each
    // unless it would differ: a key Swift names otherwise, a field that
    // may be left out, and a null the server wants written, which Swift's
    // own encoder drops.
    const explicit = d.properties.some((p) => p.typed.type.kind === "explicit")
    const renamed = d.properties.some(
      (p) => id(camel(p.json)).replaceAll("`", "") !== p.json,
    )
    const writesNull = d.properties.some((p) => p.typed.nullable && !p.optional)
    if (explicit || renamed) {
      l.line("private enum CodingKeys: String, CodingKey {")
      l.indent(() => {
        for (const p of d.properties)
          l.line(`case ${id(camel(p.json))} = ${quote(p.json)}`)
      })
      l.line("}")
    }
    if (explicit) {
      l.line("public init(from decoder: any Decoder) throws {")
      l.indent(() => {
        l.line("let c = try decoder.container(keyedBy: CodingKeys.self)")
        for (const p of d.properties) {
          const key = `.${id(camel(p.json))}`
          const base = type({ ...p.typed, nullable: false })
          const expr =
            p.typed.type.kind === "explicit"
              ? `!c.contains(${key}) ? .omitted : c.decodeNil(forKey: ${key}) ? .null : .value(c.decode(${type({ ...p.typed.type.value, nullable: false })}.self, forKey: ${key}))`
              : `c.${p.optional || p.typed.nullable ? "decodeIfPresent" : "decode"}(${base}.self, forKey: ${key})`
          l.line(`self.${id(camel(p.json))} = try ${expr}`)
        }
      })
      l.line("}")
    }
    if (explicit || writesNull) {
      l.line("public func encode(to encoder: any Encoder) throws {")
      l.indent(() => {
        l.line("var c = encoder.container(keyedBy: CodingKeys.self)")
        for (const p of d.properties) {
          const n = id(camel(p.json))
          const key = `.${n}`
          if (p.typed.type.kind === "explicit") {
            l.line(`switch ${n} {`)
            l.line("case .omitted: break")
            l.line(`case .null: try c.encodeNil(forKey: ${key})`)
            l.line(
              `case .value(let value): try c.encode(value, forKey: ${key})`,
            )
            l.line("}")
          } else
            l.line(
              `try c.${p.optional ? "encodeIfPresent" : "encode"}(self.${n}, forKey: ${key})`,
            )
        }
      })
      l.line("}")
    }
    for (const n of d.nested) declaration(l, n)
  })
  l.line("}")
}
function renderEndpoint(l: Lines, e: Endpoint): void {
  const args = [
    ...e.arguments.filter((a) => a.place === "path"),
    ...(e.body ? [e.body] : []),
    ...e.arguments.filter((a) => a.place !== "path" && !a.optional),
    ...e.arguments.filter((a) => a.place !== "path" && a.optional),
  ]
  const params = args.map(
    (a) =>
      `${id(a.name)}: ${type({ ...a.typed, nullable: a.optional || a.typed.nullable })}${a.typed.type.kind === "explicit" ? " = .omitted" : a.optional ? " = nil" : ""}`,
  )
  const text = (name: string): string => `wireText(${id(name)})`
  const path = e.path
    .split("/")
    .filter(Boolean)
    .map((s) =>
      s.startsWith("{")
        ? `wireText(${id(e.arguments.find((a) => a.wire === s.slice(1, -1))?.name ?? "")})!`
        : quote(s),
    )
  const query = e.arguments
    .filter((a) => a.place === "query")
    .map((a) => `(${quote(a.wire)}, ${text(a.name)})`)
  let body = "nil"
  if (e.body) body = `try transport.json(${id(e.body.name)})`
  else if (e.input)
    body = `try transport.json(${e.input}(${e.arguments
      .filter((a) => a.place === "body")
      .map((a) => `${id(a.name)}: ${id(a.name)}`)
      .join(", ")}))`
  else if (e.arguments.some((a) => a.place === "file"))
    body = `transport.form(fields: [${e.arguments
      .filter((a) => a.place === "form")
      .map((a) => `(${quote(a.wire)}, ${text(a.name)})`)
      .join(", ")}], files: [${e.arguments
      .filter((a) => a.place === "file")
      .map((a) => `(${quote(a.wire)}, ${id(a.name)})`)
      .join(", ")}])`
  const request = `method: ${quote(e.method.toUpperCase())}, path: [${path.join(", ")}], query: [${query.join(", ")}], body: ${body}`
  const out = e.output === "void" ? "Void" : type(e.output)
  l.line(
    `public func ${id(e.name)}(${params.join(", ")}) async throws${out === "Void" ? "" : ` -> ${e.events ? `AsyncThrowingStream<${out}, any Error>` : out}`} {`,
  )
  l.indent(() =>
    l.line(
      `${out === "Void" ? "" : "return "}${e.events ? "" : "try await "}transport.${e.events ? "events" : out === "Void" ? "send" : "call"}(${request})`,
    ),
  )
  l.line("}")
}
export function swiftClient(document: Document): Map<string, string> {
  const components = new Map(Object.entries(document.components?.schemas ?? {}))
  const client = new KotlinClient(components)
  for (const name of components.keys()) client.component(name)
  const scope: Scope = { declarations: [], prefix: "" }
  const groups = new Map<string, Endpoint[]>()
  groups.set("", [])
  for (const [path, ops] of Object.entries(document.paths ?? {}))
    for (const method of METHODS) {
      const op = ops[method]
      if (!op) continue
      const e = endpoint(client, scope, method, path, op)
      for (let i = 1; i <= e.group.length; i++) {
        const key = e.group.slice(0, i).join(".")
        if (!groups.has(key)) groups.set(key, [])
      }
      groups.get(e.group.join("."))?.push(e)
    }
  const models = new Lines()
  models.line(
    "// Enums stay strings so newer server values decode. Unknown union tags fail, as on Android.",
  )
  for (const d of [...client.declarations, ...scope.declarations]) {
    declaration(models, d)
    models.line()
  }
  const api = new Lines()
  for (const [key, endpoints] of groups) {
    const name = key
      ? key.split(".").map(pascal).join("") + "Api"
      : "ContractApi"
    api.line(`public struct ${name}: Sendable {`)
    api.indent(() => {
      api.line("public let transport: ApiTransport")
      api.line(
        "public init(transport: ApiTransport) { self.transport = transport }",
      )
      for (const child of groups.keys())
        if (child && child.split(".").slice(0, -1).join(".") === key)
          api.line(
            `public var ${id(child.split(".").at(-1) ?? "")}: ${child.split(".").map(pascal).join("")}Api { .init(transport: transport) }`,
          )
      for (const e of endpoints) renderEndpoint(api, e)
    })
    api.line("}")
  }
  const header =
    "// Generated by `pnpm api:ios`. Do not edit.\nimport Foundation\n\n"
  return new Map([
    ["ContractModels.swift", header + models.toString().trimEnd() + "\n"],
    ["ContractApi.swift", header + api.toString()],
  ])
}
