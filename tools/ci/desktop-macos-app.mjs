/*
 * Makes the Matinee.app that CMake built into one that runs on another
 * Mac, zips it, and tries the zip:
 *
 *   node tools/ci/desktop-macos-app.mjs package <Matinee.app> <zip to write>
 *   node tools/ci/desktop-macos-app.mjs smoke <zip>
 *
 * For `package`, macdeployqt copies in Qt. This then copies in every other
 * library the app loads from outside the system, which is libmpv and what
 * it links from Homebrew, and has the app load the copies. MoltenVK goes
 * in by hand, since nothing links it: Vulkan's loader finds it through a
 * manifest, and looks for one inside the app first. The app is signed
 * without an identity, which a Mac with Apple's chip asks of anything it
 * runs.
 *
 * `smoke` unpacks the zip and runs the smoke test on the app in it with
 * Homebrew and Qt moved out of the way, so the app passes only with what
 * it has inside. It takes the smoke test's variables.
 *
 * Needs Qt in QT_ROOT_DIR, Homebrew, and Xcode's tools.
 */

import { execFileSync } from "node:child_process"
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

import { env, fail, read, root, run } from "../release/lib.mjs"

const [step, ...paths] = process.argv.slice(2)
if (
  !(step === "package" && paths.length === 2) &&
  !(step === "smoke" && paths.length === 1)
) {
  fail("Say which step to run: package <Matinee.app> <zip>, or smoke <zip>")
}
const app = resolve(paths[0])
const contents = join(app, "Contents")
const frameworks = join(contents, "Frameworks")
const programs = join(contents, "MacOS")
const executable = join(programs, "Matinee")
// Where the app's own program finds a library, as macdeployqt writes it.
const INSTALLED = "@executable_path/../Frameworks"
// A 64-bit Mach-O file, and one holding several architectures.
const MAGIC = new Set([0xcffaedfe, 0xcafebabe, 0xcafebabf])
const brew = read("brew", ["--prefix"])

const tool = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 << 20 })

function isMachO(path) {
  const start = Buffer.alloc(4)
  const file = openSync(path, "r")
  try {
    readSync(file, start, 0, 4, 0)
  } finally {
    closeSync(file)
  }
  return MAGIC.has(start.readUInt32BE(0))
}

/** The programs, libraries, and plugins in the app. */
function machFiles() {
  const found = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && isMachO(path)) found.push(path)
    }
  }
  walk(contents)
  return found
}

/** otool's rows, without the lines that name the file and architecture. */
const rows = (output) =>
  output
    .split("\n")
    .filter((line) => line.startsWith("\t"))
    .map((line) => line.trim())

/** What a file loads, by the names it loads them under. */
function dependencies(file) {
  const own = new Set(
    tool("otool", ["-D", file])
      .split("\n")
      .slice(1)
      .filter((line) => line && !line.endsWith(":")),
  )
  const names = rows(tool("otool", ["-L", file])).map((row) =>
    row.replace(/ \(compatibility version .*$/, ""),
  )
  return [...new Set(names)].filter((name) => !own.has(name))
}

/** The directories a file has the loader search for `@rpath`. */
function searchPaths(file) {
  const commands = tool("otool", ["-l", file])
  return [
    ...commands.matchAll(
      /cmd LC_RPATH\n\s+cmdsize \d+\n\s+path (.+) \(offset/g,
    ),
  ].map((match) => match[1])
}

// Where each library copied in came from. One that loads its neighbours
// by a path from its own place still means the place it had there.
const origins = new Map()

/** The directories `@loader_path` may stand for in a file. */
const places = (file) =>
  [dirname(file), origins.get(file)].filter((place) => place !== undefined)

/** The files a name may stand for, the likeliest first. */
function candidates(name, file) {
  if (name.startsWith("/")) return [name]
  if (name.startsWith("@executable_path/")) {
    const rest = name.slice("@executable_path/".length)
    return [join(programs, rest), join(dirname(file), rest)]
  }
  if (name.startsWith("@loader_path/")) {
    const rest = name.slice("@loader_path/".length)
    return places(file).map((place) => join(place, rest))
  }
  if (name.startsWith("@rpath/")) {
    const rest = name.slice("@rpath/".length)
    // The loader also searches where the program that loaded this says.
    return [...searchPaths(file), ...searchPaths(executable)].flatMap((path) =>
      candidates(path, file).map((directory) => join(directory, rest)),
    )
  }
  return []
}

/** A library of Homebrew's by its file name, for a name that leads nowhere. */
function fromHomebrew(name) {
  const linked = join(brew, "lib", name)
  if (existsSync(linked)) return linked
  for (const formula of readdirSync(join(brew, "opt"))) {
    const kept = join(brew, "opt", formula, "lib", name)
    if (existsSync(kept)) return kept
  }
  return undefined
}

const isSystem = (path) =>
  path.startsWith("/usr/lib/") || path.startsWith("/System/")
const isInside = (path) => path.startsWith(`${contents}/`)

/**
 * Where a library a file loads is: "inside" the app or the system, the
 * path of a file outside of both, or undefined when it's nowhere.
 */
function locate(name, file) {
  const all = candidates(name, file)
  // The system's libraries aren't files anymore, so there is no looking.
  if (all.some(isSystem)) return "inside"
  const found = all.filter((path) => existsSync(path))
  if (found.some(isInside)) return "inside"
  return found[0] ?? fromHomebrew(basename(name))
}

/** Copies a library into the app, once, and has `file` load the copy. */
function copyIn(name, from, file) {
  if (name.includes(".framework/")) {
    fail(`macdeployqt left ${name} out, which ${file} loads`)
  }
  const copy = join(frameworks, basename(name))
  const installed = `${INSTALLED}/${basename(name)}`
  if (!existsSync(copy)) {
    const original = realpathSync(from)
    copyFileSync(original, copy)
    // Homebrew's libraries are read-only.
    chmodSync(copy, 0o755)
    origins.set(copy, dirname(original))
    tool("install_name_tool", ["-id", installed, copy])
    process.stdout.write(`copied ${original}\n`)
  }
  tool("install_name_tool", ["-change", name, installed, file])
}

// Libraries that are nowhere on this machine either. Qt's plugins name
// some they can do without.
const missing = new Set()

/** One pass over the app. True when it copied something in. */
function copyOutsideLibraries() {
  let copied = false
  for (const file of machFiles()) {
    for (const name of dependencies(file)) {
      const where = locate(name, file)
      if (where === "inside") continue
      if (where === undefined) {
        missing.add(`${name}, which ${file.slice(contents.length + 1)} loads`)
        continue
      }
      copyIn(name, where, file)
      copied = true
    }
  }
  return copied
}

function deployQt() {
  execFileSync(
    join(env("QT_ROOT_DIR"), "bin", "macdeployqt"),
    [app, `-qmldir=${join(root, "apps/desktop/native/qml")}`, "-verbose=1"],
    { stdio: "inherit" },
  )
  // The program still says where Qt and libmpv were on the machine that
  // built it, and would load them from there on that machine.
  for (const path of searchPaths(executable)) {
    if (path.startsWith("/")) {
      tool("install_name_tool", ["-delete_rpath", path, executable])
    }
  }
  if (!searchPaths(executable).includes(INSTALLED)) {
    tool("install_name_tool", ["-add_rpath", INSTALLED, executable])
  }
}

function addMoltenVk() {
  const formula = read("brew", ["--prefix", "molten-vk"])
  const manifest = ["etc", "share"]
    .map((place) => join(formula, place, "vulkan/icd.d/MoltenVK_icd.json"))
    .find((path) => existsSync(path))
  if (!manifest) fail(`No manifest for MoltenVK in ${formula}`)
  const library = join(frameworks, "libMoltenVK.dylib")
  copyFileSync(realpathSync(join(formula, "lib", "libMoltenVK.dylib")), library)
  chmodSync(library, 0o755)
  const described = JSON.parse(readFileSync(manifest, "utf8"))
  // From the manifest's own folder.
  described.ICD.library_path = "../../../Frameworks/libMoltenVK.dylib"
  const folder = join(contents, "Resources", "vulkan", "icd.d")
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, "MoltenVK_icd.json"),
    `${JSON.stringify(described, null, 2)}\n`,
  )
}

function sign() {
  // Changing what a file loads broke its signature. Each file first, the
  // deepest first, since the app's signature covers the ones inside it,
  // and `--deep` passes over the plugins among the app's resources.
  const depth = (path) => path.split("/").length
  const files = machFiles().sort((a, b) => depth(b) - depth(a))
  for (const file of files) {
    tool("codesign", ["--force", "--sign", "-", file])
  }
  run("codesign", ["--force", "--deep", "--sign", "-", app])
}

function pack(archive) {
  if (!existsSync(executable)) fail(`${app} isn't a built Matinee.app`)
  deployQt()
  mkdirSync(frameworks, { recursive: true })
  while (copyOutsideLibraries()) {
    // Until the libraries copied in load nothing from outside either.
  }
  addMoltenVk()
  sign()
  for (const library of missing) {
    process.stdout.write(`::warning::The app has no ${library}\n`)
  }
  rmSync(archive, { force: true })
  // ditto keeps the links inside Qt's frameworks, which zip would follow.
  run("ditto", ["-c", "-k", "--keepParent", app, archive])
  process.stdout.write(`${app} is ready, zipped as ${archive}\n`)
}

function smoke(archive) {
  const unpacked = join(env("RUNNER_TEMP"), "packaged")
  rmSync(unpacked, { recursive: true, force: true })
  run("ditto", ["-x", "-k", archive, unpacked])
  // Qt's action points every Qt program at the Qt it installed.
  const environment = { ...process.env }
  delete environment.QT_PLUGIN_PATH
  delete environment.QML2_IMPORT_PATH
  const away = [brew, env("QT_ROOT_DIR")]
  for (const path of away) run("sudo", ["mv", path, `${path}.away`])
  try {
    execFileSync(
      process.execPath,
      [
        join(root, "apps/desktop/smoke/smoke.mjs"),
        join(unpacked, "Matinee.app/Contents/MacOS/Matinee"),
      ],
      { stdio: "inherit", env: environment },
    )
  } catch {
    fail("The packaged app didn't pass the smoke test")
  } finally {
    for (const path of away) run("sudo", ["mv", `${path}.away`, path])
  }
}

if (step === "package") pack(resolve(paths[1]))
else smoke(resolve(paths[0]))
