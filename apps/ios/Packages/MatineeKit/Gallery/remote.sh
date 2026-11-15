#!/usr/bin/env bash
# Drives the gallery on an Apple TV simulator with the Siri Remote and
# saves screenshots, through the KitGalleryRemote UI test (XCUIRemote,
# which presses the remote through the real focus engine). From
# apps/ios/Packages/MatineeKit/Gallery:
#
#   ./remote.sh run "<launch arguments>" "<steps>"   build, launch, run the steps, quit
#   ./remote.sh serve "<launch arguments>"           build, launch, and stay for `send`
#   ./remote.sh send "<steps>"                       run steps in the session, at once
#   ./remote.sh install                              rebuild the app into the session;
#                                                    `send relaunch:...` starts it
#   ./remote.sh stop                                 end the session
#
#   ./remote.sh serve "-page tv-buttons -scheme dark"
#   ./remote.sh send "shot:start right*2 shot:third select menu"
#
# Steps: up down left right select menu playpause home, with *n to repeat
# (right*3); hold:<button>:<seconds>; wait:<seconds>; shot:<name>, saved as
# OUT/<name>.png; relaunch:<arguments, + for spaces>. See Remote/RemoteScript.swift.
#
# SIMULATOR names the device ("Apple TV 4K (4th generation)" unless set;
# "Apple TV 4K (4th generation) (at 1080p)" for the 1080p one), OUT the
# folder (apps/ios/build/tv-kit-screenshots), SETTLE the seconds before a
# shot (0.6). BUILD=0 skips the build.
set -euo pipefail
cd "$(dirname "$0")"
ios="$(cd ../../.. && pwd)"
device="${SIMULATOR:-Apple TV 4K (4th generation)}"
out="${OUT:-$ios/build/tv-kit-screenshots}"
derived="$ios/build/KitDerivedData"
mode="${1:-run}"
shift || true

udid="$(xcrun simctl list devices available -j | /usr/bin/python3 -c '
import json, sys
name = sys.argv[1]
for devices in json.load(sys.stdin)["devices"].values():
    for d in devices:
        if d["name"] == name:
            print(d["udid"]); sys.exit(0)
sys.exit("no simulator named " + name)
' "$device")"
inbox="$ios/build/tv-remote/$udid"

build() {
  [[ -d KitGallery.xcodeproj ]] || "${XCODEGEN:-nix run nixpkgs#xcodegen --}" generate --quiet
  xcodebuild -project KitGallery.xcodeproj -scheme KitGallery -destination "generic/platform=tvOS Simulator" \
    -derivedDataPath "$derived" -quiet "$@" 2>&1 | grep -v "^20[0-9-]* .*xcodebuild\[" || true
}

session() {
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  mkdir -p "$out"
  TEST_RUNNER_REMOTE_ARGS="$1" TEST_RUNNER_REMOTE_SCRIPT="$2" TEST_RUNNER_REMOTE_OUT="$out" \
    TEST_RUNNER_REMOTE_SETTLE="${SETTLE:-0.6}" TEST_RUNNER_REMOTE_INBOX="${3:-}" \
    xcodebuild -project KitGallery.xcodeproj -scheme KitGallery -destination "platform=tvOS Simulator,id=$udid" \
    -derivedDataPath "$derived" -only-testing:KitGalleryRemote/RemoteScript/testScript test-without-building 2>&1
}

case "$mode" in
  run)
    [[ "${BUILD:-1}" == 0 ]] || build build-for-testing
    session "${1:-}" "${2:-}" | grep -E "remote: saved|error:|failed" | sed "s|$out/||" || true
    ;;
  serve)
    [[ "${BUILD:-1}" == 0 ]] || build build-for-testing
    rm -rf "$inbox" && mkdir -p "$inbox"
    session "${1:-}" "" "$inbox" >"$inbox.log" 2>&1 </dev/null &
    echo $! >"$inbox.pid"
    for _ in $(seq 1 1200); do
      [[ -f "$inbox/ready" ]] && { echo "remote: ready on $device"; exit 0; }
      sleep 0.5
    done
    echo "remote: the session didn't start in ten minutes; see $inbox.log" >&2
    exit 1
    ;;
  send)
    if [[ ! -f "$inbox/ready" ]] || ! kill -0 "$(cat "$inbox.pid" 2>/dev/null)" 2>/dev/null; then
      echo "remote: no session; run ./remote.sh serve first" >&2
      exit 1
    fi
    name="$(date +%s)-$RANDOM"
    printf '%s' "${1:-}" >"$inbox/$name.tmp" && mv "$inbox/$name.tmp" "$inbox/$name.steps"
    while [[ ! -f "$inbox/$name.done" ]]; do
      kill -0 "$(cat "$inbox.pid")" 2>/dev/null || { echo "remote: the session ended; see $inbox.log" >&2; exit 1; }
      sleep 0.5
    done
    result="$(cat "$inbox/$name.done")"
    rm -f "$inbox/$name.done"
    [[ "$result" == ok ]] || { echo "remote: $result" >&2; exit 1; }
    ;;
  install)
    build build
    xcrun simctl install "$udid" "$derived/Build/Products/Debug-appletvsimulator/KitGallery.app"
    ;;
  stop)
    [[ -d "$inbox" ]] && printf quit >"$inbox/zzz.steps"
    ;;
  *)
    echo "usage: ./remote.sh run|serve|send|install|stop ..." >&2
    exit 2
    ;;
esac
