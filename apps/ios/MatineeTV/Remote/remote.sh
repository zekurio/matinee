#!/usr/bin/env bash
# Drives the Apple TV app on a simulator with the Siri Remote and saves
# screenshots, through the MatineeTVRemote UI test, which presses the
# remote with XCUIRemote, through the real focus engine. The script and its
# steps are the kit gallery's (Packages/MatineeKit/Gallery/Remote/
# RemoteScript.swift); this runs it against the TV app. From apps/ios:
#
#   MatineeTV/Remote/remote.sh run "<launch arguments>" "<steps>"   build, launch, run the steps, quit
#   MatineeTV/Remote/remote.sh serve "<launch arguments>"           build, launch, and stay for `send`
#   MatineeTV/Remote/remote.sh send "<steps>"                       run steps in the session, at once
#   MatineeTV/Remote/remote.sh install                              rebuild the app into the session;
#                                                                   `send relaunch:...` starts it
#   MatineeTV/Remote/remote.sh stop                                 end the session
#
# `just tv-remote serve` passes the dev server and a token for you (MatineeTV/README.md).
# Steps: up down left right select menu playpause home, with *n to repeat
# (right*3); hold:<button>:<seconds>; wait:<seconds>; shot:<name>, saved as
# OUT/<name>.png; relaunch:<arguments, + for spaces>.
#
# SIMULATOR names the device ("Apple TV 4K (4th generation)" unless set),
# OUT the folder (apps/ios/build/tv-screenshots), SETTLE the seconds before
# a shot (0.6), MATINEE_TV_DERIVED_DATA the build folder
# (build/TVDerivedData). BUILD=0 skips the build.
set -euo pipefail
cd "$(dirname "$0")/../.."
ios="$PWD"
device="${SIMULATOR:-${MATINEE_TV_SIMULATOR:-Apple TV 4K (4th generation)}}"
out="${OUT:-$ios/build/tv-screenshots}"
derived="${MATINEE_TV_DERIVED_DATA:-build/TVDerivedData}"
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

# Signed ad hoc, as `just tv-run`: the Keychain keeps the sign-in only for a signed app.
build() {
  [[ -d Matinee.xcodeproj ]] || "${XCODEGEN:-nix run nixpkgs#xcodegen --}" generate --quiet
  xcodebuild -project Matinee.xcodeproj -scheme MatineeTV -destination "platform=tvOS Simulator,id=$udid" \
    -derivedDataPath "$derived" -configuration Debug CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -quiet "$@" 2>&1 |
    grep -v "^20[0-9-]* .*xcodebuild\[" || true
}

session() {
  xcrun simctl boot "$udid" 2>/dev/null || true
  xcrun simctl bootstatus "$udid" -b >/dev/null
  mkdir -p "$out"
  TEST_RUNNER_REMOTE_ARGS="$1" TEST_RUNNER_REMOTE_SCRIPT="$2" TEST_RUNNER_REMOTE_OUT="$out" \
    TEST_RUNNER_REMOTE_SETTLE="${SETTLE:-0.6}" TEST_RUNNER_REMOTE_INBOX="${3:-}" \
    TEST_RUNNER_REMOTE_LAUNCH_WAIT="${LAUNCH_WAIT:-4}" \
    xcodebuild -project Matinee.xcodeproj -scheme MatineeTV -destination "platform=tvOS Simulator,id=$udid" \
    -derivedDataPath "$derived" -only-testing:MatineeTVRemote/RemoteScript/testScript test-without-building 2>&1
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
      kill -0 "$(cat "$inbox.pid")" 2>/dev/null || { echo "remote: the session ended; see $inbox.log" >&2; exit 1; }
      sleep 0.5
    done
    echo "remote: the session didn't start in ten minutes; see $inbox.log" >&2
    exit 1
    ;;
  send)
    if [[ ! -f "$inbox/ready" ]] || ! kill -0 "$(cat "$inbox.pid" 2>/dev/null)" 2>/dev/null; then
      echo "remote: no session; run remote.sh serve first" >&2
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
    xcrun simctl install "$udid" "$derived/Build/Products/Debug-appletvsimulator/Matinee.app"
    ;;
  stop)
    [[ -d "$inbox" ]] && printf quit >"$inbox/zzz.steps"
    ;;
  *)
    echo "usage: remote.sh run|serve|send|install|stop ..." >&2
    exit 2
    ;;
esac
