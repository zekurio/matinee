# Option logic that needs no VM: what each configuration renders, and what
# it refuses.
{
  lib,
  pkgs,
  nixosSystem,
  module,
}:

let
  eval =
    config:
    (nixosSystem {
      inherit (pkgs.stdenv.hostPlatform) system;
      modules = [
        module
        config
        {
          boot.isContainer = true;
          system.stateVersion = "26.05";
        }
      ];
    }).config;

  failed = config: map (a: a.message) (lib.filter (a: !a.assertion) config.assertions);
  throws = value: !(builtins.tryEval (builtins.deepSeq value value)).success;

  unit = config: config.systemd.services.matinee;
  env = config: (unit config).environment;
  serviceConfig = config: (unit config).serviceConfig;
  # The module's own tmpfiles rules, among the system's.
  tmpfiles = config: lib.filter (lib.hasInfix " matinee matinee ") config.systemd.tmpfiles.rules;

  server =
    extra:
    eval {
      services.matinee = lib.recursiveUpdate {
        enable = true;
        publicUrl = "https://watch.example.com";
      } extra;
    };

  plain = server { };

  oidc = server {
    oidc = {
      issuerUrl = "https://id.example.com";
      clientId = "matinee";
      displayName = "Pocket ID";
      scopes = [
        "openid"
        "profile"
        "groups"
      ];
      allowSignUp = true;
    };
    transcoding.hardwareAcceleration = "qsv";
    settings = {
      MATINEE_SCAN_INTERVAL_HOURS = 6;
      MATINEE_WATCH_LIBRARIES = false;
      MATINEE_OIDC_DISPLAY_NAME = "100% Pocket ID";
    };
    secrets = {
      MATINEE_OIDC_CLIENT_SECRET = "/run/secrets/oidc";
      MATINEE_TMDB_API_KEY = "/run/secrets/tmdb";
    };
  };

  remoteDatabase = server {
    database = {
      createLocally = false;
      host = "db.example.com";
    };
    secrets.DATABASE_URL = "/run/secrets/database-url";
  };

  results = {
    "a plain server has no failed assertions" = failed plain == [ ];
    "a plain server gets a local database over the socket" =
      (env plain).DATABASE_URL == "postgres://matinee@localhost/matinee?host=/run/postgresql"
      && plain.services.postgresql.enable
      && map (u: u.name) plain.services.postgresql.ensureUsers == [ "matinee" ]
      && lib.elem "postgresql.target" (unit plain).requires;
    "the server listens on loopback with its state under /var/lib and /var/cache" =
      (env plain).HOST == "127.0.0.1"
      && (env plain).PORT == "8420"
      && (env plain).MATINEE_DATA_DIR == "/var/lib/matinee"
      && (env plain).MATINEE_TRANSCODE_DIR == "/var/cache/matinee/transcodes"
      && (serviceConfig plain).StateDirectory == "matinee"
      && (serviceConfig plain).CacheDirectory == "matinee/transcodes"
      && (serviceConfig plain).ReadWritePaths == [ ]
      && tmpfiles plain == [ ];
    "discovery is on without opening the firewall by default" =
      (env plain).MATINEE_DISCOVERY_ENABLED == "true"
      && !lib.elem 8421 plain.networking.firewall.allowedUDPPorts;
    "openFirewall opens HTTP and discovery" =
      let
        opened = server { openFirewall = true; };
      in
      lib.elem 8420 opened.networking.firewall.allowedTCPPorts
      && lib.elem 8421 opened.networking.firewall.allowedUDPPorts;
    "disabling discovery closes its firewall port" =
      let
        disabled = server {
          openFirewall = true;
          discovery.enable = false;
        };
      in
      (env disabled).MATINEE_DISCOVERY_ENABLED == "false"
      && lib.elem 8420 disabled.networking.firewall.allowedTCPPorts
      && !lib.elem 8421 disabled.networking.firewall.allowedUDPPorts;
    "ffmpeg is jellyfin-ffmpeg" = lib.hasInfix "jellyfin-ffmpeg" (env plain).MATINEE_FFMPEG_PATH;
    "without a GPU choice, setup's pick decides and every device is open" =
      !(env plain ? MATINEE_HARDWARE_ACCELERATION)
      && !(serviceConfig plain).PrivateDevices
      && !(serviceConfig plain ? DeviceAllow)
      && lib.elem "render" (serviceConfig plain).SupplementaryGroups;
    "no GPU closes the devices" =
      let
        none = server { transcoding.hardwareAcceleration = "none"; };
      in
      (serviceConfig none).PrivateDevices && (serviceConfig none).SupplementaryGroups == [ ];
    "VA-API opens its render node only" =
      let
        vaapi = server {
          transcoding = {
            hardwareAcceleration = "vaapi";
            vaapiDevice = "/dev/dri/renderD129";
          };
        };
      in
      (serviceConfig vaapi).DeviceAllow == [ "/dev/dri/renderD129 rw" ]
      && (serviceConfig vaapi).DevicePolicy == "closed"
      && (env vaapi).MATINEE_HARDWARE_ACCELERATION == "vaapi"
      && (env vaapi).MATINEE_VAAPI_DEVICE == "/dev/dri/renderD129";
    "the origin is pinned at exec" =
      lib.hasInfix "PUBLIC_URL=https://watch.example.com" (serviceConfig plain).ExecStart.text;
    "OIDC options become their variables" =
      failed oidc == [ ]
      && (env oidc).MATINEE_OIDC_ISSUER_URL == "https://id.example.com"
      && (env oidc).MATINEE_OIDC_CLIENT_ID == "matinee"
      && (env oidc).MATINEE_OIDC_SCOPES == "openid profile groups"
      && (env oidc).MATINEE_OIDC_ALLOW_SIGN_UP == "true"
      && !((env oidc) ? MATINEE_OIDC_ROLE_CLAIM);
    "settings override the typed options and escape %" =
      (env oidc).MATINEE_OIDC_DISPLAY_NAME == "100%% Pocket ID"
      && (env oidc).MATINEE_SCAN_INTERVAL_HOURS == "6"
      && (env oidc).MATINEE_WATCH_LIBRARIES == "false";
    "secrets become credentials" =
      (env oidc).MATINEE_OIDC_CLIENT_SECRET_FILE == "%d/MATINEE_OIDC_CLIENT_SECRET"
      && !((env oidc) ? MATINEE_OIDC_CLIENT_SECRET)
      && lib.elem "MATINEE_TMDB_API_KEY:/run/secrets/tmdb" (serviceConfig oidc).LoadCredential;
    "a secret replaces the setting of the same name" =
      failed remoteDatabase == [ ]
      && !((env remoteDatabase) ? DATABASE_URL)
      && (env remoteDatabase).DATABASE_URL_FILE == "%d/DATABASE_URL"
      && !remoteDatabase.services.postgresql.enable;
    "a secret in settings warns" = lib.any (lib.hasInfix "world-readable") (
      (server { settings.MATINEE_TMDB_API_KEY = "key"; }).warnings
    );
    "passkeys off becomes its variable, and warns without single sign-on" =
      let
        ssoOnly = server {
          passkeys = false;
          oidc = {
            issuerUrl = "https://id.example.com";
            clientId = "matinee";
          };
        };
        noWayIn = server { passkeys = false; };
      in
      (env ssoOnly).MATINEE_PASSKEYS_ENABLED == "false"
      && !lib.any (lib.hasInfix "services.matinee.passkeys") ssoOnly.warnings
      && lib.any (lib.hasInfix "services.matinee.passkeys") noWayIn.warnings
      && !((env plain) ? MATINEE_PASSKEYS_ENABLED);
    "directories elsewhere come from tmpfiles" =
      let
        elsewhere = server {
          dataDir = "/srv/matinee";
          transcodeDir = "/scratch/transcodes";
        };
      in
      (serviceConfig elsewhere).ReadWritePaths == [
        "/srv/matinee"
        "/scratch/transcodes"
      ]
      && !((serviceConfig elsewhere) ? StateDirectory)
      &&
        tmpfiles elsewhere == [
          "d /srv/matinee 0750 matinee matinee - -"
          "d /scratch/transcodes 0750 matinee matinee - -"
        ];
    "the public URL is required" = lib.any (lib.hasInfix "publicUrl") (
      failed (eval {
        services.matinee.enable = true;
      })
    );
    "an http public URL is refused" = lib.any (lib.hasInfix "https://") (
      failed (server {
        publicUrl = "http://watch.example.com";
      })
    );
    "settings can't lower the public URL to http" = lib.any (lib.hasInfix "https://") (
      failed (server {
        settings.PUBLIC_URL = "http://watch.example.com";
      })
    );
    "half an OIDC client is refused" = lib.any (lib.hasInfix "both") (
      failed (server {
        oidc.issuerUrl = "https://id.example.com";
      })
    );
    "the local database role has to be the server's user" = lib.any (lib.hasInfix "database.user") (
      failed (server {
        database.user = "someone";
      })
    );
    "a secret in the store is rejected" =
      throws
        (server {
          secrets.MATINEE_TMDB_API_KEY = ./eval.nix;
        }).services.matinee.secrets;
    "a secret under a non-variable name is rejected" =
      failed (server {
        secrets."tmdb key" = "/run/secrets/tmdb";
      }) != [ ];
  };

  failures = lib.attrNames (lib.filterAttrs (_: ok: !ok) results);
in
pkgs.runCommand "matinee-module-eval" { } (
  if failures == [ ] then
    "touch $out"
  else
    ''
      echo "failed: ${lib.concatStringsSep ", " failures}" >&2
      exit 1
    ''
)
