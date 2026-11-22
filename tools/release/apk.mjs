#!/usr/bin/env node
/*
 * Builds the Flutter app's release APKs, one for each ABI and a universal
 * one, fails unless each is the app at this version signed with a release
 * key, and writes them as matinee-v<version>-<abi>.apk with a
 * checksums.txt into the folder given. Run it in the Flutter shell, which
 * has Flutter and the SDK's aapt2 and apksigner. MATINEE_KEYSTORE_PROPERTIES
 * names the signing key, see keystore.mjs.
 *
 *     nix develop .#flutter -c node tools/release/apk.mjs <folder>
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

import { env, fail, read, readVersion, root, run, versionCode } from "./lib.mjs"

const folder = process.argv[2]
if (!folder) fail("Name the folder to write the APKs to")

// Without it, Gradle signs with the debug key.
env("MATINEE_KEYSTORE_PROPERTIES")

const app = join(root, "apps/flutter")
const built = join(app, "build/app/outputs/flutter-apk")
const buildTools = join(env("ANDROID_HOME"), "build-tools")
const [buildToolsVersion] = readdirSync(buildTools)
if (!buildToolsVersion) fail(`No build tools in ${buildTools}`)
const tool = (name) => join(buildTools, buildToolsVersion, name)

const version = readVersion()
const code = String(versionCode(version))
const applicationId = "io.github.zekurio.matinee"

// Flutter names the universal APK app-release.apk and the others
// app-<abi>-release.apk. Each build replaces the folder's APKs, so each
// one's are taken before the next.
mkdirSync(folder, { recursive: true })
const apks = []
for (const [args, abis] of [
  [[], ["universal"]],
  [["--split-per-abi"], ["arm64-v8a", "armeabi-v7a", "x86_64"]],
]) {
  run("flutter", ["build", "apk", "--release", ...args], app)
  for (const abi of abis) {
    const file =
      abi === "universal" ? "app-release.apk" : `app-${abi}-release.apk`
    const name = `matinee-v${version}-${abi}.apk`
    copyFileSync(join(built, file), join(folder, name))
    apks.push(name)
  }
}

const checksums = apks.toSorted().map((name) => {
  const path = join(folder, name)
  const badging = read(tool("aapt2"), ["dump", "badging", path])
  const id = /^package: name='([^']*)'/.exec(badging)?.[1]
  const apkCode = / versionCode='([^']*)'/.exec(badging)?.[1]
  const apkVersion = / versionName='([^']*)'/.exec(badging)?.[1]
  const certificates = read(tool("apksigner"), [
    "verify",
    "--print-certs",
    path,
  ])
  process.stdout.write(
    `${name}\n${id} ${apkVersion} (${apkCode})\n${certificates}\n`,
  )
  if (id !== applicationId) fail(`${name} is ${id}, not ${applicationId}`)
  if (apkCode !== code || apkVersion !== version)
    fail(`${name} is ${apkVersion} (${apkCode}), not ${version} (${code})`)
  if (certificates.includes("Android Debug")) fail(`A debug key signed ${name}`)

  const digest = createHash("sha256").update(readFileSync(path)).digest("hex")
  return `${digest}  ${name}\n`
})
// The format `sha256sum --check` reads.
writeFileSync(join(folder, "checksums.txt"), checksums.join(""))
