#!/usr/bin/env bash
# Copyright (C) edde746 and Plezy contributors.
# SPDX-License-Identifier: GPL-3.0-only
# Adapted from Plezy's tvos/scripts/fetch_engine.sh.
#
# Flutter has no tvOS engine of its own. This fetches the one Plezy builds,
# Flutter's with a patch series for tvOS (github.com/edde746/flutter-plezy),
# checks it against the SHA-256 in tvos/engine.sha256, unpacks it into a
# cache, and writes tvos/Flutter/Generated.xcconfig, which tells Xcode
# where it and Flutter are. Run it once before building, and again after
# tvos/engine.version changes. A second run with the engine in the cache
# only writes the xcconfig.
#
#   tvos/scripts/fetch_engine.sh
#
#   MATINEE_TVOS_ENGINE_CACHE   where engines are kept
#                               (default ~/.cache/matinee/flutter-tvos-engine)
#   FLUTTER_ROOT                the Flutter SDK, when `flutter` isn't on the PATH
set -euo pipefail

tvos="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app="$(cd "$tvos/.." && pwd)"

version="$(tr -d '[:space:]' < "$tvos/engine.version")"
sha256="$(tr -d '[:space:]' < "$tvos/engine.sha256")"
[[ -n "$version" ]] || { echo "error: tvos/engine.version is empty" >&2; exit 1; }
[[ "$sha256" =~ ^[0-9a-f]{64}$ ]] || { echo "error: tvos/engine.sha256 isn't one lowercase SHA-256" >&2; exit 1; }

cache="${MATINEE_TVOS_ENGINE_CACHE:-$HOME/.cache/matinee/flutter-tvos-engine}"
engine="$cache/$version"
url="https://github.com/edde746/flutter-plezy/releases/download/v$version/flutter-tvos-$version.tar.gz"
installed="$version $sha256"

if [[ ! -f "$engine/.installed" || "$(<"$engine/.installed")" != "$installed" ]]; then
  echo "Fetching $url"
  mkdir -p "$cache"
  archive="$(mktemp "$cache/engine.XXXXXX")"
  unpacked="$(mktemp -d "$cache/engine.XXXXXX")"
  trap 'rm -rf "$archive" "$unpacked"' EXIT
  curl --fail --location --silent --show-error --output "$archive" "$url"
  # Nothing is unpacked from an archive that isn't the one reviewed.
  printf '%s  %s\n' "$sha256" "$archive" | shasum -a 256 -c - >/dev/null \
    || { echo "error: $url isn't the engine tvos/engine.sha256 names" >&2; exit 1; }
  tar -xzf "$archive" -C "$unpacked"
  printf '%s\n' "$installed" > "$unpacked/.installed"
  rm -rf "$engine"
  mv "$unpacked" "$engine"
  rm -f "$archive"
  trap - EXIT
fi

if [[ -n "${FLUTTER_ROOT:-}" ]]; then
  flutter_root="$FLUTTER_ROOT"
elif command -v flutter >/dev/null; then
  # The SDK's own bin/flutter, through any link to it.
  flutter_root="$(cd "$(dirname "$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$(command -v flutter)")")/.." && pwd)"
else
  echo "error: no Flutter SDK: set FLUTTER_ROOT or put flutter on the PATH" >&2
  exit 1
fi

cat > "$tvos/Flutter/Generated.xcconfig" <<XCCONFIG
// Written by tvos/scripts/fetch_engine.sh; not checked in.
FLUTTER_ROOT=$flutter_root
FLUTTER_APPLICATION_PATH=$app
FLUTTER_LOCAL_ENGINE=$engine
XCCONFIG

echo "The tvOS engine $version is in $engine"
