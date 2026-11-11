# Toolchain shared with the package build. The hook starts one Unix-socket
# Postgres per checkout; direnv uses this same shell through `use flake`.
{
  lib,
  mkShell,
  writeShellScriptBin,
  bash,
  coreutils,
  nodejs_24,
  pnpm_11,
  postgresql_17,
  util-linuxMinimal,
  typescript-language-server,
  nixd,
  nil,
  jellyfin-ffmpeg,
  just,
}:
let
  pnpmPackage = import ./pnpm.nix { inherit pnpm_11; };
  postgres = writeShellScriptBin "matinee-postgres" ''
    export PATH=${
      lib.makeBinPath [
        postgresql_17
        util-linuxMinimal
        coreutils
      ]
    }:$PATH
    exec ${lib.getExe bash} ${./dev-postgres.sh} "$@"
  '';
in
mkShell {
  packages = [
    nodejs_24
    pnpmPackage
    postgresql_17
    typescript-language-server
    nixd
    nil
    jellyfin-ffmpeg
    just
    postgres
  ];

  env = {
    NODE_ENV = "development";
    PORT = "8420";
    PUBLIC_URL = "http://localhost:5173";
    PGUSER = "postgres";
    PGDATABASE = "matinee";
  };

  shellHook = ''
    DEVSHELL_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    export DEVSHELL_ROOT
    # Stable across terminals, IDEs and agents with different XDG_RUNTIME_DIRs.
    export PGHOST="/tmp/matinee-postgres-$(printf %s "$DEVSHELL_ROOT" | ${lib.getExe' coreutils "sha256sum"} | cut -c1-12)"
    export DATABASE_URL="postgres://postgres@localhost/matinee?host=$PGHOST"

    if [ ! -e "$DEVSHELL_ROOT/.env" ]; then
      (umask 077; cp -n "$DEVSHELL_ROOT/.env.example" "$DEVSHELL_ROOT/.env") || exit $?
    fi
    matinee-postgres start || exit $?
    echo "Matinee dev Postgres: $DATABASE_URL" >&2
  '';
}
