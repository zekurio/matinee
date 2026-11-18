# The desktop app: the native shell in apps/desktop/native, with the app's
# own pages from apps/desktop built into it.
{
  lib,
  stdenv,
  cmake,
  ninja,
  pkg-config,
  qt6,
  qt6Packages,
  callPackage,
  wayland,
  wayland-protocols,
  wayland-scanner,
  nodejs_24,
  pnpm_11,
  pnpmConfigHook,
  # The server package, for the dependencies both builds install.
  matinee,
  version ? (lib.importJSON ../package.json).version,
  source ? import ./source.nix {
    inherit lib;
    root = ../.;
    exclude = [ "apps/android" ];
  },
}:

let
  pnpmPackage = import ./pnpm.nix { inherit pnpm_11; };
  mpv = callPackage ./mpv.nix { };
in
stdenv.mkDerivation {
  pname = "matinee-desktop";
  inherit version;
  src = source;

  # One lockfile covers the whole workspace, so this is the server's.
  inherit (matinee) pnpmDeps;

  nativeBuildInputs = [
    cmake
    ninja
    pkg-config
    qt6.wrapQtAppsHook
    wayland-scanner
    nodejs_24
    pnpmPackage
    pnpmConfigHook
  ];

  buildInputs = [
    qt6.qtbase
    qt6.qtdeclarative
    qt6.qtwebengine
    qt6.qtwebchannel
    qt6.qtwayland
    qt6.qtsvg
    qt6Packages.qtkeychain
    mpv
    wayland
    wayland-protocols
  ];

  # The pages are static files that go into the program as resources, so
  # nothing from node_modules ships.
  dontPatchShebangs = true;

  # CMake reads the pages when it configures, and the pages need the
  # workspace's dependencies, which pnpmConfigHook installs after the
  # configure phase. So CMake waits until both are there.
  dontUseCmakeConfigure = true;
  preBuild = ''
    export HOME="$TMPDIR/home"
    export DO_NOT_TRACK=1
    mkdir -p "$HOME"
    pnpm --filter @matinee/desktop build
    cmakeConfigurePhase
  '';

  cmakeDir = "../apps/desktop/native";
  cmakeFlags = [ (lib.cmakeFeature "MATINEE_VERSION" version) ];

  postInstall = ''
    install -Dm644 ../apps/desktop/LICENSE "$out/share/doc/matinee-desktop/LICENSE"
  '';

  meta = {
    description = "Desktop client for Matinee, playing with mpv";
    # It links mpv, whose builds in nixpkgs are GPL.
    license = lib.licenses.gpl3Plus;
    mainProgram = "matinee-desktop";
    platforms = lib.platforms.linux;
  };
}
