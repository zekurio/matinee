/*
 * Puts the desktop app's Windows build in a folder that runs by itself:
 * the program, the Qt it loads with Qt WebEngine's process and resources,
 * libmpv, and Visual C++'s runtime.
 *
 *   node tools/ci/desktop-windows-package.mjs <build directory> <folder>
 *
 * Needs windeployqt on the PATH, MPV_ROOT as mpv-windows.mjs sets it, and
 * VCToolsRedistDir, which a Visual Studio command prompt has.
 */

import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"

import { env, fail, root, run } from "../release/lib.mjs"

const [buildDirectory, folder] = process.argv.slice(2)
if (!buildDirectory || !folder) {
  fail("Usage: desktop-windows-package.mjs <build directory> <folder>")
}

const target = resolve(folder)
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

const program = join(target, "matinee-desktop.exe")
cpSync(join(resolve(buildDirectory), "matinee-desktop.exe"), program)

// Qt's own tool copies the libraries, plugins, and QML modules the program
// uses. It reads the QML's imports from the source, since the program has
// its QML compiled in.
run("windeployqt", [
  "--release",
  "--no-compiler-runtime",
  "--qmldir",
  join(root, "apps", "desktop", "native", "qml"),
  program,
])

cpSync(join(env("MPV_ROOT"), "libmpv-2.dll"), join(target, "libmpv-2.dll"))

// The runtime's libraries beside the program, so that a machine without
// Visual C++'s redistributable runs it too. Their folder is named for the
// compiler's version.
const redist = join(env("VCToolsRedistDir"), "x64")
const runtime = readdirSync(redist).find((name) =>
  /^Microsoft\.VC\d+\.CRT$/.test(name),
)
if (!runtime) fail(`No Visual C++ runtime in ${redist}`)
for (const name of readdirSync(join(redist, runtime))) {
  if (name.endsWith(".dll")) {
    cpSync(join(redist, runtime, name), join(target, name))
  }
}

// The app links mpv, whose builds are GPL, so its license goes with it.
cpSync(join(root, "apps", "desktop", "LICENSE"), join(target, "LICENSE.txt"))

process.stdout.write(`Packaged in ${target}\n`)
