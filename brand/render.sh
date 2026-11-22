#!/usr/bin/env bash
# Draws the wordmark, then renders the PNGs and web copies from the SVGs in
# this folder. Run it after changing any of them, and commit what it writes.
set -euo pipefail

if ! command -v resvg >/dev/null || ! command -v oxipng >/dev/null ||
  ! python3 -c 'import fontTools, uharfbuzz' 2>/dev/null; then
  exec nix shell --impure --expr '
    let pkgs = (builtins.getFlake "nixpkgs").legacyPackages.${builtins.currentSystem};
    in [ pkgs.resvg pkgs.oxipng (pkgs.python3.withPackages (p: [ p.fonttools p.uharfbuzz ])) ]
  ' -c "$0" "$@"
fi

brand="$(cd "$(dirname "$0")" && pwd)"
web="$brand/../apps/web/public"
tizen="$brand/../apps/tizen/public"

python3 "$brand/wordmark.py"

render() { # <svg> <size> <png>
  resvg --width "$2" --height "$2" "$brand/$1" "$3"
}

render app-icon.svg 512 "$brand/android/play-store.png"
render app-icon.svg 180 "$web/apple-touch-icon.png"
render app-icon.svg 512 "$tizen/icon.png"
resvg --width 1280 "$brand/social-preview.svg" "$brand/social-preview.png"
install -m 644 "$brand/mark.svg" "$web/favicon.svg"

# Lossless. It also drops the alpha channel from the opaque icons.
oxipng --quiet --opt 4 --strip safe \
  "$brand/android/play-store.png" "$web/apple-touch-icon.png" \
  "$tizen/icon.png" "$brand/social-preview.png"
