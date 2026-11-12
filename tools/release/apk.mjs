#!/usr/bin/env node
/*
 * Takes the release APKs Gradle built, one for each ABI and a universal
 * one, fails if a debug key signed any, and writes them as
 * matinee-v<version>-<abi>.apk with a checksums.txt into the folder given.
 * Run it in the Android shell, which has the SDK's apksigner.
 *
 *     nix develop .#android -c node tools/release/apk.mjs <folder>
 */

import { createHash } from "node:crypto"
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

import { env, fail, read, readVersion, root } from "./lib.mjs"

const folder = process.argv[2]
if (!folder) fail("Name the folder to write the APKs to")

const built = join(root, "apps/android/app/build/outputs/apk/release")
const buildTools = join(env("ANDROID_HOME"), "build-tools")
const [buildToolsVersion] = readdirSync(buildTools)
if (!buildToolsVersion) fail(`No build tools in ${buildTools}`)
const apksigner = join(buildTools, buildToolsVersion, "apksigner")

// Gradle names them app-<abi>-release.apk.
const apks = readdirSync(built)
  .map((file) => ({ file, abi: /^app-(.+)-release\.apk$/.exec(file)?.[1] }))
  .filter(({ abi }) => abi)
  .toSorted((a, b) => a.abi.localeCompare(b.abi))
if (!apks.some(({ abi }) => abi === "universal"))
  fail(`No universal release APK in ${built}`)

mkdirSync(folder, { recursive: true })
const checksums = apks.map(({ file, abi }) => {
  const path = join(built, file)
  const certificates = read(apksigner, ["verify", "--print-certs", path])
  process.stdout.write(`${file}\n${certificates}\n`)
  if (certificates.includes("Android Debug")) fail(`A debug key signed ${file}`)

  const name = `matinee-v${readVersion()}-${abi}.apk`
  copyFileSync(path, join(folder, name))
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex")
  return `${digest}  ${name}\n`
})
// The format `sha256sum --check` reads.
writeFileSync(join(folder, "checksums.txt"), checksums.join(""))
