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
      packagesFor = pkgs: {
        matinee = pkgs.callPackage ./nix/package.nix { };
      };
    in
    {
      devShells = lib.genAttrs systems (
        system:
        {
          default = nixpkgs.legacyPackages.${system}.callPackage ./nix/dev-shell.nix { };
        }
        // import ./nix/android.nix { inherit nixpkgs system; }
      );

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

      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);
    };
}
