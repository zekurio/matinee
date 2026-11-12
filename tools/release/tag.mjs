#!/usr/bin/env node
/*
 * Releases a version: writes it to the root package.json, commits and tags
 * that on main, and pushes both. The tag starts .github/workflows/release.yml.
 *
 *     just tag 0.2.0
 */

import { readFileSync, writeFileSync } from "node:fs"

import {
  fail,
  packageJson,
  read,
  readVersion,
  run,
  VERSION,
  VERSION_FIELD,
} from "./lib.mjs"

const version = process.argv[2] ?? ""
const tag = `v${version}`

if (!VERSION.test(version)) fail(`'${version}' isn't a version like 0.2.0`)
if (read("git", ["branch", "--show-current"]) !== "main")
  fail("Releases are tagged on main")
if (read("git", ["status", "--porcelain"]) !== "")
  fail("The working tree has changes")

run("git", ["fetch", "--quiet", "--tags", "origin", "main"])
if (
  read("git", ["rev-parse", "HEAD"]) !==
  read("git", ["rev-parse", "origin/main"])
)
  fail("main isn't at origin/main")
if (read("git", ["tag", "--list", tag]) !== "") fail(`${tag} exists`)

// The first release tags the version package.json starts with, so there
// is nothing to commit.
if (readVersion() !== version) {
  writeFileSync(
    packageJson,
    readFileSync(packageJson, "utf8").replace(
      VERSION_FIELD,
      `"version": "${version}"`,
    ),
  )
  run("git", [
    "commit",
    "--quiet",
    "--message",
    `chore: release ${tag}`,
    packageJson,
  ])
}

run("git", ["tag", "--annotate", "--message", tag, tag])
run("git", ["push", "--atomic", "origin", "main", tag])
