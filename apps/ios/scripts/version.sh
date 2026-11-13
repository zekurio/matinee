#!/bin/sh
# Writes Config/Version.xcconfig with the version from the root package.json,
# the one place the version is set (README.md, Release). XcodeGen runs this
# before it generates the project, as project.yml's preGenCommand.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
version=$(sed -n 's/^  "version": "\([^"]*\)",*$/\1/p' "$here/../../package.json" | head -n 1)
if [ -z "$version" ]; then
  echo "No version in package.json" >&2
  exit 1
fi
mkdir -p "$here/Config"
out="$here/Config/Version.xcconfig"
next="// Written by scripts/version.sh from package.json. Don't edit.
MARKETING_VERSION = $version"
# Left alone when it's the same, so Xcode doesn't rebuild for nothing.
if [ ! -f "$out" ] || [ "$(cat "$out")" != "$next" ]; then
  printf '%s\n' "$next" >"$out"
fi
