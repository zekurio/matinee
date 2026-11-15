#!/usr/bin/env bash
# Builds the gallery, installs it on a simulator, and takes a screenshot of
# one page in one setting. From apps/ios/Packages/MatineeKit/Gallery:
#
#   ./shoot.sh <name> [launch arguments...]
#   ./shoot.sh buttons-dark -page buttons -scheme dark
#
# SIMULATOR names the device (matinee-design-iphone unless set), OUT the
# folder (apps/ios/build/kit-screenshots), WAIT the seconds to settle, and
# SCROLL=<n> swipes up n times before the shot. BUILD=0 skips the build.
set -euo pipefail
cd "$(dirname "$0")"
ios="$(cd ../../.. && pwd)"
device="${SIMULATOR:-matinee-design-iphone}"
out="${OUT:-$ios/build/kit-screenshots}"
derived="$ios/build/KitDerivedData"
name="$1"
shift

if [[ "${BUILD:-1}" != 0 ]]; then
  [[ -d KitGallery.xcodeproj ]] || "${XCODEGEN:-nix run nixpkgs#xcodegen --}" generate --quiet
  platform="iOS Simulator"
  [[ "$device" == *TV* || "$device" == *tv* ]] && platform="tvOS Simulator"
  xcodebuild -project KitGallery.xcodeproj -scheme KitGallery -destination "generic/platform=$platform" \
    -derivedDataPath "$derived" -quiet build
fi
xcrun simctl boot "$device" 2>/dev/null || true
xcrun simctl bootstatus "$device" -b >/dev/null
sdk=iphonesimulator
[[ "$device" == *TV* || "$device" == *tv* || -n "${TV:-}" ]] && sdk=appletvsimulator
xcrun simctl install "$device" "$derived/Build/Products/Debug-$sdk/KitGallery.app"
xcrun simctl launch --terminate-running-process "$device" io.github.zekurio.matinee.kitgallery "$@" >/dev/null
sleep "${WAIT:-2.5}"
mkdir -p "$out"
xcrun simctl io "$device" screenshot "$out/$name.png" >/dev/null 2>&1
echo "$out/$name.png"
