#!/usr/bin/env node
/*
 * The release workflow's first step: fails unless the pushed tag is the
 * version in package.json and its commit is on main. Needs a checkout with
 * origin/main.
 */

import { env, fail, read, readVersion } from "./lib.mjs"

const tag = env("GITHUB_REF_NAME")
const version = readVersion()

if (tag !== `v${version}`)
  fail(`Tag ${tag} doesn't match version ${version} in package.json`)

const onMain = read("git", [
  "branch",
  "--remotes",
  "--contains",
  env("GITHUB_SHA"),
  "--list",
  "origin/main",
])
if (onMain === "") fail(`Tag ${tag} isn't on main`)
