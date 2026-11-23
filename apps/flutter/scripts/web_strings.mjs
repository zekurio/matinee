// Generate the shared Flutter strings and the English server-message lookup.
// Run pnpm strings:dart after changing a web catalog.
import { globSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const flutter = resolve(import.meta.dirname, "..")
const locales = join(flutter, "../web/src/i18n/locales")
const l10n = join(flutter, "lib/l10n")
const areas = [
  "access",
  "appearance",
  "ask",
  "branding",
  "catalog",
  "common",
  "discover",
  "filters",
  "jobs",
  "libraries",
  "metadata",
  "network",
  "oidc",
  "requests",
  "server",
  "stats",
  "transcoding",
  "trickplay",
  "users",
  "validation",
]
const forms = ["zero", "one", "two", "few", "many", "other"]
const placeholder = /\{(\w+)\}/g

// Read the object literal after the export. Values are strings or plural({...}).
// Reject unfamiliar syntax so a catalog edit can't silently drop later entries.
function readCatalog(lang, area) {
  const file = join(locales, lang, area + ".ts")
  const source = readFileSync(file, "utf8")
  const header =
    lang === "en"
      ? new RegExp(`^export default defineMessages\\("${area}",\\s*`, "m")
      : /^export default\s+/m
  const start = header.exec(source)
  if (!start) throw new Error(`Missing catalog export in ${file}`)
  let at = start.index + start[0].length
  function take(pattern) {
    const trivia = /(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/y
    trivia.lastIndex = at
    trivia.exec(source)
    at = trivia.lastIndex
    pattern.lastIndex = at
    const match = pattern.exec(source)
    if (match) at = pattern.lastIndex
    return match?.[0]
  }
  function need(pattern) {
    const value = take(pattern)
    if (value === undefined)
      throw new Error(
        `${file}:${source.slice(0, at).split("\n").length}: expected ${pattern}`,
      )
    return value
  }
  const quoted = /"(?:[^"\\]|\\.)*"/y
  const string = () => JSON.parse(need(quoted).replaceAll("\\'", "'"))
  function object(key, value) {
    need(/\{/y)
    const entries = new Map()
    while (!take(/\}/y)) {
      const name = key()
      if (entries.has(name)) throw new Error(`${file}: duplicate ${name}`)
      need(/:/y)
      entries.set(name, value())
      if (!take(/,/y)) {
        need(/\}/y)
        break
      }
    }
    return entries
  }
  const entries = object(string, () => {
    if (!take(/plural\s*\(/y)) return string()
    const plural = object(() => need(/\w+/y), string)
    need(/\)/y)
    if (
      !plural.has("other") ||
      [...plural.keys()].some((key) => !forms.includes(key))
    ) {
      throw new Error(`${file}: invalid plural forms`)
    }
    return plural
  })
  if (lang === "en") need(/\)/y)
  else take(/satisfies\s+TranslationOf<typeof source>/y)
  need(/;?$/y)
  return entries
}

function dartKey(key) {
  return (
    "web" +
    ("." + key).replace(/[^a-zA-Z0-9]([a-zA-Z0-9])/g, (_, c) => c.toUpperCase())
  )
}

function names(text) {
  return Array.from(text.matchAll(placeholder), (m) => m[1])
}

// Flutter draws the score's star with a kit icon. Red Hat Text also lacks
// the navigation arrow, so spell out these settings paths in both languages.
function flutterText(key, text) {
  switch (key) {
    case "filters.card.score":
    case "filters.card.scoreOnly":
      return text.replace(/^★ /, "")
    case "oidc.passkeys.unlinked":
    case "server.adminAuth.passkeysOffLink":
    case "server.adminAuth.passkeysOffSaveFirst":
      return text
        .replaceAll("Settings → Account", "Account in Settings")
        .replaceAll("Einstellungen → Konto", "Konto in den Einstellungen")
    case "oidc.passkeys.allowSignUpHint":
      return text
        .replaceAll("Settings → Users", "Users in Settings")
        .replaceAll("Einstellungen → Benutzer", "Benutzer in den Einstellungen")
    case "users.invites.passkeysOff":
      return text
        .replaceAll("Settings → Authentication", "Authentication in Settings")
        .replaceAll(
          "Einstellungen → Authentifizierung",
          "Authentifizierung in den Einstellungen",
        )
    default:
      return text
  }
}

function dartString(value) {
  const quoted = JSON.stringify(value).replaceAll("$", "\\$")
  return value.includes("'")
    ? quoted
    : "'" + quoted.slice(1, -1).replaceAll('\\"', '"') + "'"
}

const arbs = Object.fromEntries(
  ["en", "de"].map((lang) => [
    lang,
    JSON.parse(readFileSync(join(l10n, `app_${lang}.arb`), "utf8")),
  ]),
)
const table = []
const shared = new Set()

// Copy a message only when the app or the TV app names it. The server
// lookup needs every server and validation message, so those always come.
const named = new Set(
  [
    ...globSync(["lib/**/*.dart", "test/**/*.dart"], {
      cwd: flutter,
      exclude: [
        "lib/l10n/app_localizations*.dart",
        "lib/l10n/server_messages.g.dart",
      ],
    }),
    ...globSync("../tizen/src/**/*.{ts,tsx}", {
      cwd: flutter,
      exclude: ["../tizen/src/**/*.gen.ts"],
    }),
  ].flatMap((file) =>
    Array.from(
      readFileSync(join(flutter, file), "utf8").matchAll(/\bweb[A-Z]\w*/g),
      (m) => m[0],
    ),
  ),
)

for (const area of areas) {
  const english = readCatalog("en", area)
  const german = readCatalog("de", area)
  for (const [key, en] of english) {
    const de = german.get(key) ?? en
    const id = dartKey(key)
    if (!key.startsWith(area + ".") || shared.has(id))
      throw new Error(`Invalid or duplicate key: ${key}`)
    if (area !== "server" && area !== "validation" && !named.has(id)) continue
    shared.add(id)
    const plural = en instanceof Map
    if (plural !== de instanceof Map) throw new Error(`${key}: plural mismatch`)

    // Preserve Flutter's positional API. Count is the first plural argument;
    // other positions follow the first occurrence in English, then German.
    const found = new Set()
    for (const message of [en, de]) {
      for (const text of plural ? message.values() : [message]) {
        for (const name of names(text)) found.add(name)
      }
    }
    // A plural can select a form without printing its count. In that case
    // count is still an ICU argument, but consumes no numbered position.
    const args = plural ? [...new Set(["count", ...found])] : [...found]
    const params = args.map((name, i) =>
      plural && name === "count"
        ? "count"
        : `p${i + (plural && !found.has("count") ? 0 : 1)}`,
    )
    const positions = new Map([...args].map((name, i) => [name, params[i]]))
    const convert = (text) =>
      flutterText(key, text).replace(
        placeholder,
        (_, name) => `{${positions.get(name)}}`,
      )
    for (const [lang, message] of [
      ["en", en],
      ["de", de],
    ]) {
      arbs[lang][id] = plural
        ? "{count, plural, " +
          forms
            .filter((form) => message.has(form))
            .map(
              (form) =>
                `${form === "zero" ? "=0" : form}{${convert(message.get(form))}}`,
            )
            .join(" ") +
          "}"
        : convert(message)
    }
    const attr = "@" + id
    // Existing descriptions identify the original import. New ones name the web key.
    arbs.en[attr] = { description: arbs.en[attr]?.description ?? key }
    if (params.length)
      arbs.en[attr].placeholders = Object.fromEntries(
        params.map((p) => [p, { type: p === "count" ? "int" : "String" }]),
      )

    if (area !== "server" && area !== "validation") continue
    const text = plural ? (en.get("one") ?? en.get("other")) : en
    const captures = names(text)
    const values = [...args].map((name) => {
      if (plural && name === "count") return "count"
      if (!captures.includes(name))
        throw new Error(`${key}: no English capture for ${name}`)
      return `values[${dartString(name)}]!`
    })
    const getter = id + (values.length ? `(${values.join(", ")})` : "")
    table.push(
      `  ServerMessage(${dartString(text)}, [${captures.map(dartString).join(", ")}], (l, values, count) => l.${getter}${plural ? ", plural: true" : ""}),`,
    )
  }
  for (const key of german.keys()) {
    if (!english.has(key))
      throw new Error(`German catalog has no English source for ${key}`)
  }
}

// Flutter owns its screen-reader score label and request diagnostics text.
// Only prune formerly imported messages, and point out callers before removal.
for (const [attr, metadata] of Object.entries(arbs.en)) {
  if (!attr.startsWith("@web") || shared.has(attr.slice(1))) continue
  if (
    !areas.some(
      (area) =>
        metadata.description === `strings_web_${area}.xml` ||
        metadata.description?.startsWith(area + "."),
    )
  )
    continue
  const id = attr.slice(1)
  const uses = globSync(["lib/**/*.dart", "test/**/*.dart"], {
    cwd: flutter,
    exclude: [
      "lib/l10n/app_localizations*.dart",
      "lib/l10n/server_messages.g.dart",
    ],
  }).filter((file) =>
    new RegExp(`\\b${id}\\b`).test(readFileSync(join(flutter, file), "utf8")),
  )
  if (uses.length)
    throw new Error(`Removed web key ${id} is still used by ${uses.join(", ")}`)
  for (const arb of Object.values(arbs)) {
    delete arb[id]
    delete arb[attr]
  }
}

const outputs = {
  "app_en.arb": JSON.stringify(arbs.en, null, 2) + "\n",
  "app_de.arb": JSON.stringify(arbs.de, null, 2) + "\n",
  "server_messages.g.dart": `// Generated by scripts/web_strings.mjs. Don't edit.
// Run pnpm strings:dart after changing the web catalog.
import 'app_localizations.dart';

class ServerMessage {
  const ServerMessage(this.text, this.names, this.localize, {this.plural = false});

  final String text;
  final List<String> names;
  final String Function(AppLocalizations, Map<String, String>, int) localize;
  final bool plural;
}

final serverMessages = <ServerMessage>[
${table.join("\n")}
];
`,
}
for (const [name, source] of Object.entries(outputs)) {
  const file = join(l10n, name)
  if (process.argv.includes("--check")) {
    if (readFileSync(file, "utf8") !== source) {
      process.stderr.write(`${name} is out of date. Run pnpm strings:dart\n`)
      process.exitCode = 1
    }
  } else writeFileSync(file, source)
}
