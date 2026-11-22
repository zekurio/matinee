# Shortcuts for the repository. `just` lists them. The Flutter app's are
# under `just flutter`, from apps/flutter/justfile, and the Samsung TV
# app's under `just tizen`, from apps/tizen/justfile.

mod flutter "apps/flutter"
mod tizen "apps/tizen"

[private]
default:
    @just --list --unsorted --list-submodules

# Start the server on :8420 and the web app on :5173
dev:
    pnpm dev

# Format check, lint, typecheck, and the generated file checks, as CI runs
verify:
    pnpm verify

# Draw the wordmark and render the logo, icons, and favicon from brand/
brand:
    brand/render.sh

# Build the server package and run the NixOS module's tests
check:
    nix flake check

# Set the version, commit and tag it on main, and push, which releases it
tag version:
    node tools/release/tag.mjs {{ version }}
