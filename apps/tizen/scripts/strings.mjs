#!/usr/bin/env node
/*
 * Takes the words the TV app shares with the Flutter app from its ARB
 * files, so the two read alike and a translation is made once.
 *
 * It looks through src/ for the ARB keys the app names and writes those,
 * in every language the ARB files have them in, to src/i18n/shared.gen.ts.
 * Keys that start with `tizen_` are the app's own and live in
 * src/i18n/own.ts.
 *
 *     pnpm --filter @matinee/tizen strings           writes the file
 *     pnpm --filter @matinee/tizen strings --check   fails if it's stale
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const app = dirname(dirname(fileURLToPath(import.meta.url)))
const l10n = join(app, "../flutter/lib/l10n")
const output = join(app, "src/i18n/shared.gen.ts")

/** The app's languages, English first. */
const LANGUAGES = ["en", "de"]

function fail(message) {
  process.stderr.write(`strings.mjs: ${message}\n`)
  process.exit(1)
}

/** The parts of an ICU plural, `{count, plural, one{…} other{…}}`, by form. */
function pluralForms(key, message) {
  const head = /^\{\s*(\w+)\s*,\s*plural\s*,/.exec(message)
  if (!head || !message.endsWith("}")) return null
  const forms = {}
  let i = head[0].length
  const end = message.length - 1
  while (i < end) {
    const selector = /^\s*(=?\w+)\s*\{/.exec(message.slice(i, end))
    if (!selector) {
      if (message.slice(i, end).trim() === "") break
      fail(`${key}: can't read the plural ${JSON.stringify(message)}`)
    }
    i += selector[0].length
    let depth = 1
    const start = i
    while (depth > 0) {
      if (i >= end) fail(`${key}: an unclosed plural form`)
      if (message[i] === "{") depth += 1
      else if (message[i] === "}") depth -= 1
      i += 1
    }
    forms[selector[1]] = message.slice(start, i - 1)
  }
  return { count: head[1], forms }
}

/**
 * The ARB's named placeholders as the app's numbered ones, `{p1}` to
 * `{0}`, in the order the message's metadata declares them.
 */
function numbered(key, text, names) {
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    const index = names.indexOf(name)
    if (index === -1) fail(`${key}: ${whole} isn't a declared placeholder`)
    return `{${index}}`
  })
}

/** Every string and plural in a language's ARB file, by key. */
function readLanguage(tag, template) {
  const arb = JSON.parse(readFileSync(join(l10n, `app_${tag}.arb`), "utf8"))
  const strings = new Map()
  const plurals = new Map()
  for (const [key, message] of Object.entries(arb)) {
    if (key.startsWith("@")) continue
    // Placeholders are declared once, in the English file.
    const names = Object.keys((template ?? arb)[`@${key}`]?.placeholders ?? {})
    const plural = pluralForms(key, message)
    if (plural) {
      // The count is always the first value.
      const ordered = [plural.count, ...names.filter((n) => n !== plural.count)]
      const forms = {}
      for (const form of ["one", "other"]) {
        if (plural.forms[form] !== undefined)
          forms[form] = numbered(key, plural.forms[form], ordered)
      }
      plurals.set(key, forms)
    } else {
      strings.set(key, numbered(key, message, names))
    }
  }
  return { arb, strings, plurals }
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
 * The keys the app asks for, apart from its own: every camelCase text in
 * its source that names an ARB message, since a key isn't always passed
 * where it's written, as in `tr(resume ? "titleResume" : "titlePlay")`.
 * The keys `tr("…")` and `plural("…")` are called with directly must
 * exist.
 */
function usedKeys() {
  const named = new Set()
  const called = { strings: new Set(), plurals: new Set() }
  for (const file of sourceFiles(join(app, "src"))) {
    const source = readFileSync(file, "utf8")
    for (const [, name] of source.matchAll(
      /"([a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+)"/g,
    )) {
      named.add(name)
    }
    for (const [, call, name] of source.matchAll(
      /\b(tr|key|plural)\(\s*"([A-Za-z0-9_]+)"/g,
    )) {
      if (name.startsWith("tizen_")) continue
      called[call === "plural" ? "plurals" : "strings"].add(name)
      named.add(name)
    }
  }
  return { named, called }
}

const { named, called } = usedKeys()
const english = readLanguage("en")
const languages = new Map(
  LANGUAGES.map((tag) => [
    tag,
    tag === "en" ? english : readLanguage(tag, english.arb),
  ]),
)

const missing = [
  ...[...called.strings].filter((key) => !english.strings.has(key)),
  ...[...called.plurals].filter((key) => !english.plurals.has(key)),
]
if (missing.length) {
  fail(
    `The Flutter app has no message for ${missing.join(", ")}. Add it to its ARB files, or name the key tizen_… and add it to src/i18n/own.ts.`,
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

const generated = `// Generated by scripts/strings.mjs from the Flutter app's ARB files. Don't
// edit: change the message in apps/flutter/lib/l10n, or the key the app asks
// for, and run \`pnpm --filter @matinee/tizen strings\`.

${table("SHARED_STRINGS", used.strings, (language, key) => language.strings.get(key))}

${table("SHARED_PLURALS", used.plurals, (language, key) => language.plurals.get(key))}
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
      "src/i18n/shared.gen.ts is stale. Run `pnpm --filter @matinee/tizen strings`.",
    )
  }
} else {
  writeFileSync(output, generated)
  process.stdout.write(
    `${used.strings.length} strings, ${used.plurals.length} plurals\n`,
  )
}
