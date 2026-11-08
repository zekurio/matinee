{
  lib,
  root,
}:

lib.cleanSourceWith {
  src = root;
  filter =
    path: _type:
    let
      name = baseNameOf path;
    in
    # Local state and build output, at every depth of the workspace. The Nix
    # files configure the derivation but aren't inputs to the build, so
    # editing them doesn't rebuild it.
    !(builtins.elem name [
      ".devenv"
      ".devenv.flake.nix"
      ".direnv"
      ".env"
      ".git"
      ".turbo"
      "data"
      "devenv.local.nix"
      "dist"
      "nix"
      "node_modules"
      "result"
    ]);
}
