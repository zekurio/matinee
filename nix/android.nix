# The Android app's toolchain: a JDK and an Android SDK with what
# apps/android builds against. The SDK is unfree, so this takes nixpkgs
# with the Android SDK license accepted; entering the shell accepts it.
#
#   nix develop .#android -c ./gradlew assembleDebug     (from apps/android)
#
# No emulator: run the app on one from your own SDK, see apps/android/README.md.
{ nixpkgs, system }:
let
  pkgs = import nixpkgs {
    inherit system;
    config = {
      allowUnfree = true;
      android_sdk.accept_license = true;
    };
  };

  # Keep in step with compileSdk and the build tools AGP defaults to in
  # apps/android/app/build.gradle.kts.
  platformVersion = "37.0";
  buildToolsVersion = "36.0.0";

  sdk =
    (pkgs.androidenv.composeAndroidPackages {
      platformVersions = [ platformVersion ];
      buildToolsVersions = [ buildToolsVersion ];
      includeNDK = false;
      includeSources = false;
    }).androidsdk;
  home = "${sdk}/libexec/android-sdk";

  jdk = pkgs.jdk21;
in
{
  android = pkgs.mkShell {
    name = "matinee-android";
    packages = [
      sdk
      jdk
    ];
    JAVA_HOME = jdk.home;
    ANDROID_HOME = home;
    ANDROID_SDK_ROOT = home;
    # Gradle downloads aapt2 from Maven, a binary built for other Linux
    # systems. Use the SDK's, which Nix patched to run here.
    GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${home}/build-tools/${buildToolsVersion}/aapt2";
  };
}
