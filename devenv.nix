{
  pkgs,
  config,
  ...
}:
let
  # The exact pnpm package.json's packageManager names.
  pnpmPackage = import ./nix/pnpm.nix { inherit (pkgs) pnpm_11; };
  postgres = pkgs.postgresql_17;
  # nix/dev-postgres.sh derives the same path from DEVENV_RUNTIME.
  postgresSocketDir = "${config.devenv.runtime}/postgres";
in
{
  cachix.enable = false;
  dotenv.disableHint = true;

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm = {
      enable = true;
      package = pnpmPackage;
    };
  };

  packages = with pkgs; [
    postgres
    typescript-language-server
    nixd
    nil
    # Probing and transcoding. Jellyfin's build adds tonemapx, the hardware
    # tone mapping filters, and the Dolby Vision handling the encoder uses.
    jellyfin-ffmpeg
  ];

  env = {
    NODE_ENV = "development";
    PORT = "8420";
    # In dev the browser talks to Vite, which proxies /api to the server.
    # Passkeys and OIDC redirects are bound to this origin.
    PUBLIC_URL = "http://localhost:5173";
    DATABASE_URL = "postgres://postgres@localhost/matinee?host=${postgresSocketDir}";
    PGHOST = postgresSocketDir;
    PGUSER = "postgres";
    PGDATABASE = "matinee";
  };

  enterShell = ''
    matinee-postgres start || exit $?
    echo "Matinee dev Postgres: $DATABASE_URL" >&2
  '';

  enterTest = ''
    pg_isready -h "$PGHOST" -U postgres -d matinee
  '';

  scripts = {
    matinee-postgres = {
      exec = ./nix/dev-postgres.sh;
      packages = [
        postgres
        pkgs.util-linuxMinimal
      ];
      description = "start or stop the repo-local dev Postgres";
    };
    matinee-postgres-stop.exec = "matinee-postgres stop";
  };
}
