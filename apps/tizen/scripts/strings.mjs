#!/usr/bin/env node
/*
 * Takes the words the TV app shares with the Android app from Android's
 * string resources, so the two read alike and a translation is made once,
 * as the Apple apps take theirs (apps/ios/scripts/strings.py).
 *
 * It looks through src/ for the keys the app names and writes those, in
 * every language Android has them in, to src/i18n/android.gen.ts. Keys that start with
 * `tizen_` are the app's own and live in src/i18n/own.ts.
 *
 *     pnpm --filter @matinee/tizen strings           writes the file
 *     pnpm --filter @matinee/tizen strings --check   fails if it's stale
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const app = dirname(dirname(fileURLToPath(import.meta.url)))
const res = join(app, "../android/app/src/main/res")
const output = join(app, "src/i18n/android.gen.ts")

/** The app's languages: English in values/, the rest in values-<tag>/. */
const LANGUAGES = new Map([
  ["en", "values"],
  ["de", "values-de"],
])

function fail(message) {
  process.stderr.write(`strings.mjs: ${message}\n`)
  process.exit(1)
}

const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["apos", "'"],
  ["quot", '"'],
])

/** A resource's text as Android shows it: tags, entities, quotes, and escapes resolved. */
function androidText(raw) {
  const plain = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, name) => {
      if (name.startsWith("#x"))
        return String.fromCodePoint(parseInt(name.slice(2), 16))
      if (name.startsWith("#"))
        return String.fromCodePoint(parseInt(name.slice(1), 10))
      return ENTITIES.get(name) ?? whole
    })
  let out = ""
  let quoted = false
  let space = false
  for (let i = 0; i < plain.length; i += 1) {
    const char = plain[i]
    if (char === "\\") {
      i += 1
      const next = plain[i]
      if (next === "n") out += "\n"
      else if (next === "t") out += "\t"
      else if (next === "u") {
        out += String.fromCodePoint(parseInt(plain.slice(i + 1, i + 5), 16))
        i += 4
      } else out += next ?? ""
      space = false
    } else if (char === '"') {
      quoted = !quoted
    } else if (!quoted && /\s/.test(char)) {
      // Outside quotes, runs of whitespace are one space.
      if (!space) out += " "
      space = true
    } else {
      out += char
      space = false
    }
  }
  return out.trim()
}

/** Android's format arguments as the app's: `%1$s` and `%d` to `{0}`. */
function placeholders(text) {
  let next = 0
  return text.replace(
    /%(?:(\d+)\$)?[-#+ 0,(]*\d*(?:\.\d+)?([sdfx%])/g,
    (_, position, kind) => {
      if (kind === "%") return "%"
      const index = position ? Number(position) - 1 : next
      next += 1
      return `{${index}}`
    },
  )
}

/** Every string and plural in a language's folder, by key. */
function readLanguage(folder) {
  const strings = new Map()
  const plurals = new Map()
  const directory = join(res, folder)
  for (const file of readdirSync(directory).toSorted()) {
    if (!/^strings.*\.xml$/.test(file)) continue
    const xml = readFileSync(join(directory, file), "utf8").replace(
      /<!--[\s\S]*?-->/g,
      "",
    )
    for (const [, key, body] of xml.matchAll(
      /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g,
    )) {
      strings.set(key, placeholders(androidText(body)))
    }
    for (const [, key, body] of xml.matchAll(
      /<plurals\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/plurals>/g,
    )) {
      const forms = {}
      for (const [, quantity, text] of body.matchAll(
        /<item\s+quantity="([^"]+)"[^>]*>([\s\S]*?)<\/item>/g,
      )) {
        forms[quantity] = placeholders(androidText(text))
      }
      plurals.set(key, forms)
    }
  }
  return { strings, plurals }
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".gen.ts")
      ? [path]
      : []
  })
}

/**
 * The keys the app asks for, apart from its own: every text in its source
 * that names an Android string, since a key isn't always passed where
 * it's written, as in `tr(resume ? "title_resume" : "title_play")`. The
 * keys `tr("…")` and `plural("…")` are called with directly must exist.
 */
function usedKeys() {
  const named = new Set()
  const called = { strings: new Set(), plurals: new Set() }
  for (const file of sourceFiles(join(app, "src"))) {
    const source = readFileSync(file, "utf8")
    for (const [, name] of source.matchAll(
      /"([a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+)"/g,
    )) {
      if (!name.startsWith("tizen_")) named.add(name)
    }
    for (const [, call, name] of source.matchAll(
      /\b(tr|key|plural)\(\s*"([A-Za-z0-9_]+)"/g,
    )) {
      if (name.startsWith("tizen_")) continue
      called[call === "plural" ? "plurals" : "strings"].add(name)
    }
  }
  return { named, called }
}

const { named, called } = usedKeys()
const languages = new Map(
  [...LANGUAGES].map(([tag, folder]) => [tag, readLanguage(folder)]),
)
const english = languages.get("en")

const missing = [
  ...[...called.strings].filter((key) => !english.strings.has(key)),
  ...[...called.plurals].filter((key) => !english.plurals.has(key)),
]
if (missing.length) {
  fail(
    `Android has no string for ${missing.join(", ")}. Add it there, or name the key tizen_… and add it to src/i18n/own.ts.`,
  )
}
/** By code unit, so the file reads the same on every machine. */
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const used = {
  strings: [...named]
    .filter((key) => english.strings.has(key))
    .toSorted(byName),
  plurals: [...named]
    .filter((key) => english.plurals.has(key))
    .toSorted(byName),
}

function table(name, keys, pick) {
  const lines = [`export const ${name} = {`]
  for (const [tag, language] of languages) {
    lines.push(`  ${tag}: {`)
    for (const key of keys) {
      // A key without a translation reads in English.
      const value = pick(language, key) ?? pick(english, key)
      lines.push(`    ${key}: ${JSON.stringify(value)},`)
    }
    lines.push("  },")
  }
  lines.push("} as const")
  return lines.join("\n")
}

const generated = `// Generated by scripts/strings.mjs from the Android app's strings. Don't edit:
// change the string in apps/android, or the key the app asks for, and run
// \`pnpm --filter @matinee/tizen strings\`.

${table("ANDROID_STRINGS", used.strings, (language, key) => language.strings.get(key))}

${table("ANDROID_PLURALS", used.plurals, (language, key) => language.plurals.get(key))}
`

if (process.argv.includes("--check")) {
  let current = ""
  try {
    current = readFileSync(output, "utf8")
  } catch {
    // Not written yet reads as stale.
  }
  if (current !== generated) {
    fail(
      "src/i18n/android.gen.ts is stale. Run `pnpm --filter @matinee/tizen strings`.",
    )
  }
} else {
  writeFileSync(output, generated)
  process.stdout.write(
    `${used.strings.length} strings, ${used.plurals.length} plurals\n`,
  )
}
