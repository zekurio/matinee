{
  lib,
  root,
  # Paths from the root that the build doesn't read, so that editing them
  # doesn't rebuild it.
  exclude ? [
    # The Android app is no part of the server or the web app.
    "apps/android"
    # Nor are the desktop app's native shell and its patches to mpv. Its
    # pages are, as a member of the workspace the lockfile covers.
    "apps/desktop/native"
    "apps/desktop/mpv"
  ],
}:

lib.cleanSourceWith {
  src = root;
  filter =
    path: _type:
    let
      name = baseNameOf path;
    in
    !(builtins.elem path (map (relative: toString root + "/" + relative) exclude))
    # Local state and build output, at every depth of the workspace. The Nix
    # files configure the derivation but aren't inputs to the build, so
    # editing them doesn't rebuild it.
    && !(builtins.elem name [
      ".devenv"
      ".devenv.flake.nix"
      ".direnv"
      ".env"
      ".git"
      "data"
      "devenv.local.nix"
      "dist"
      "nix"
      "node_modules"
      "result"
    ]);
}
