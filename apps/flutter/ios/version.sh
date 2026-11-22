#!/bin/sh
# Every part of Matinee has the version in the repository's root
# package.json, which `just tag` sets, so pubspec.yaml has none and
# Flutter leaves CFBundleShortVersionString and CFBundleVersion empty.
# The Runner's "Version" build phase runs this after Xcode has processed
# the Info.plist, and it writes the version and the build number into the
# built app's copy:
#
#   version.sh <package.json> <built Info.plist>
#
# The build number is the one Android gives the version code, major *
# 10000 + minor * 100 + patch, so 0.0.9 is 9 on both. With --check, it
# reads them back from a built app instead and fails if they're wrong:
#
#   version.sh --check <package.json> <built Info.plist>
#
# Only tools macOS ships, since Xcode's PATH has no Node.
set -eu

check=
if [ "${1:-}" = "--check" ]; then
  check=1
  shift
fi
if [ $# -ne 2 ]; then
  echo "usage: version.sh [--check] <package.json> <Info.plist>" >&2
  exit 2
fi
package=$1
plist=$2
plistbuddy=${PLISTBUDDY:-/usr/libexec/PlistBuddy}

# Xcode shows "error: ..." lines as build errors.
fail() {
  echo "error: $*" >&2
  exit 1
}

[ -f "$package" ] || fail "$package doesn't exist"
[ -f "$plist" ] || fail "$plist doesn't exist"

# The first "version" in package.json, as the Gradle build reads it.
version=$(sed -n -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' "$package" | head -n 1)
[ -n "$version" ] || fail "$package has no version"
expr "$version" : '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$' >/dev/null \
  || fail "Version $version in $package isn't major.minor.patch"

# expr reads 08 as 8, where $((08)) would be a bad octal number. It exits
# 1 when the result is 0, which isn't an error here.
number() { expr "$1" + 0 || true; }
major=$(number "${version%%.*}")
rest=${version#*.}
minor=$(number "${rest%%.*}")
patch=$(number "${rest#*.}")
[ "$minor" -lt 100 ] && [ "$patch" -lt 100 ] \
  || fail "Version $version: minor and patch must stay under 100 to fit the build number"
build=$((major * 10000 + minor * 100 + patch))

if [ -n "$check" ]; then
  name=$("$plistbuddy" -c "Print :CFBundleShortVersionString" "$plist" 2>/dev/null || true)
  number=$("$plistbuddy" -c "Print :CFBundleVersion" "$plist" 2>/dev/null || true)
  [ "$name" = "$version" ] && [ "$number" = "$build" ] \
    || fail "$plist has version '$name' ($number), not $version ($build)"
  echo "$plist has version $version ($build)"
  exit 0
fi

# The keys are there, empty, from $(FLUTTER_BUILD_NAME) and
# $(FLUTTER_BUILD_NUMBER) in Runner/Info.plist; add them if not.
set_string() {
  "$plistbuddy" -c "Set :$1 $2" "$plist" 2>/dev/null || "$plistbuddy" -c "Add :$1 string $2" "$plist"
}
set_string CFBundleShortVersionString "$version"
set_string CFBundleVersion "$build"
echo "Version $version ($build) from $package"
