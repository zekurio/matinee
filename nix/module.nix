# The Matinee server on NixOS: the service, its user, and a local
# PostgreSQL. Settings are environment variables, as in .env.example; the
# typed options fill in the common ones, and `secrets` hands files over as
# systemd credentials. TLS belongs to whatever proxies the public URL.
{
  config,
  lib,
  pkgs,
  matineePackages,
  ...
}:

let
  inherit (lib)
    literalExpression
    mapAttrs
    mapAttrs'
    mapAttrsToList
    mkDefault
    mkIf
    mkOption
    nameValuePair
    optional
    optionalAttrs
    types
    ;

  cfg = config.services.matinee;

  envValue = v: if lib.isBool v then lib.boolToString v else toString v;
  envName = types.strMatching "[A-Z][A-Z0-9_]*";
  settingsType = types.attrsOf (
    types.oneOf [
      types.str
      types.int
      types.bool
    ]
  );

  # The part of a path below a systemd-managed root, or null outside it.
  below =
    root: path:
    let
      prefix = "${root}/";
    in
    if lib.hasPrefix prefix (toString path) then lib.removePrefix prefix (toString path) else null;
  pathIsUnder =
    parent: child: child == parent || lib.hasPrefix "${toString parent}/" (toString child);
  stateDirectory = below "/var/lib" cfg.dataDir;
  cacheDirectory = below "/var/cache" cfg.transcodeDir;
  # Directories systemd doesn't create for the service: tmpfiles does, and
  # the sandbox lets the service write them.
  externalDirs =
    optional (stateDirectory == null) cfg.dataDir
    ++ optional (cacheDirectory == null && !pathIsUnder cfg.dataDir cfg.transcodeDir) cfg.transcodeDir;

  db = cfg.database;
  dbSocket = lib.hasPrefix "/" db.host;
  dbHost =
    if lib.hasPrefix "[" db.host then
      db.host
    else if lib.hasInfix ":" db.host then
      "[${db.host}]"
    else
      db.host;
  databaseUrl =
    if dbSocket then
      "postgres://${db.user}@localhost/${db.name}?host=${db.host}"
    else
      "postgres://${db.user}@${dbHost}:${toString db.port}/${db.name}";

  accel = cfg.transcoding.hardwareAcceleration;
  defaultDevices =
    if accel == "none" then
      [ ]
    else if accel == "vaapi" then
      [
        (if cfg.transcoding.vaapiDevice != null then cfg.transcoding.vaapiDevice else "/dev/dri/renderD128")
      ]
    else if accel == "qsv" && cfg.transcoding.qsvDevice != null && cfg.transcoding.qsvDevice != "" then
      [ cfg.transcoding.qsvDevice ]
    # An admin picks in the app, or the GPU needs more than one node.
    else
      null;
  devices = cfg.accelerationDevices;

  # A secret replaces the setting of the same name.
  settings = removeAttrs cfg.settings (lib.attrNames cfg.secrets);
  publicUrl = cfg.settings.PUBLIC_URL or null;
  httpsPublicUrl = publicUrl != null && lib.hasPrefix "https://" (lib.toLower publicUrl);

  # Set at exec, after systemd applies the environment, so a credential
  # can't replace the origin the assertions checked. NODE_ENV comes from
  # the package's wrapper.
  serverStart = pkgs.writeShellScript "matinee-start" ''
    exec ${pkgs.coreutils}/bin/env PUBLIC_URL=${lib.escapeShellArg (toString publicUrl)} \
      ${lib.getExe cfg.package}
  '';

  nullOr = types.nullOr;

  # Settings that belong in `secrets`, out of the world-readable store.
  secretNames = [
    "MATINEE_OIDC_CLIENT_SECRET"
    "MATINEE_SETUP_TOKEN"
    "MATINEE_TMDB_API_KEY"
    "MATINEE_TVDB_API_KEY"
    "MATINEE_TVDB_PIN"
  ];
in
{
  options.services.matinee = {
    enable = lib.mkEnableOption "Matinee, a self-hosted media server";

    package = mkOption {
      type = types.package;
      default = matineePackages.matinee;
      defaultText = literalExpression "matinee.packages.\${system}.matinee";
      description = "The Matinee package to run.";
    };

    ffmpegPackage = mkOption {
      type = types.package;
      default = cfg.package.ffmpegPackage or pkgs.jellyfin-ffmpeg;
      defaultText = literalExpression "pkgs.jellyfin-ffmpeg";
      description = ''
        The ffmpeg that probes and transcodes. jellyfin-ffmpeg carries the
        tone mapping filters and the hardware encoders Matinee uses; another
        build loses what it lacks, which Settings → Transcoding shows.
      '';
    };

    publicUrl = mkOption {
      type = nullOr types.str;
      default = null;
      example = "https://watch.example.com";
      description = ''
        The https origin people open Matinee on. Passkeys and OIDC redirects
        bind to it. Something else terminates TLS for it, such as Caddy or
        `tailscale serve`, and proxies to {option}`services.matinee.port`.
      '';
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      example = "::";
      description = ''
        The address the server listens on. Loopback suits a proxy on the
        same host; a proxy elsewhere needs a reachable address, and
        {option}`services.matinee.openFirewall`.
      '';
    };

    port = mkOption {
      type = types.port;
      default = 8420;
      description = "The port the server listens on.";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open {option}`services.matinee.port` in the firewall.";
    };

    user = mkOption {
      type = types.str;
      default = "matinee";
      description = ''
        The user the server runs as. The module creates it under the default
        name; a user under another name has to exist already. With the local
        database it is also the database role, which the server reaches
        over the Unix socket.
      '';
    };

    group = mkOption {
      type = types.str;
      default = "matinee";
      description = ''
        The group the server runs as. The module creates it under the
        default name; a group under another name has to exist already.
      '';
    };

    extraGroups = mkOption {
      type = types.listOf types.str;
      default = [ ];
      example = [ "media" ];
      description = ''
        More groups for the server, such as one that can read the media.
        Libraries only need to be readable. The service can't see /home,
        so keep media under a path such as /srv or /mnt.
      '';
    };

    dataDir = mkOption {
      type = types.path;
      default = "/var/lib/matinee";
      description = ''
        Artwork, thumbnails, trickplay images, and profile pictures. A path
        below /var/lib is the service's StateDirectory; anywhere else is
        created by tmpfiles.
      '';
    };

    transcodeDir = mkOption {
      type = types.path;
      default = "/var/cache/matinee/transcodes";
      description = ''
        Encodes in progress and recently played, which Matinee deletes on
        its own. A fast disk helps. A path below /var/cache is the service's
        CacheDirectory; anywhere else is created by tmpfiles.
      '';
    };

    accelerationDevices = mkOption {
      type = nullOr (types.listOf types.str);
      default = defaultDevices;
      defaultText = literalExpression ''
        [ ] for "none", the render node for "vaapi" and a "qsv" device,
        else null
      '';
      example = [ "/dev/dri/renderD128" ];
      description = ''
        Device nodes the transcoder may open, as systemd's DeviceAllow
        takes them. `[ ]` gives the service no devices at all, and null all
        of them, which an admin picking the GPU in the app, or NVENC with
        its several nodes, needs. Any devices add the video and render
        groups.

        The host needs the GPU's drivers too, for example for Intel:

            hardware.graphics = {
              enable = true;
              extraPackages = [ pkgs.intel-media-driver pkgs.vpl-gpu-rt ];
            };
      '';
    };

    database = {
      createLocally = mkOption {
        type = types.bool;
        default = true;
        description = ''
          Run PostgreSQL on this host, with a database and a role for
          Matinee that sign in over the Unix socket.
        '';
      };

      host = mkOption {
        type = types.str;
        default = "/run/postgresql";
        example = "db.example.com";
        description = ''
          The PostgreSQL server: a host name or address, or a socket
          directory. For one that needs a password, set the whole URL in
          `secrets.DATABASE_URL` instead.
        '';
      };

      port = mkOption {
        type = types.port;
        default = 5432;
        description = "The PostgreSQL port, for a server reached over TCP.";
      };

      name = mkOption {
        type = types.str;
        default = "matinee";
        description = "The database name.";
      };

      user = mkOption {
        type = types.str;
        default = cfg.user;
        defaultText = literalExpression "config.services.matinee.user";
        description = "The database role.";
      };
    };

    passkeys = mkOption {
      type = nullOr types.bool;
      default = null;
      example = false;
      description = ''
        Passkey sign-in, sign-up, and setup. False leaves single sign-on as
        the only way to sign in, so set up {option}`services.matinee.oidc`
        too. Null leaves Matinee's default, on. An admin can still change it
        in Settings → Authentication.
      '';
    };

    oidc = {
      issuerUrl = mkOption {
        type = nullOr types.str;
        default = null;
        example = "https://id.example.com";
        description = ''
          Single sign-on through this OpenID Connect provider. With it and
          {option}`services.matinee.oidc.clientId` set, setup creates the
          admin account through the provider, and only for an account whose
          role claim says admin. Register
          `<publicUrl>/api/auth/oidc/callback` as its redirect URI, and put
          the client secret in `secrets.MATINEE_OIDC_CLIENT_SECRET`.
        '';
      };

      clientId = mkOption {
        type = nullOr types.str;
        default = null;
        description = "The client ID registered with the provider.";
      };

      displayName = mkOption {
        type = nullOr types.str;
        default = null;
        example = "Pocket ID";
        description = "The provider's name on the sign-in button.";
      };

      scopes = mkOption {
        type = nullOr (types.listOf types.str);
        default = null;
        example = [
          "openid"
          "profile"
          "email"
        ];
        description = "Scopes to ask for. Null leaves Matinee's: openid profile.";
      };

      usernameClaim = mkOption {
        type = nullOr types.str;
        default = null;
        description = "The claim that names new accounts. Null leaves preferred_username.";
      };

      roleClaim = mkOption {
        type = nullOr types.str;
        default = null;
        description = ''
          The claim that gives an account's role on every sign-in: `admin`
          or `user`, or a list holding them. Null leaves matinee_role. Only
          the provider's admins should be able to set it, as with a custom
          claim on a Pocket ID group.
        '';
      };

      allowSignUp = mkOption {
        type = nullOr types.bool;
        default = null;
        description = ''
          Create an account for a first sign-in that matches none. Null
          leaves Matinee's default, off.
        '';
      };
    };

    transcoding = {
      hardwareAcceleration = mkOption {
        type = nullOr (
          types.enum [
            "none"
            "vaapi"
            "qsv"
            "nvenc"
          ]
        );
        default = null;
        description = ''
          The GPU to transcode on. Null leaves it to the admin, whom setup
          asks; a value here skips that step, and is a default the admin
          can still change in Settings → Transcoding.
        '';
      };

      vaapiDevice = mkOption {
        type = nullOr types.str;
        default = null;
        example = "/dev/dri/renderD129";
        description = "The VA-API render node. Null leaves /dev/dri/renderD128.";
      };

      qsvDevice = mkOption {
        type = nullOr types.str;
        default = null;
        description = "The Quick Sync render node. Null lets Matinee find the Intel GPU.";
      };
    };

    settings = mkOption {
      type = settingsType;
      default = { };
      example = {
        MATINEE_SCAN_INTERVAL_HOURS = 6;
        MATINEE_OPEN_REGISTRATION = true;
      };
      description = ''
        Settings as environment variables, the ones .env.example lists.
        Settings the typed options derive can be overridden here. Put
        secrets in {option}`services.matinee.secrets` instead.
      '';
    };

    secrets = mkOption {
      type = types.attrsOf types.externalPath;
      default = { };
      example = literalExpression ''
        {
          MATINEE_OIDC_CLIENT_SECRET = config.sops.secrets.matinee-oidc.path;
          MATINEE_TMDB_API_KEY = config.age.secrets.tmdb.path;
        }
      '';
      description = ''
        Files holding secret settings, keyed by variable name. Matinee reads
        `NAME_FILE` in place of any `NAME`, and systemd hands it the file as
        a credential, so the file can stay readable by root only.
        Surrounding whitespace is dropped. A secret replaces the setting of
        the same name.
      '';
    };
  };

  config = mkIf cfg.enable {
    assertions = [
      {
        assertion = lib.all envName.check (lib.attrNames cfg.settings ++ lib.attrNames cfg.secrets);
        message = "services.matinee.settings and services.matinee.secrets take environment variable names, such as MATINEE_TMDB_API_KEY.";
      }
      {
        assertion = publicUrl != null;
        message = "Set services.matinee.publicUrl to the https origin people open Matinee on.";
      }
      {
        assertion = publicUrl == null || httpsPublicUrl;
        message = "services.matinee.publicUrl must be an https:// URL. Put a proxy such as Caddy or tailscale serve in front of Matinee for TLS.";
      }
      {
        assertion = !(cfg.secrets ? PUBLIC_URL);
        message = "services.matinee.publicUrl isn't a secret. Set it as an option.";
      }
      {
        assertion = (cfg.oidc.issuerUrl == null) == (cfg.oidc.clientId == null);
        message = "Single sign-on needs both services.matinee.oidc.issuerUrl and services.matinee.oidc.clientId.";
      }
      {
        assertion = !(db.createLocally && dbSocket) || db.user == cfg.user;
        message = "With the local database, services.matinee.database.user must be services.matinee.user, which signs in over the socket.";
      }
    ];

    warnings =
      map (
        name:
        "services.matinee.settings.${name} ends up in the world-readable Nix store. Use services.matinee.secrets.${name}."
      ) (lib.filter (name: settings ? ${name}) secretNames)
      ++
        lib.optional (accel == "nvenc" && devices != null && devices != [ ])
          "services.matinee.accelerationDevices limits the service to ${lib.concatStringsSep ", " devices}. NVENC needs /dev/nvidia0, /dev/nvidiactl, /dev/nvidia-uvm, and /dev/nvidia-uvm-tools."
      ++
        lib.optional (cfg.passkeys == false && cfg.oidc.issuerUrl == null)
          "services.matinee.passkeys is false without services.matinee.oidc. Unless an admin set up single sign-on in the app, nobody can sign in, and setup can't create the admin account.";

    services.matinee.settings = mapAttrs (_: mkDefault) (
      {
        DATABASE_URL = databaseUrl;
        HOST = cfg.host;
        PORT = cfg.port;
        MATINEE_DATA_DIR = toString cfg.dataDir;
        MATINEE_TRANSCODE_DIR = toString cfg.transcodeDir;
        MATINEE_FFMPEG_PATH = lib.getExe' cfg.ffmpegPackage "ffmpeg";
        MATINEE_FFPROBE_PATH = lib.getExe' cfg.ffmpegPackage "ffprobe";
      }
      // optionalAttrs (cfg.publicUrl != null) { PUBLIC_URL = cfg.publicUrl; }
      // optionalAttrs (cfg.passkeys != null) { MATINEE_PASSKEYS_ENABLED = cfg.passkeys; }
      // optionalAttrs (cfg.oidc.issuerUrl != null) { MATINEE_OIDC_ISSUER_URL = cfg.oidc.issuerUrl; }
      // optionalAttrs (cfg.oidc.clientId != null) { MATINEE_OIDC_CLIENT_ID = cfg.oidc.clientId; }
      // optionalAttrs (cfg.oidc.displayName != null) {
        MATINEE_OIDC_DISPLAY_NAME = cfg.oidc.displayName;
      }
      // optionalAttrs (cfg.oidc.scopes != null) {
        MATINEE_OIDC_SCOPES = lib.concatStringsSep " " cfg.oidc.scopes;
      }
      // optionalAttrs (cfg.oidc.usernameClaim != null) {
        MATINEE_OIDC_USERNAME_CLAIM = cfg.oidc.usernameClaim;
      }
      // optionalAttrs (cfg.oidc.roleClaim != null) { MATINEE_OIDC_ROLE_CLAIM = cfg.oidc.roleClaim; }
      // optionalAttrs (cfg.oidc.allowSignUp != null) {
        MATINEE_OIDC_ALLOW_SIGN_UP = cfg.oidc.allowSignUp;
      }
      // optionalAttrs (accel != null) { MATINEE_HARDWARE_ACCELERATION = accel; }
      // optionalAttrs (cfg.transcoding.vaapiDevice != null) {
        MATINEE_VAAPI_DEVICE = cfg.transcoding.vaapiDevice;
      }
      // optionalAttrs (cfg.transcoding.qsvDevice != null) {
        MATINEE_QSV_DEVICE = cfg.transcoding.qsvDevice;
      }
    );

    users.users = mkIf (cfg.user == "matinee") {
      matinee = {
        isSystemUser = true;
        inherit (cfg) group;
        home = cfg.dataDir;
      };
    };
    users.groups = mkIf (cfg.group == "matinee") { matinee = { }; };

    services.postgresql = mkIf db.createLocally {
      enable = true;
      ensureDatabases = [ db.name ];
      ensureUsers = [
        {
          name = db.user;
          ensureDBOwnership = true;
          ensureClauses.login = true;
        }
      ];
    };

    networking.firewall.allowedTCPPorts = mkIf cfg.openFirewall [ cfg.port ];

    systemd.tmpfiles.rules = map (dir: "d ${dir} 0750 ${cfg.user} ${cfg.group} - -") externalDirs;

    systemd.services.matinee = {
      description = "Matinee media server";
      wantedBy = [ "multi-user.target" ];
      wants = [ "network-online.target" ] ++ optional db.createLocally "postgresql.target";
      requires = optional db.createLocally "postgresql.target";
      after = [ "network-online.target" ] ++ optional db.createLocally "postgresql.target";

      # systemd expands % specifiers in Environment=; only the credential
      # paths use one.
      environment =
        mapAttrs (_: v: lib.replaceStrings [ "%" ] [ "%%" ] (envValue v)) settings
        // mapAttrs' (name: _: nameValuePair "${name}_FILE" "%d/${name}") cfg.secrets;

      serviceConfig = {
        ExecStart = serverStart;
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        LoadCredential = mapAttrsToList (name: path: "${name}:${path}") cfg.secrets;
        Restart = "on-failure";
        RestartSec = 5;
        UMask = "0077";

        StateDirectory = mkIf (stateDirectory != null) stateDirectory;
        StateDirectoryMode = "0750";
        CacheDirectory = mkIf (cacheDirectory != null) cacheDirectory;
        CacheDirectoryMode = "0750";
        ReadWritePaths = externalDirs;

        CapabilityBoundingSet = "";
        NoNewPrivileges = true;
        LockPersonality = true;
        PrivateTmp = true;
        PrivateDevices = devices == [ ];
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectClock = true;
        ProtectControlGroups = true;
        ProtectHostname = true;
        ProtectKernelLogs = true;
        ProtectKernelModules = true;
        ProtectKernelTunables = true;
        RemoveIPC = true;
        RestrictAddressFamilies = [
          "AF_UNIX"
          "AF_INET"
          "AF_INET6"
          "AF_NETLINK"
        ];
        RestrictNamespaces = true;
        RestrictRealtime = true;
        RestrictSUIDSGID = true;
        SystemCallArchitectures = "native";
        SystemCallFilter = [
          "@system-service"
          "~@privileged"
        ];
        SystemCallErrorNumber = "EPERM";
        SupplementaryGroups =
          cfg.extraGroups
          ++ lib.optionals (devices != [ ]) [
            "video"
            "render"
          ];
      }
      // optionalAttrs (devices != null && devices != [ ]) {
        DevicePolicy = "closed";
        DeviceAllow = map (device: "${device} rw") devices;
      };
    };
  };
}
