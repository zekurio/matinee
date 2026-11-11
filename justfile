# Shortcuts for the repository. `just` lists them. The Android app's are
# under `just android`, from apps/android/justfile.

mod android "apps/android"

[private]
default:
    @just --list --unsorted --list-submodules

# Start the server on :8420 and the web app on :5173
dev:
    pnpm dev

# Format check, lint, typecheck, and the Android client check, as CI runs
verify:
    pnpm verify

# Draw the wordmark and render the logo, icons, and favicon from brand/
brand:
    brand/render.sh

# Build the server package and run the NixOS module's tests
check:
    nix flake check
