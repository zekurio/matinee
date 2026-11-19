/*
 * Runs the desktop app's smoke test on a Windows runner, against the
 * packaged folder and with the runner's own Qt and mpv out of reach, so a
 * pass also says the folder runs by itself. Takes a screenshot while the
 * clip plays.
 *
 *   node tools/ci/desktop-windows-smoke.mjs <folder> <output directory>
 *
 * The output directory gets the screenshot, the app's log, and mpv's last
 * state. A runner has no GPU, so Direct3D is Windows' software renderer
 * there and the display is SDR.
 */

import { spawnSync } from "node:child_process"
import { delimiter, join, resolve } from "node:path"

import { fail, root } from "../release/lib.mjs"

const [folder, output] = process.argv.slice(2)
if (!folder || !output) {
  fail("Usage: desktop-windows-smoke.mjs <folder> <output directory>")
}

// A runner's screen is 1024 by 768, smaller than the app's window. Not
// every Windows has the command, and the test runs without it.
spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Set-DisplayResolution -Width 1920 -Height 1080 -Force",
  ],
  { stdio: "inherit" },
)

// What the workflow's Qt and mpv steps put in the environment for the
// build. The packaged program has to find its own.
const FROM_THE_BUILD = [
  "QT_ROOT_DIR",
  "QT_PLUGIN_PATH",
  "QML2_IMPORT_PATH",
  "QML_IMPORT_PATH",
  "MPV_ROOT",
]
const outside = [process.env.QT_ROOT_DIR, process.env.MPV_ROOT]
  .filter(Boolean)
  .map((directory) => resolve(directory).toLowerCase())
const path = (process.env.PATH ?? "")
  .split(delimiter)
  .filter(
    (entry) =>
      entry !== "" &&
      !outside.some((directory) =>
        resolve(entry).toLowerCase().startsWith(directory),
      ),
  )
  .join(delimiter)
// Windows spells the variable Path, and a child may only get one of them.
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      name.toUpperCase() !== "PATH" &&
      !FROM_THE_BUILD.includes(name.toUpperCase()),
  ),
)
environment.PATH = path

const screenshot = join(root, "tools", "ci", "screenshot-windows.mjs")
const result = spawnSync(
  process.execPath,
  [
    join(root, "apps", "desktop", "smoke", "smoke.mjs"),
    join(resolve(folder), "matinee-desktop.exe"),
  ],
  {
    env: {
      ...environment,
      SMOKE_OUT: resolve(output),
      SMOKE_SCREENSHOT: `"${process.execPath}" "${screenshot}" "{file}"`,
    },
    stdio: "inherit",
  },
)
process.exit(result.status ?? 1)
