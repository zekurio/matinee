/*
 * What the release scripts share. They use Node's own modules only, so the
 * release workflow runs them with the Node its runner has, before any
 * install.
 */

import { execFileSync } from "node:child_process"
import { appendFileSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
export const packageJson = join(root, "package.json")

/**
 * A version `just tag` takes. Minor and patch stay under 100, to fit the
 * Android version code in apps/android/app/build.gradle.kts.
 */
export const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d?)$/
export const VERSION_FIELD = /"version": "[^"]*"/

/** The version in the root package.json, the one every part has. */
export function readVersion() {
  const match = /"version": "([^"]*)"/.exec(readFileSync(packageJson, "utf8"))
  if (!match) fail("The root package.json has no version")
  return match[1]
}

/** Prints why and exits, as an error annotation on a workflow run. */
export function fail(message) {
  process.stderr.write(
    `${process.env.GITHUB_ACTIONS ? `::error::${message}` : message}\n`,
  )
  process.exit(1)
}

/** Runs a command from the repository root, showing its output. */
export function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit" })
}

/** Runs a command from the repository root and returns what it printed. */
export function read(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim()
}

/** A variable the workflow must have set. */
export function env(name) {
  const value = process.env[name]
  if (!value) fail(`${name} isn't set`)
  return value
}

/** Sets a variable in a file the runner reads, like GITHUB_ENV. */
export function setForWorkflow(file, name, value) {
  appendFileSync(env(file), `${name}=${value}\n`)
}
