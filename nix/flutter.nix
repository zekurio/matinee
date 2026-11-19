# The Flutter app's toolchain: Flutter, a JDK, and an Android SDK with the
# NDK and CMake that Flutter's Gradle plugin and native assets build with.
# The SDK is unfree, so this takes nixpkgs with the Android SDK license
# accepted; entering the shell accepts it.
#
#   nix develop .#flutter -c flutter build apk     (from apps/flutter)
#   just flutter build                             (the same, from anywhere)
#
# No emulator: run the app on one from your own SDK, see apps/flutter/README.md.
{ nixpkgs, system }:
let
  pkgs = import nixpkgs {
    inherit system;
    config = {
      allowUnfree = true;
      android_sdk.accept_license = true;
    };
  };

  # Keep in step with apps/flutter/android/app/build.gradle.kts: Flutter's
  # default compileSdk and NDK, and the build tools AGP defaults to.
  platformVersion = "36";
  buildToolsVersion = "36.0.0";
  ndkVersion = "28.2.13676358";
  cmakeVersion = "3.22.1";

  sdk =
    (pkgs.androidenv.composeAndroidPackages {
      platformVersions = [ platformVersion ];
      buildToolsVersions = [ buildToolsVersion ];
      includeNDK = true;
      ndkVersions = [ ndkVersion ];
      cmakeVersions = [ cmakeVersion ];
      includeSources = false;
    }).androidsdk;
  home = "${sdk}/libexec/android-sdk";

  jdk = pkgs.jdk21;
in
{
  flutter = pkgs.mkShell {
    name = "matinee-flutter";
    packages = [
      pkgs.flutter
      sdk
      jdk
      pkgs.just
    ];
    # apps/flutter/justfile runs Flutter directly when it sees this, and
    # through this shell otherwise.
    MATINEE_FLUTTER_SHELL = "1";
    JAVA_HOME = jdk.home;
    ANDROID_HOME = home;
    ANDROID_SDK_ROOT = home;
    ANDROID_NDK_HOME = "${home}/ndk/${ndkVersion}";
    # Gradle downloads aapt2 from Maven, a binary built for other Linux
    # systems. Use the SDK's, which Nix patched to run here.
    GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${home}/build-tools/${buildToolsVersion}/aapt2";
    shellHook = ''
      export PUB_CACHE="''${PUB_CACHE:-$HOME/.pub-cache}"
    '';
  };
}
