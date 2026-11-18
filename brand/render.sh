#!/usr/bin/env bash
# Draws the wordmark, then renders the PNGs and web copies from the SVGs in
# this folder. Run it after changing any of them, and commit what it writes.
set -euo pipefail

if ! command -v resvg >/dev/null || ! command -v oxipng >/dev/null ||
  ! command -v magick >/dev/null || ! command -v png2icns >/dev/null ||
  ! python3 -c 'import fontTools, uharfbuzz' 2>/dev/null; then
  exec nix shell --impure --expr '
    let pkgs = (builtins.getFlake "nixpkgs").legacyPackages.${builtins.currentSystem};
    in [ pkgs.resvg pkgs.oxipng pkgs.imagemagick pkgs.libicns (pkgs.python3.withPackages (p: [ p.fonttools p.uharfbuzz ])) ]
  ' -c "$0" "$@"
fi

brand="$(cd "$(dirname "$0")" && pwd)"
web="$brand/../apps/web/public"
ios="$brand/ios/AppIcon.appiconset"
desktop="$brand/../apps/desktop/native/resources"

python3 "$brand/wordmark.py"

render() { # <svg> <size> <png>
  resvg --width "$2" --height "$2" "$brand/$1" "$3"
}

render app-icon.svg 1024 "$ios/AppIcon.png"
render app-icon-dark.svg 1024 "$ios/AppIcon-Dark.png"
render app-icon-tinted.svg 1024 "$ios/AppIcon-Tinted.png"
render app-icon.svg 512 "$brand/android/play-store.png"
render app-icon.svg 180 "$web/apple-touch-icon.png"
resvg --width 1280 "$brand/social-preview.svg" "$brand/social-preview.png"
install -m 644 "$brand/mark.svg" "$web/favicon.svg"

# The desktop app: the SVG for Linux and the window, an .ico for Windows,
# and an .icns for macOS, each with the sizes its system asks for.
install -m 644 "$brand/app-icon-desktop.svg" "$desktop/matinee.svg"
sizes="$(mktemp -d)"
trap 'rm -rf "$sizes"' EXIT
for size in 16 32 48 128 256 512 1024; do
  render app-icon-desktop.svg "$size" "$sizes/$size.png"
done
oxipng --quiet --opt 4 --strip safe "$sizes"/*.png
magick "$sizes/16.png" "$sizes/32.png" "$sizes/48.png" "$sizes/256.png" \
  "$desktop/matinee.ico"
png2icns "$desktop/matinee.icns" "$sizes/16.png" "$sizes/32.png" \
  "$sizes/128.png" "$sizes/256.png" "$sizes/512.png" "$sizes/1024.png" >/dev/null

# Lossless. It also drops the alpha channel from the opaque icons, since
# App Store Connect rejects an app icon that has one.
oxipng --quiet --opt 4 --strip safe \
  "$ios"/*.png "$brand/android/play-store.png" "$web/apple-touch-icon.png" \
  "$brand/social-preview.png"
