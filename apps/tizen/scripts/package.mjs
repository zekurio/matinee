#!/usr/bin/env node
/*
 * Puts config.xml, with Matinee's version, beside what `vite build` wrote
 * to dist/app, and packs that folder into dist/Matinee.wgt, the file a
 * Samsung TV installs. A .wgt is a zip with config.xml at its top. It's
 * unsigned. A TV only takes a package signed for it, which Apps2Samsung
 * does as it installs, or Tizen's CLI from dist/app (see the README).
 *
 *     pnpm --filter @matinee/tizen package
 *
 * Node has no zip writer, so the few lines of the format it takes are
 * here. Every entry has the same date, so the same sources give the same
 * file.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { crc32, deflateRawSync } from "node:zlib"

const app = dirname(dirname(fileURLToPath(import.meta.url)))
const built = join(app, "dist/app")
const output = join(app, "dist/Matinee.wgt")

function fail(message) {
  process.stderr.write(`package.mjs: ${message}\n`)
  process.exit(1)
}

/** The version every part of Matinee has, from the root package.json. */
function readVersion() {
  const root = readFileSync(join(app, "../../package.json"), "utf8")
  const version = /"version": "([^"]*)"/.exec(root)?.[1]
  // Tizen takes three numbers, the last up to 65535.
  if (!version || !/^\d+\.\d+\.\d+$/.test(version))
    fail("The root package.json has no version Tizen takes")
  return version
}

/**
 * What Tizen's CLI leaves after signing dist/app: a signed package, or the
 * signatures. Neither belongs in the unsigned one.
 */
const SIGNED = /(\.wgt|^author-signature\.xml|^signature\d+\.xml)$/

/** Every file under `folder`, as paths from it, in a fixed order. */
function filesIn(folder) {
  const files = []
  for (const name of readdirSync(folder).toSorted()) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) files.push(...filesIn(path))
    else if (!SIGNED.test(name)) files.push(path)
  }
  return files
}

// 1980-01-01 00:00, the earliest a zip can say.
const DOS_TIME = 0
const DOS_DATE = (1 << 5) | 1
// Names are UTF-8.
const FLAGS = 0x0800
const DEFLATE = 8

/** A zip of `entries`, each a name with forward slashes and its bytes. */
function zip(entries) {
  const parts = []
  const directory = []
  let offset = 0
  for (const { name, data } of entries) {
    const path = Buffer.from(name, "utf8")
    const packed = deflateRawSync(data, { level: 9 })
    const sum = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(FLAGS, 6)
    local.writeUInt16LE(DEFLATE, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(path.length, 26)
    parts.push(local, path, packed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(FLAGS, 8)
    central.writeUInt16LE(DEFLATE, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(sum, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(path.length, 28)
    central.writeUInt32LE(offset, 42)
    directory.push(central, path)
    offset += local.length + path.length + packed.length
  }
  const size = directory.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...directory, end])
}

if (!existsSync(join(built, "index.html")))
  fail(`No index.html in ${built}. Run vite build first.`)

const version = readVersion()
const config = readFileSync(join(app, "config.xml"), "utf8")
if (!config.includes('version="0.0.0"'))
  fail('config.xml has no version="0.0.0" to set')
writeFileSync(
  join(built, "config.xml"),
  config.replace('version="0.0.0"', `version="${version}"`),
)

// config.xml first, where a TV looks for it.
const entries = filesIn(built)
  .map((file) => ({
    name: relative(built, file).split(sep).join("/"),
    data: readFileSync(file),
  }))
  .toSorted(
    (a, b) => Number(b.name === "config.xml") - Number(a.name === "config.xml"),
  )
writeFileSync(output, zip(entries))
process.stdout.write(
  `${relative(process.cwd(), output)}: Matinee ${version}, ${entries.length} files\n`,
)
