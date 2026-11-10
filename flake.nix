{
  description = "Self-hosted media server";

  nixConfig = {
    extra-substituters = [ "https://zekurio.cachix.org" ];
    extra-trusted-public-keys = [
      "zekurio.cachix.org-1:mv0mACvSLZtBkXXh5YDPPXmFBJ/eO+VkSzep6LJZrAg="
    ];
  };

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;
      systems = [ "x86_64-linux" ];
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      packagesFor = pkgs: import ./nix/packages.nix { inherit pkgs; };
    in
    {
      # The dev shell is devenv.nix (https://devenv.sh). This flake packages
      # the server and runs it on NixOS.
      overlays.default = final: _prev: packagesFor final;

      packages = forAllSystems (
        pkgs:
        let
          packages = packagesFor pkgs;
        in
        packages // { default = packages.matinee; }
      );

      nixosModules.default =
        { pkgs, ... }:
        {
          imports = [ ./nix/module.nix ];
          # The package the module defaults to, built with this flake's
          # nixpkgs, so it comes from the binary cache.
          _module.args.matineePackages = self.packages.${pkgs.stdenv.hostPlatform.system};
        };

      checks = forAllSystems (
        pkgs:
        let
          module = self.nixosModules.default;
        in
        {
          inherit (self.packages.${pkgs.stdenv.hostPlatform.system}) matinee;
          eval = import ./nix/tests/eval.nix {
            inherit lib pkgs module;
            inherit (nixpkgs.lib) nixosSystem;
          };
          instance = import ./nix/tests/instance.nix { inherit pkgs module; };
        }
      );

      # The Android app's JDK and SDK. See nix/android.nix.
      devShells = lib.genAttrs systems (
        system: import ./nix/android.nix { inherit nixpkgs system; }
      );

      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);
    };
}
