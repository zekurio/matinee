#!/usr/bin/env node
/*
 * Builds the server package and the desktop app, pushes them to the
 * binary cache, and pins each under the release's name, so the cache
 * keeps them when it collects garbage. Needs nix, cachix, and
 * CACHIX_AUTH_TOKEN.
 */

import { env, read, readVersion, run } from "./lib.mjs"

const cache = "zekurio"
const packages = ["matinee", "matinee-desktop"]

env("CACHIX_AUTH_TOKEN")
for (const name of packages) {
  const path = read("nix", [
    "build",
    `.#${name}`,
    "--no-link",
    "--print-out-paths",
  ])
  run("cachix", ["push", cache, path])
  run("cachix", ["pin", cache, `${name}-v${readVersion()}`, path])
}
