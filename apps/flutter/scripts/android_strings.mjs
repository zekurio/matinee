import { readdirSync, readFileSync, writeFileSync } from "node:fs"

const resources = new URL("../../android/app/src/main/res/", import.meta.url)
const output = new URL("../lib/l10n/", import.meta.url)
// Flutter owns its other strings after the initial Android import.
const check = process.argv.includes("--check")
const allowBraces = process.argv.includes("--allow-braces")

const entities = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' }
const escapes = {
  "'": "'",
  '"': '"',
  n: "\n",
  t: "\t",
  "@": "@",
  "?": "?",
  "\\": "\\",
}
const formatTypes = { s: "String", d: "int", f: "double" }
const quantities = new Map([
  ["zero", "=0"],
  ["one", "one"],
  ["two", "two"],
  ["few", "few"],
  ["many", "many"],
  ["other", "other"],
])

function decodeXml(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name) => {
    if (name.startsWith("#x"))
      return String.fromCodePoint(parseInt(name.slice(2), 16))
    if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)))
    if (Object.hasOwn(entities, name)) return entities[name]
    throw new Error(`Unknown XML entity ${entity}`)
  })
}

function readXml(xml) {
  const root = { children: [] }
  const stack = [root]
  const tokens =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[\w:.-]+(?:[^<>"']|"[^"]*"|'[^']*')*>|[^<]+|</g
  for (const [token] of xml.matchAll(tokens)) {
    const parent = stack.at(-1)
    if (token.startsWith("<!--")) {
      parent.children.push({ comment: token.slice(4, -3).trim() })
    } else if (token.startsWith("<![CDATA[")) {
      parent.children.push({ text: token.slice(9, -3) })
    } else if (token.startsWith("<?")) {
      continue
    } else if (token.startsWith("</")) {
      if (stack.length === 1 || token.slice(2, -1).trim() !== parent.tag) {
        throw new Error(`Unexpected closing tag ${token}`)
      }
      stack.pop()
    } else if (token.startsWith("<")) {
      const [, tag, attributes] = token.match(/^<([\w:.-]+)([\s\S]*)>$/) ?? []
      if (!tag) throw new Error(`Invalid XML near ${token}`)
      const attrs = Object.fromEntries(
        Array.from(
          attributes.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g),
          ([, name, doubleQuoted, singleQuoted]) => [
            name,
            decodeXml(doubleQuoted ?? singleQuoted),
          ],
        ),
      )
      const element = { tag, attrs, children: [] }
      parent.children.push(element)
      if (!token.endsWith("/>")) stack.push(element)
    } else {
      parent.children.push({ text: decodeXml(token) })
    }
  }
  const resources = root.children.filter((child) => child.tag)
  if (
    stack.length !== 1 ||
    resources.length !== 1 ||
    resources[0].tag !== "resources"
  ) {
    throw new Error("Expected a single resources element")
  }
  return resources[0].children
}

function androidText(element) {
  function flatten({ children }) {
    return children
      .map((child) => {
        if (Object.hasOwn(child, "text")) return child.text
        if (Object.hasOwn(child, "comment")) return ""
        if (child.tag === "xliff:g") return flatten(child)
        throw new Error(`Unsupported markup <${child.tag}>`)
      })
      .join("")
  }

  const text = flatten(element).trim()
  const unwrapped = /^(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')$/.test(
    text,
  )
    ? text.slice(1, -1)
    : text
  return unwrapped.replace(/\\(u[\da-fA-F]{4}|['"nt@?\\])/g, (_, escaped) =>
    escaped.startsWith("u")
      ? String.fromCharCode(parseInt(escaped.slice(1), 16))
      : escapes[escaped],
  )
}

function convertFormat(text, placeholders, plural, formatted) {
  let nextArgument = 1
  // Explicit Java Formatter indexes do not advance the implicit argument index.
  return text.replace(
    /%%|%(?:(\d+)\$)?[-#+ 0,(]*\d*(?:\.\d+)?([sdf])|%(?=[\w.$+-])/g,
    (format, position, conversion) => {
      if (format === "%%") return "%"
      if (!formatted) return format
      if (!conversion)
        throw new Error(`Unsupported percent format in ${JSON.stringify(text)}`)
      const index = position ? Number(position) : nextArgument++
      if (index < 1) throw new Error(`Invalid argument index in ${format}`)
      const type = formatTypes[conversion]
      const name =
        plural && index === 1 && type === "int" ? "count" : `p${index}`
      if (placeholders.has(name) && placeholders.get(name).type !== type) {
        throw new Error(`Conflicting types for ${name}`)
      }
      placeholders.set(name, { type })
      return `{${name}}`
    },
  )
}

function readCatalog(directory) {
  const entries = []
  const folder = new URL(`${directory}/`, resources)
  for (const file of readdirSync(folder)
    .filter((name) => /^strings.*\.xml$/.test(name))
    .filter(
      (name) => !check || /^strings_web_(server|validation)\.xml$/.test(name),
    )
    .sort()) {
    let comment
    for (const node of readXml(readFileSync(new URL(file, folder), "utf8"))) {
      if (Object.hasOwn(node, "text") && !node.text.trim()) continue
      if (Object.hasOwn(node, "comment")) {
        comment = node.comment
        continue
      }
      if (node.tag === "string" || node.tag === "plurals") {
        const name = node.attrs.name
        if (!name)
          throw new Error(`${directory}/${file}: resource without a name`)
        entries.push({
          node,
          name,
          key: name.replace(/_([a-zA-Z0-9])/g, (_, letter) =>
            letter.toUpperCase(),
          ),
          description: comment ? `${file}: ${comment}` : file,
          source: `${directory}/${file} (${name})`,
        })
      }
      comment = undefined
    }
  }
  return entries
}

function validateKeys(entries) {
  const byKey = new Map()
  for (const entry of entries) {
    const sources = byKey.get(entry.key) ?? []
    sources.push(entry.source)
    byKey.set(entry.key, sources)
  }
  const invalid = []
  for (const [key, sources] of byKey) {
    // gen_l10n requires a public identifier starting with a lowercase letter.
    if (
      sources.length > 1 ||
      !/^[a-z][a-zA-Z0-9_]*$/.test(key) ||
      dartKeywords.has(key)
    ) {
      invalid.push(`${key}: ${sources.join(", ")}`)
    }
  }
  return invalid
}

const dartKeywords = new Set(
  "assert break case catch class const continue default do else enum extends false final finally for if in is new null rethrow return super switch this throw true try var void while with".split(
    " ",
  ),
)

function convertEntry(entry, braces) {
  const { node, source } = entry
  const plural = node.tag === "plurals"
  const parts = plural
    ? node.children
        .filter((child) => child.tag === "item")
        .map((item) => [quantities.get(item.attrs.quantity), androidText(item)])
    : [[null, androidText(node)]]
  const literals = parts.filter(([, text]) => /[{}]/.test(text))
  if (literals.length > 0) {
    braces.push(
      `${source}: ${literals.map(([, text]) => JSON.stringify(text)).join(", ")}`,
    )
    return null
  }
  const placeholders = new Map()
  if (plural) placeholders.set("count", { type: "int" })
  const messages = new Map(
    parts.map(([quantity, text]) => [
      quantity,
      convertFormat(
        text,
        placeholders,
        plural,
        node.attrs.formatted !== "false",
      ),
    ]),
  )
  if (
    plural &&
    (messages.has(undefined) ||
      !messages.has("other") ||
      messages.size !== parts.length)
  ) {
    throw new Error("Expected unique plural quantities including other")
  }
  const message = plural
    ? `{count, plural, ${Array.from(quantities.values())
        .filter((quantity) => messages.has(quantity))
        .map((quantity) => `${quantity}{${messages.get(quantity)}}`)
        .join(" ")}}`
    : messages.get(null)
  return { message, placeholders }
}

function convertCatalog(entries, braces, errors) {
  const catalog = new Map()
  for (const entry of entries) {
    try {
      const converted = convertEntry(entry, braces)
      if (converted) catalog.set(entry.key, { ...entry, ...converted })
    } catch (error) {
      errors.push(`${entry.source}: ${error.message}`)
    }
  }
  return catalog
}

function writeArb(locale, messages) {
  const arb = { "@@locale": locale }
  const keys = Array.from(messages.keys()).sort((left, right) =>
    left < right ? -1 : Number(left > right),
  )
  for (const key of keys) {
    const { message, metadata } = messages.get(key)
    // The bundled Red Hat Text lacks the navigation arrow in these paths.
    arb[key] = message
      .replaceAll("Settings → Account", "Account in Settings")
      .replaceAll("Einstellungen → Konto", "Konto in den Einstellungen")
    if (metadata) arb[`@${key}`] = metadata
  }
  const file = new URL(`app_${locale}.arb`, output)
  if (check) {
    const current = JSON.parse(readFileSync(file, "utf8"))
    for (const [key, value] of Object.entries(arb)) {
      if (key === "appName" || key === "@appName") continue
      if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
        throw new Error(
          `app_${locale}.arb: update ${key} from the Android resource`,
        )
      }
    }
    return
  }
  writeFileSync(file, `${JSON.stringify(arb, null, 2)}\n`)
}

function main() {
  const english = readCatalog("values")
  const german = readCatalog("values-de")
  const invalidKeys = [...validateKeys(english), ...validateKeys(german)]
  if (invalidKeys.length > 0) {
    throw new Error(
      `Duplicate or invalid Dart keys:\n${invalidKeys.join("\n")}`,
    )
  }

  const braces = []
  const errors = []
  const en = convertCatalog(english, braces, errors)
  const de = convertCatalog(german, braces, errors)
  const englishNames = new Set(english.map(({ name }) => name))
  for (const entry of de.values()) {
    const original = en.get(entry.key)
    if (!original || original.name !== entry.name) {
      de.delete(entry.key)
      if (!englishNames.has(entry.name)) {
        errors.push(`${entry.source}: no matching English resource`)
      }
      continue
    }
    if (original.node.attrs.translatable === "false") {
      de.delete(entry.key)
      continue
    }
    for (const [name, { type }] of entry.placeholders) {
      if (original.placeholders.get(name)?.type !== type) {
        errors.push(
          `${entry.source}: ${name} (${type}) does not match the English declaration`,
        )
      }
    }
  }

  if (braces.length > 0) {
    process.stderr.write(
      `Literal braces (${allowBraces ? "skipped" : "use --allow-braces to skip"}):\n${braces.join("\n")}\n`,
    )
    if (!allowBraces)
      errors.push(
        "Literal braces cannot be used with Flutter's current l10n.yaml",
      )
  }
  if (errors.length > 0) throw new Error(errors.join("\n"))

  const enMessages = new Map()
  let plurals = 0
  let englishOnly = 0
  for (const [key, entry] of en) {
    if (entry.node.tag === "plurals") plurals++
    if (!de.has(key)) englishOnly++
    const metadata = { description: entry.description }
    if (entry.placeholders.size > 0) {
      const argumentIndex = (name) =>
        name === "count" ? 0 : Number(name.slice(1))
      const names = Array.from(entry.placeholders.keys()).sort(
        (left, right) => argumentIndex(left) - argumentIndex(right),
      )
      metadata.placeholders = Object.fromEntries(
        names.map((name) => [name, entry.placeholders.get(name)]),
      )
    }
    enMessages.set(key, { message: entry.message, metadata })
  }

  // Keep Flutter's existing app name in both locales. Android has the same name
  // as a nontranslatable resource and supplies the English source description.
  const appName = { message: "Matinee" }
  const nameDescription = enMessages.get("appName")?.metadata.description
  enMessages.set("appName", {
    ...appName,
    metadata: {
      description: [nameDescription, "The app's name, never translated."]
        .filter(Boolean)
        .join(". "),
    },
  })
  de.set("appName", appName)

  writeArb("en", enMessages)
  writeArb("de", de)
  process.stdout.write(
    `Android resources: ${en.size - plurals} English strings, ${plurals} English plurals, ${englishOnly} English-only entries. German ARB: ${de.size} messages including appName.\n`,
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
