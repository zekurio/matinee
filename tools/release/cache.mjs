#!/usr/bin/env node
/*
 * Builds the server package, pushes it to the binary cache, and pins it
 * under the release's name, so the cache keeps it when it collects
 * garbage. Needs nix, cachix, and CACHIX_AUTH_TOKEN.
 */

import { env, read, readVersion, run } from "./lib.mjs"

const cache = "zekurio"

env("CACHIX_AUTH_TOKEN")
const path = read("nix", [
  "build",
  ".#matinee",
  "--no-link",
  "--print-out-paths",
])
run("cachix", ["push", cache, path])
run("cachix", ["pin", cache, `matinee-v${readVersion()}`, path])
