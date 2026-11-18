#!/bin/sh
# Copies the app icon from brand/ios, its one place in the repository,
# into an asset catalog of its own here, which is
# git-ignored: Xcode's asset compiler doesn't follow a symlink into brand/.
# XcodeGen runs this before it generates the project, as project.yml's
# preGenCommand, so run `just generate` after `just brand`.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
source="$here/../../brand/ios/AppIcon.appiconset"
catalog="$here/Matinee/Resources/AppIcon.xcassets"
mkdir -p "$catalog"
printf '{\n  "info": {\n    "author": "xcode",\n    "version": 1\n  }\n}\n' >"$catalog/Contents.json"
rm -rf "$catalog/AppIcon.appiconset"
cp -R "$source" "$catalog/AppIcon.appiconset"
