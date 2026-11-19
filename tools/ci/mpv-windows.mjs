/*
 * Gets libmpv for the desktop app's Windows build: mpv has no Windows
 * release of its own, and its site points to these builds. Downloads the
 * pinned archive, checks it, and unpacks it to `<temp>/mpv` with an import
 * library Visual Studio's linker reads, made from what the DLL exports.
 * Sets MPV_ROOT for the steps after it. Needs 7z, and dumpbin and lib from
 * a Visual Studio command prompt, on the PATH.
 *
 * To move to a newer build, change BUILD and its SHA256 together.
 */

import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { env, fail, setForWorkflow } from "../release/lib.mjs"

const BUILD = "20261111"
const ARCHIVE = `mpv-dev-x86_64-${BUILD}-git-bcde6b93cc.7z`
const SHA256 =
  "273c079b11ea5575822f972756f4c9a71149a5c10130353abeb8586738938452"
const URL = `https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/${BUILD}/${ARCHIVE}`
const DLL = "libmpv-2.dll"

const target = join(env("RUNNER_TEMP"), "mpv")
mkdirSync(target, { recursive: true })

const response = await fetch(URL)
if (!response.ok) fail(`Couldn't download ${URL}: ${response.status}`)
const archive = Buffer.from(await response.arrayBuffer())
const hash = createHash("sha256").update(archive).digest("hex")
if (hash !== SHA256) fail(`${ARCHIVE} has the hash ${hash}, not ${SHA256}`)
const archivePath = join(target, ARCHIVE)
writeFileSync(archivePath, archive)

const run = (command, args) =>
  execFileSync(command, args, { cwd: target, encoding: "utf8" })
run("7z", ["x", "-y", archivePath])

// dumpbin lists a DLL's exports as "ordinal hint RVA name" rows.
const exports = run("dumpbin", ["/exports", DLL])
  .split(/\r?\n/)
  .map((line) => /^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(mpv_\w+)/.exec(line)?.[1])
  .filter(Boolean)
if (exports.length === 0) fail(`${DLL} exports nothing dumpbin could list`)
writeFileSync(
  join(target, "mpv.def"),
  `LIBRARY ${DLL}\nEXPORTS\n${exports.join("\n")}\n`,
)
run("lib", ["/def:mpv.def", "/out:mpv.lib", "/machine:x64"])

// Read back, so a build that made nothing fails here and not at the link.
readFileSync(join(target, "mpv.lib"))
setForWorkflow("GITHUB_ENV", "MPV_ROOT", target.replaceAll("\\", "/"))
process.stdout.write(`libmpv ${BUILD} in ${target}\n`)
