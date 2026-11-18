/*
 * libmpv for the desktop app's macOS build: mpv's release with
 * apps/desktop/mpv/macos-parent-layer.patch, which lets mpv show its video
 * in a layer of the app's. Homebrew's mpv doesn't have the patch, so this
 * builds mpv against Homebrew's libraries into `<temp>/mpv`.
 *
 *   node tools/ci/mpv-macos.mjs prepare
 *   node tools/ci/mpv-macos.mjs build
 *
 * `prepare` installs what mpv builds against, points pkg-config at
 * `<temp>/mpv`, and sets the output `key`: a name for the build that
 * changes with the patch, this script, and the libraries it links, to
 * cache `<temp>/mpv` under. `build` is for when the cache had nothing.
 *
 * To move to a newer mpv, change TAG, and the patch if it no longer
 * applies.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

import { env, fail, read, root, run, setForWorkflow } from "../release/lib.mjs"

const TAG = "v0.41.0"
const PATCH = join(root, "apps/desktop/mpv/macos-parent-layer.patch")

// What libmpv links, which a cached build has to match.
const LIBRARIES = [
  "ffmpeg",
  "libass",
  "libplacebo",
  "little-cms2",
  "luajit",
  "molten-vk",
  "uchardet",
  "vulkan-loader",
]
const TOOLS = ["meson", "ninja", "pkgconf", "vulkan-headers"]

const prefix = join(env("RUNNER_TEMP"), "mpv")
const source = join(env("RUNNER_TEMP"), "mpv-source")

function prepare() {
  run("brew", ["install", "--quiet", ...LIBRARIES, ...TOOLS])
  const hash = createHash("sha256")
  for (const part of [
    TAG,
    readFileSync(PATCH),
    readFileSync(new URL(import.meta.url)),
    read("brew", ["list", "--versions", ...LIBRARIES]),
    read("sw_vers", ["-productVersion"]),
    read("uname", ["-m"]),
  ]) {
    hash.update(part)
  }
  setForWorkflow("GITHUB_OUTPUT", "key", `mpv-macos-${hash.digest("hex")}`)
  const others = process.env.PKG_CONFIG_PATH
  setForWorkflow(
    "GITHUB_ENV",
    "PKG_CONFIG_PATH",
    [join(prefix, "lib", "pkgconfig"), others].filter(Boolean).join(":"),
  )
}

function build() {
  const inSource = (command, args) =>
    execFileSync(command, args, { cwd: source, stdio: "inherit" })
  rmSync(source, { recursive: true, force: true })
  run("git", [
    "clone",
    "--quiet",
    "--depth=1",
    `--branch=${TAG}`,
    "https://github.com/mpv-player/mpv",
    source,
  ])
  inSource("git", ["apply", PATCH])
  // Only the library. Vulkan and the Swift parts are what the patch is
  // for, so a build without them fails here and not when a video opens.
  inSource("meson", [
    "setup",
    "build",
    `--prefix=${prefix}`,
    "--buildtype=release",
    "-Dlibmpv=true",
    "-Dcplayer=false",
    "-Dcocoa=enabled",
    "-Dswift-build=enabled",
    "-Dvulkan=enabled",
    "-Dlua=luajit",
    "-Dmanpage-build=disabled",
  ])
  inSource("meson", ["compile", "-C", "build"])
  inSource("meson", ["install", "-C", "build"])
  if (!existsSync(join(prefix, "lib", "pkgconfig", "mpv.pc"))) {
    fail(`The build left no libmpv in ${prefix}`)
  }
  process.stdout.write(`libmpv ${TAG} with the patch in ${prefix}\n`)
}

const step = process.argv[2]
if (step === "prepare") prepare()
else if (step === "build") build()
else fail("Say which step to run: prepare or build")
