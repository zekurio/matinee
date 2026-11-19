#!/usr/bin/env bash
# Draws the wordmark and the Apple TV artwork, then renders the PNGs and web
# copies from the SVGs in this folder. Run it after changing any of them,
# and commit what it writes.
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
ios="$brand/ios/AppIcon.appiconset"
tv="$brand/../apps/ios/MatineeTV/Resources/TVAppIcon.xcassets/App Icon & Top Shelf Image.brandassets"
tizen="$brand/../apps/tizen/public"

python3 "$brand/wordmark.py"
python3 "$brand/tvos.py"

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
install -m 644 "$brand/mark.svg" "$web/favicon.svg"

# The Apple TV app's icon, a stack of three layers at 1x and 2x for the Home
# Screen and at 1280 by 768 for the App Store, and its Top Shelf images, into
# the TV target's asset catalog. Its Contents.json files say where each goes.
tv() { # <svg in tvos/> <width> <height> <png in the catalog>
  resvg --width "$2" --height "$3" "$brand/tvos/$1.svg" "$tv/$4"
}
for layer in Back Middle Front; do
  name=$(printf %s "$layer" | tr '[:upper:]' '[:lower:]')
  home="App Icon.imagestack/$layer.imagestacklayer/Content.imageset"
  store="App Icon - App Store.imagestack/$layer.imagestacklayer/Content.imageset"
  tv "icon-$name" 400 240 "$home/$name.png"
  tv "icon-$name" 800 480 "$home/$name@2x.png"
  tv "icon-$name" 1280 768 "$store/$name.png"
done
tv top-shelf 1920 720 "Top Shelf Image.imageset/top-shelf.png"
tv top-shelf 3840 1440 "Top Shelf Image.imageset/top-shelf@2x.png"
tv top-shelf-wide 2320 720 "Top Shelf Image Wide.imageset/top-shelf-wide.png"
tv top-shelf-wide 4640 1440 "Top Shelf Image Wide.imageset/top-shelf-wide@2x.png"

# Lossless. It also drops the alpha channel from the opaque icons, the TV
# icon's back layer, and the Top Shelf images, since App Store Connect
# rejects an app icon that has one and tvOS wants the back layer opaque.
find "$tv" -name '*.png' -print0 | xargs -0 oxipng --quiet --opt 4 --strip safe \
  "$ios"/*.png "$brand/android/play-store.png" "$web/apple-touch-icon.png" \
  "$tizen/icon.png" "$brand/social-preview.png"
