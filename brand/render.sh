#!/usr/bin/env bash
# Renders the PNGs and web copies from the SVGs in this folder. Run it after
# changing any of them, and commit what it writes.
set -euo pipefail

if ! command -v resvg >/dev/null || ! command -v oxipng >/dev/null; then
  exec nix shell nixpkgs#resvg nixpkgs#oxipng -c "$0" "$@"
fi

brand="$(cd "$(dirname "$0")" && pwd)"
web="$brand/../apps/web/public"
ios="$brand/ios/AppIcon.appiconset"

render() { # <svg> <size> <png>
  resvg --width "$2" --height "$2" "$brand/$1" "$3"
}

render app-icon.svg 1024 "$ios/AppIcon.png"
render app-icon-dark.svg 1024 "$ios/AppIcon-Dark.png"
render app-icon-tinted.svg 1024 "$ios/AppIcon-Tinted.png"
render app-icon.svg 512 "$brand/android/play-store.png"
render app-icon.svg 180 "$web/apple-touch-icon.png"
install -m 644 "$brand/mark.svg" "$web/favicon.svg"

# Lossless. It also drops the alpha channel from the opaque icons, since
# App Store Connect rejects an app icon that has one.
oxipng --quiet --opt 4 --strip safe \
  "$ios"/*.png "$brand/android/play-store.png" "$web/apple-touch-icon.png"
