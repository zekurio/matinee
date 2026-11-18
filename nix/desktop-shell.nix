# The toolchain for the desktop app's native shell: CMake, Qt 6 with
# QtWebEngine, and libmpv. `nix develop .#desktop`, or `just desktop`.
{
  lib,
  mkShell,
  cmake,
  ninja,
  pkg-config,
  clang-tools,
  qt6,
  qt6Packages,
  callPackage,
  wayland,
  wayland-protocols,
  wayland-scanner,
  nodejs_24,
  pnpm_11,
  just,
}:
let
  pnpmPackage = import ./pnpm.nix { inherit pnpm_11; };
  mpv = callPackage ./mpv.nix { };
  qtModules = [
    qt6.qtbase
    qt6.qtdeclarative
    qt6.qtwebengine
    qt6.qtwebchannel
    qt6.qtwayland
    qt6.qtsvg
  ];
in
mkShell {
  packages = [
    cmake
    ninja
    pkg-config
    clang-tools
    wayland-scanner
    nodejs_24
    pnpmPackage
    just
  ];

  buildInputs = qtModules ++ [
    qt6Packages.qtkeychain
    mpv
    wayland
    wayland-protocols
  ];

  # A packaged build gets these from wrapQtAppsHook. A build tree's binary
  # finds Qt's plugins and QML modules here, and only here: plugins of
  # another Qt on the machine would not load.
  env = {
    # Tells apps/desktop/justfile that it's already in this shell.
    MATINEE_DESKTOP_SHELL = "1";
    QT_PLUGIN_PATH = lib.makeSearchPath qt6.qtbase.qtPluginPrefix qtModules;
    QML_IMPORT_PATH = lib.makeSearchPath qt6.qtbase.qtQmlPrefix qtModules;
  };
}
