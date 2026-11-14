#!/usr/bin/env node
import assert from "node:assert/strict"
import { readFile, writeFile, mkdir, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { gzipSync } from "node:zlib"

import { build } from "esbuild"

const root = process.cwd()
const MAX_BUNDLE = 5 * 1024 * 1024
const reserved = new Set(["tmdb", "tvdb", "imdb", "oidc", "passkey", "matinee"])
function relativeFile(name) {
  assert.match(
    name,
    /^(?!\/)(?!.*\.\.)(?!.*[\\:])[^\s].*$/,
    "main and source must be relative paths without ..",
  )
  assert(
    name.split("").every((char) => char.charCodeAt(0) >= 32),
    "Control characters are not allowed in paths",
  )
  assert(
    name.split("/").every((part) => part && part !== "."),
    "Empty path components are not allowed",
  )
  return path.resolve(root, name)
}
async function inside(file) {
  const resolved = await realpath(file)
  const base = await realpath(root)
  assert(
    resolved === base || resolved.startsWith(`${base}${path.sep}`),
    "Plugin files must stay inside the package",
  )
  return resolved
}
function approval(manifest) {
  const permissions = manifest.permissions ?? {}
  const contributions = manifest.contributes ?? {}
  const lines = []
  if (permissions.network?.length)
    lines.push(`It may contact ${permissions.network.join(", ")}.`)
  for (const field of manifest.config ?? [])
    if (field.type === "url" && field.network)
      lines.push(
        `It may contact the server entered in ${field.label}, including private addresses.`,
      )
  if (permissions.storage) lines.push("It may store data on this server.")
  for (const provider of contributions.metadata ?? [])
    lines.push(`It provides metadata through ${provider.name}.`)
  for (const provider of contributions.auth ?? []) {
    lines.push(`It provides sign-in through ${provider.name}.`)
    if (provider.kind === "credentials")
      lines.push(
        `It receives credentials entered for ${provider.name}. This is sensitive.`,
      )
  }
  for (const event of contributions.events ?? [])
    lines.push(
      `It receives ${event} events.${event.startsWith("playback.") ? " This includes private viewing activity." : ""}`,
    )
  return lines.length ? lines : ["It asks for no permissions."]
}
async function bundle() {
  const packageBytes = await readFile(path.join(root, "package.json"))
  const pkg = JSON.parse(packageBytes.toString("utf8"))
  const manifest = pkg.matinee
  assert(manifest, "package.json needs a matinee object")
  assert.match(manifest.id, /^[a-z][a-z0-9-]{1,31}$/, "Invalid plugin id")
  assert(!reserved.has(manifest.id), "This plugin id is reserved")
  assert(
    Number.isSafeInteger(manifest.api) && manifest.api >= 1,
    "matinee.api must be a positive integer",
  )
  assert.match(
    pkg.version,
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    "Use an npm version",
  )
  assert.match(
    manifest.name,
    /^.{1,64}$/u,
    "matinee.name must have 1 to 64 characters",
  )
  const known = new Set([
    "api",
    "id",
    "name",
    "main",
    "source",
    "permissions",
    "contributes",
    "config",
  ])
  assert(
    Object.keys(manifest).every((key) => known.has(key)),
    "Unknown key in matinee",
  )
  const outfile = relativeFile(manifest.main)
  const entry = relativeFile(manifest.source ?? "src/index.ts")
  await inside(entry)
  await mkdir(path.dirname(outfile), { recursive: true })
  await inside(path.dirname(outfile))
  // Do not follow an existing output symlink outside the package.
  await inside(outfile).catch((cause) => {
    if (cause.code !== "ENOENT") throw cause
  })
  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    packages: "bundle",
    minifyWhitespace: false,
    metafile: true,
    write: false,
  })
  assert(
    Object.values(result.metafile.outputs).every(
      (output) => output.imports.length === 0,
    ),
    "The bundle must not have imports",
  )
  assert.equal(
    result.outputFiles.length,
    1,
    "The build must produce one module",
  )
  const output = result.outputFiles[0]
  assert(output.contents.length <= MAX_BUNDLE, "The bundle exceeds 5 MB")
  await writeFile(outfile, output.contents)
  process.stdout.write(
    `${manifest.id} ${pkg.version} built to ${manifest.main}, ${output.contents.length} bytes.\n${approval(manifest).join("\n")}\n`,
  )
  return { pkg, packageBytes, outfile }
}
function tarEntry(name, bytes) {
  const header = Buffer.alloc(512)
  // Ustar paths can use a 155-byte prefix and a 100-byte basename.
  let basename = name
  let prefix = ""
  if (Buffer.byteLength(name) > 100) {
    const slash = name.lastIndexOf("/")
    prefix = name.slice(0, slash)
    basename = name.slice(slash + 1)
  }
  assert(
    Buffer.byteLength(basename) <= 100 && Buffer.byteLength(prefix) <= 155,
    "File path is too long for ustar",
  )
  header.write(basename, 0, 100)
  const octal = (value, offset, length) =>
    header.write(
      `${value.toString(8).padStart(length - 1, "0")}\0`,
      offset,
      length,
    )
  octal(0o644, 100, 8)
  octal(0, 108, 8)
  octal(0, 116, 8)
  octal(bytes.length, 124, 12)
  octal(0, 136, 12)
  header.fill(32, 148, 156)
  header.write("0", 156)
  header.write("ustar\0", 257)
  header.write("00", 263)
  header.write(prefix, 345, 155)
  const checksum = header.reduce((total, byte) => total + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8)
  return Buffer.concat([
    header,
    bytes,
    Buffer.alloc((512 - (bytes.length % 512)) % 512),
  ])
}
async function main() {
  const command = process.argv[2]
  assert(
    ["build", "pack"].includes(command),
    "Usage: matinee-plugin build|pack",
  )
  const { pkg, packageBytes, outfile } = await bundle()
  if (command === "build") return
  const files = new Map([
    ["package.json", packageBytes],
    [pkg.matinee.main, await readFile(outfile)],
  ])
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && /^(README|LICENSE)/i.test(entry.name))
      files.set(
        entry.name,
        await readFile(await inside(path.join(root, entry.name))),
      )
  }
  const tar = Buffer.concat(
    [...files]
      .map(([name, bytes]) => tarEntry(`package/${name}`, bytes))
      .concat(Buffer.alloc(1024)),
  )
  const filename = `${pkg.matinee.id}-${pkg.version}.tgz`
  await writeFile(path.join(root, filename), gzipSync(tar))
  process.stdout.write(`Packed ${filename}.\n`)
}
main().catch((cause) => {
  process.stderr.write(`${cause.message}\n`)
  process.exitCode = 1
})
