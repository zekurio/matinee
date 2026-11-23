#!/usr/bin/env bash
# Copyright (C) edde746 and Plezy contributors.
# SPDX-License-Identifier: GPL-3.0-only
# Adapted from Plezy's tvos/scripts/xcode_appletv.sh.
#
# What `flutter build` does for iOS, done by hand for tvOS, which the
# Flutter tool doesn't know: it makes App.framework from the Dart code with
# the tvOS engine's own compiler, and puts it and the engine's
# Flutter.framework where Xcode links and embeds them. The Runner's build
# phases call it, with Xcode's build settings in the environment:
#
#   build.sh build    before Sources: App.framework and Flutter.framework
#                     into BUILT_PRODUCTS_DIR
#   build.sh embed    last: both into Runner.app/Frameworks, signed
#
# A simulator gets a debug app that runs the Dart code from its kernel. A
# device gets a release app, compiled ahead of time, in every configuration:
# tvOS lets no app make memory executable, so the debug engine can't run
# there, and Plezy ships none.
set -euo pipefail

fail() {
  # Xcode shows "error: ..." lines as build errors.
  echo "error: $*" >&2
  exit 1
}

[[ -n "${FLUTTER_LOCAL_ENGINE:-}" && -d "${FLUTTER_LOCAL_ENGINE:-}/out" ]] \
  || fail "No tvOS engine. Run tvos/scripts/fetch_engine.sh first."
[[ -x "${FLUTTER_ROOT:-}/bin/flutter" ]] \
  || fail "No Flutter SDK at '${FLUTTER_ROOT:-}'. Run tvos/scripts/fetch_engine.sh again."
[[ -n "${TVOS_DEPLOYMENT_TARGET:-}" ]] || fail "TVOS_DEPLOYMENT_TARGET isn't set."

app="$FLUTTER_APPLICATION_PATH"
out="$app/build/tvos/$CONFIGURATION-$PLATFORM_NAME"
host="$FLUTTER_LOCAL_ENGINE/out/host_release"
simulator=
[[ "$PLATFORM_NAME" == appletvsimulator ]] && simulator=1

engine_out() {
  local variant
  for variant in "$@"; do
    if [[ -d "$FLUTTER_LOCAL_ENGINE/out/$variant" ]]; then
      echo "$FLUTTER_LOCAL_ENGINE/out/$variant"
      return
    fi
  done
  fail "The tvOS engine has none of: $*"
}

set_plist() { # <plist> <key> <value>
  /usr/libexec/PlistBuddy -c "Set :$2 $3" "$1" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :$2 string $3" "$1"
}

sign() { # <framework>
  if [[ -z "$simulator" && -n "${EXPANDED_CODE_SIGN_IDENTITY:-}" && "${CODE_SIGNING_ALLOWED:-YES}" != NO ]]; then
    codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" -- "$1"
  fi
}

# The flutter_assets every build has: the app's assets, fonts, licenses,
# and shaders, from the Flutter tool. Its kernel is for the stock engine;
# the tvOS engine's own replaces or drops it below.
bundle() { # [--release]
  mkdir -p "$out/App.framework/flutter_assets"
  # The tool refuses a build with these set and none in pubspec.yaml; the
  # app's version comes from the root package.json (ios/version.sh).
  (cd "$app" && env -u FLUTTER_BUILD_NAME -u FLUTTER_BUILD_NUMBER \
    "$FLUTTER_ROOT/bin/flutter" build bundle "$@" \
    --asset-dir="$out/App.framework/flutter_assets" --no-tree-shake-icons --suppress-analytics) \
    || fail "flutter build bundle failed"
}

# The Dart code as a kernel file, by the engine's frontend server against
# its patched SDK: the stock ones make kernels its VM turns down.
kernel() { # <output> [frontend server option...]
  local output="$1"
  shift
  local runtime="$host/dart-sdk/bin/dartaotruntime"
  local server="$host/dart-sdk/bin/snapshots/frontend_server_aot.dart.snapshot"
  "$runtime" --version >/dev/null 2>&1 || fail "The engine's Dart can't run on this Mac ($runtime). It needs Apple silicon."
  [[ -f "$server" ]] || server="$host/gen/frontend_server_aot.dart.snapshot"
  [[ -f "$server" ]] || fail "The engine has no frontend server"
  "$runtime" "$server" \
    --sdk-root "$host/flutter_patched_sdk" --target=flutter --tfa \
    --packages "$app/.dart_tool/package_config.json" \
    "$@" --output-dill "$output" "$app/lib/main.dart" \
    || fail "Compiling the Dart code failed"
}

frameworks() { # <engine output with Flutter.framework>
  rm -rf "$out/Flutter.framework"
  cp -R "$1/Flutter.framework" "$out"
  # The engine's Info.plist says tvOS 13; Apple checks it against the app's.
  set_plist "$out/Flutter.framework/Info.plist" MinimumOSVersion "$TVOS_DEPLOYMENT_TARGET"
  cp "$PROJECT_DIR/Flutter/AppFrameworkInfo.plist" "$out/App.framework/Info.plist"
  set_plist "$out/App.framework/Info.plist" MinimumOSVersion "$TVOS_DEPLOYMENT_TARGET"
  # BUILT_PRODUCTS_DIR is where the Swift code finds the Flutter module and
  # the linker the framework. Never TARGET_BUILD_DIR: in an archive that's
  # next to Runner.app, and loose frameworks there make it an "Other Items"
  # archive that can't be uploaded.
  mkdir -p "$BUILT_PRODUCTS_DIR"
  rm -rf "$BUILT_PRODUCTS_DIR/App.framework" "$BUILT_PRODUCTS_DIR/Flutter.framework"
  cp -R "$out/App.framework" "$out/Flutter.framework" "$BUILT_PRODUCTS_DIR"
}

# Debug, for the simulator: the kernel runs as it is, with the engine's VM
# and isolate snapshots beside it, so App.framework's binary is a stub.
build_simulator() {
  local engine
  engine="$(engine_out "tvos_debug_sim_unopt_$(uname -m)" tvos_debug_sim_unopt_arm64 tvos_debug_sim_unopt)"
  rm -rf "$out/App.framework"
  bundle
  kernel "$out/App.framework/flutter_assets/kernel_blob.bin"
  cp "$engine/gen/flutter/lib/snapshot/vm_isolate_snapshot.bin" "$out/App.framework/flutter_assets/vm_snapshot_data"
  cp "$engine/gen/flutter/lib/snapshot/isolate_snapshot.bin" "$out/App.framework/flutter_assets/isolate_snapshot_data"
  local sdk
  sdk="$(xcrun --sdk appletvsimulator --show-sdk-path)"
  echo "static const int Moo = 88;" | xcrun clang -x c \
    -arch "$(uname -m)" -isysroot "$sdk" -mappletvsimulator-version-min="$TVOS_DEPLOYMENT_TARGET" \
    -dynamiclib -Xlinker -rpath -Xlinker @executable_path/Frameworks -Xlinker -rpath -Xlinker @loader_path/Frameworks \
    -install_name @rpath/App.framework/App -o "$out/App.framework/App" -
  frameworks "$engine"
}

# Release, for a device: the kernel compiled ahead of time to arm64, which
# is App.framework's binary.
build_device() {
  local engine snapshot=
  engine="$(engine_out tvos_release)"
  # The one that writes arm64 for tvOS; the host's writes it for macOS,
  # which the VM on the device turns down.
  local candidate
  for candidate in "$engine/artifacts_arm64/gen_snapshot_arm64" "$engine/universal/gen_snapshot_arm64" \
    "$engine/artifacts_x64/gen_snapshot_arm64" "$engine/gen_snapshot_arm64"; do
    if [[ -x "$candidate" ]]; then
      snapshot="$candidate"
      break
    fi
  done
  [[ -n "$snapshot" ]] || fail "The tvOS engine has no gen_snapshot_arm64"
  rm -rf "$out/App.framework"
  bundle --release
  # Compiled into the binary instead.
  rm -f "$out/App.framework/flutter_assets/kernel_blob.bin"
  kernel "$out/app.dill" --aot \
    -Ddart.vm.product=true -Ddart.vm.profile=false -DFLUTTER_BUILD_MODE=release
  "$snapshot" --deterministic --snapshot_kind=app-aot-assembly \
    --assembly="$out/snapshot_assembly.S" --strip "$out/app.dill" \
    || fail "Compiling the Dart code to arm64 failed"
  local sdk
  sdk="$(xcrun --sdk appletvos --show-sdk-path)"
  xcrun cc -arch arm64 -isysroot "$sdk" -mtvos-version-min="$TVOS_DEPLOYMENT_TARGET" \
    -c "$out/snapshot_assembly.S" -o "$out/snapshot_assembly.o"
  xcrun clang -arch arm64 -isysroot "$sdk" -mtvos-version-min="$TVOS_DEPLOYMENT_TARGET" \
    -dynamiclib -Xlinker -rpath -Xlinker @executable_path/Frameworks -Xlinker -rpath -Xlinker @loader_path/Frameworks \
    -install_name @rpath/App.framework/App -o "$out/App.framework/App" "$out/snapshot_assembly.o"
  frameworks "$engine"
}

embed() {
  local into="$TARGET_BUILD_DIR/$WRAPPER_NAME/Frameworks"
  mkdir -p "$into"
  local framework
  for framework in App.framework Flutter.framework; do
    [[ -d "$BUILT_PRODUCTS_DIR/$framework" ]] || fail "$framework wasn't built"
    rm -rf "${into:?}/$framework"
    cp -R "$BUILT_PRODUCTS_DIR/$framework" "$into"
    sign "$into/$framework"
  done
}

case "${1:-}" in
  build)
    mkdir -p "$out"
    if [[ -n "$simulator" ]]; then build_simulator; else build_device; fi
    ;;
  embed) embed ;;
  *) fail "usage: build.sh build|embed" ;;
esac
