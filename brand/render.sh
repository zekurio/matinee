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
ios="$brand/../apps/flutter/ios/Runner/Assets.xcassets/AppIcon.appiconset"
tv="$brand/../apps/flutter/tvos/Runner/Assets.xcassets/AppIcon.brandassets"

python3 "$brand/wordmark.py"

render() { # <svg> <size> <png>
  resvg --width "$2" --height "$2" "$brand/$1" "$3"
}

render app-icon.svg 1024 "$ios/AppIcon.png"
render app-icon-dark.svg 1024 "$ios/AppIcon-Dark.png"
render app-icon-tinted.svg 1024 "$ios/AppIcon-Tinted.png"
render app-icon.svg 512 "$brand/android/play-store.png"
render app-icon.svg 180 "$web/apple-touch-icon.png"
render app-icon.svg 512 "$tizen/icon.png"
resvg --width 1280 "$brand/social-preview.svg" "$brand/social-preview.png"

# The Apple TV's icon is two layers, the mark over the sky, at 400 by 240
# for the Home screen and 1280 by 768 for the App Store, and its top shelf
# pictures come at two widths.
wide() { # <svg> <width> <png>
  resvg --width "$2" "$brand/$1" "$3"
}
for layer in Front Back; do
  svg="tv-icon-$(echo "$layer" | tr '[:upper:]' '[:lower:]').svg"
  home="$tv/App Icon.imagestack/$layer.imagestacklayer/Content.imageset"
  wide "$svg" 400 "$home/$layer.png"
  wide "$svg" 800 "$home/$layer@2x.png"
  wide "$svg" 1280 "$tv/App Icon - App Store.imagestack/$layer.imagestacklayer/Content.imageset/$layer.png"
done
wide tv-top-shelf.svg 1920 "$tv/Top Shelf Image.imageset/top-shelf.png"
wide tv-top-shelf.svg 3840 "$tv/Top Shelf Image.imageset/top-shelf@2x.png"
wide tv-top-shelf-wide.svg 2320 "$tv/Top Shelf Image Wide.imageset/top-shelf-wide.png"
wide tv-top-shelf-wide.svg 4640 "$tv/Top Shelf Image Wide.imageset/top-shelf-wide@2x.png"
install -m 644 "$brand/mark.svg" "$web/favicon.svg"

# Lossless. It also drops the alpha channel from the opaque icons, which App
# Store Connect requires of an app icon.
oxipng --quiet --opt 4 --strip safe \
  "$ios"/*.png "$brand/android/play-store.png" "$web/apple-touch-icon.png" \
  "$tizen/icon.png" "$brand/social-preview.png"
find "$tv" -name '*.png' -exec oxipng --quiet --opt 4 --strip safe {} +
