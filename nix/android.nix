# The Android app's toolchain: a JDK and an Android SDK with what
# apps/android builds against. The SDK is unfree, so this takes nixpkgs
# with the Android SDK license accepted; entering the shell accepts it.
#
#   nix develop .#android -c ./gradlew assembleDebug     (from apps/android)
#   nix develop .#android-emulator -c matinee-emulator    (a phone to run it on)
{ nixpkgs, system }:
let
  pkgs = import nixpkgs {
    inherit system;
    config = {
      allowUnfree = true;
      android_sdk.accept_license = true;
    };
  };
  inherit (pkgs) lib;

  # Keep in step with compileSdk and the build tools AGP defaults to in
  # apps/android/app/build.gradle.kts.
  platformVersion = "37.0";
  buildToolsVersion = "36.0.0";

  compose =
    emulator:
    pkgs.androidenv.composeAndroidPackages (
      {
        platformVersions = [ platformVersion ];
        buildToolsVersions = [ buildToolsVersion ];
        includeNDK = false;
        includeSources = false;
      }
      // lib.optionalAttrs emulator {
        includeEmulator = true;
        includeSystemImages = true;
        systemImageTypes = [ "google_apis" ];
        abiVersions = [ "x86_64" ];
      }
    );

  jdk = pkgs.jdk21;

  shell =
    {
      emulator ? false,
    }:
    let
      composition = compose emulator;
      sdk = composition.androidsdk;
      home = "${sdk}/libexec/android-sdk";
      # A phone named matinee, made on first use under ~/.android/avd.
      runEmulator = pkgs.writeShellScriptBin "matinee-emulator" ''
        set -eu
        if ! avdmanager list avd -c | grep -qx matinee; then
          echo no | avdmanager create avd --force --name matinee \
            --package "system-images;android-${platformVersion};google_apis;x86_64" \
            --device pixel_7
        fi
        exec emulator -avd matinee -gpu swiftshader_indirect "$@"
      '';
    in
    pkgs.mkShell {
      name = if emulator then "matinee-android-emulator" else "matinee-android";
      packages = [
        sdk
        jdk
      ]
      ++ lib.optional emulator runEmulator;
      JAVA_HOME = jdk.home;
      ANDROID_HOME = home;
      ANDROID_SDK_ROOT = home;
      # Gradle downloads aapt2 from Maven, a binary built for other Linux
      # systems. Use the SDK's, which Nix patched to run here.
      GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${home}/build-tools/${buildToolsVersion}/aapt2";
    };
in
{
  android = shell { };
  android-emulator = shell { emulator = true; };
}
