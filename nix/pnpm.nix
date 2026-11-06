{ pnpm_11 }:

let
  packageManager = (builtins.fromJSON (builtins.readFile ../package.json)).packageManager;
  pinnedVersion = builtins.match "pnpm@(11\\.[0-9]+\\.[0-9]+)" packageManager;
in
# Select the Node-based pnpm 11 builder, not the moving `pkgs.pnpm` alias.
# A major upgrade needs an explicit builder review.
assert
  pinnedVersion != null
  || throw "nix/pnpm.nix expects packageManager = pnpm@11.x.y; review it before changing major versions.";
pnpm_11.override {
  version = builtins.head pinnedVersion;
  # Update this source hash alongside package.json's packageManager pin:
  # nix store prefetch-file https://registry.npmjs.org/pnpm/-/pnpm-<version>.tgz
  hash = "sha256-QKMlFaJVB/jyJt+74lOA4vBTlEwuzGTAwcuYtBy7ke8=";
}
