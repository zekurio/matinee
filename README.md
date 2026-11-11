<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">
    <img alt="matinee" src="brand/logo-light.svg" width="380">
  </picture>
</p>

<p align="center">
  A self-hosted media server for your own folders of movies and shows.
</p>

---

Point Matinee at the folders your videos already live in. It groups the
files into movies and shows, fetches posters, cast, and episode details from
TMDB or TheTVDB, and picks up new files as Sonarr, Radarr, or Bazarr drop
them in. People sign in with a passkey or your OIDC provider and watch in
the browser or the Android app. A file plays as it is when the device can
decode it. When it can't, the server copies the video and converts only
the audio, or transcodes on your GPU with jellyfin-ffmpeg, HDR tone mapping
included.

Matinee is an early MVP. Expect rough edges and breaking changes until a
first release.

| Part                    | What it is                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- |
| [Server](apps/server)   | Hono and oRPC, Postgres, the library scanner, streaming and transcoding, sign-in |
| [Web](apps/web)         | The React client the server serves                                               |
| [Android](apps/android) | A native app for phones, tablets, and Android TV, with offline downloads         |
| [Brand](brand)          | The logo, the wordmark, the app icons, and the script that renders them          |

Each one's README goes into detail. The server's covers configuration,
access groups, transcoding, and the API.

## Run it on NixOS

The flake has the server as a package for `x86_64-linux` and a NixOS module
that runs it with a local PostgreSQL. Add the input and the module:

```nix
{
  inputs.matinee.url = "github:zekurio/matinee";

  outputs = { nixpkgs, matinee, ... }: {
    nixosConfigurations.host = nixpkgs.lib.nixosSystem {
      modules = [ matinee.nixosModules.default ./host.nix ];
    };
  };
}
```

Then turn it on in `host.nix`:

```nix
services.matinee = {
  enable = true;
  publicUrl = "https://watch.example.com";
  extraGroups = [ "media" ];         # a group that can read the libraries
  transcoding.hardwareAcceleration = "qsv";
  oidc = {                           # optional, passkeys work without it
    issuerUrl = "https://id.example.com";
    clientId = "matinee";
    displayName = "Pocket ID";
  };
  secrets = {
    MATINEE_OIDC_CLIENT_SECRET = config.sops.secrets.matinee-oidc.path;
    MATINEE_TMDB_API_KEY = config.sops.secrets.tmdb.path;
  };
};
```

The package builds with the flake's own nixpkgs and is pushed to a binary
cache. To download it instead of building it, add the cache:

```nix
nix.settings = {
  substituters = [ "https://zekurio.cachix.org" ];
  trusted-public-keys = [
    "zekurio.cachix.org-1:mv0mACvSLZtBkXXh5YDPPXmFBJ/eO+VkSzep6LJZrAg="
  ];
};
```

The server listens on `127.0.0.1:8420`, and the module requires an https
`publicUrl`, so put a reverse proxy in front. With Caddy on the same host:

```nix
services.caddy = {
  enable = true;
  virtualHosts."watch.example.com".extraConfig = "reverse_proxy 127.0.0.1:8420";
};
```

On a tailnet, `tailscale serve --bg 8420` does the same on the machine's
`https://<host>.<tailnet>.ts.net` address, which is then the `publicUrl`.

Data goes in `/var/lib/matinee` and encodes in
`/var/cache/matinee/transcodes`. The service can't see `/home`, so keep the
libraries under a path like `/srv` or `/mnt`. Any variable from
[`.env.example`](.env.example) goes in `services.matinee.settings`, and any
secret file in `secrets`.

Open the `publicUrl` and `/setup` walks you through the admin account, the
GPU, and the first libraries. Without OIDC, the setup token is in
`journalctl -u matinee`.

Not on NixOS? `pnpm build` makes a bundle that runs on Node 24. See
[Running in production](apps/server/README.md#running-in-production).

## Develop

The flake's dev shell has Node 24, pnpm 11, jellyfin-ffmpeg, `just`, and a
Postgres for this checkout on a Unix socket. It creates `.env` from
`.env.example` on first entry.

```sh
nix develop        # or `direnv allow` once, to enter it on cd
pnpm install
pnpm dev           # server on :8420, web app on http://localhost:5173
```

The first visit goes to `/setup`, which skips the setup token on
localhost. The server applies migrations on start. Stop the database with
`matinee-postgres stop`; its files are in `data/postgres`.

Run `pnpm verify` before you commit. It checks formatting, runs oxlint and
the type checker, and fails if the Android API client is out of date.
[`AGENTS.md`](AGENTS.md) has the repository's conventions, for people and
coding agents alike. The Android app builds in its own shell, see
[its README](apps/android/README.md#build).

| Command                          | What it does                                                |
| -------------------------------- | ----------------------------------------------------------- |
| `pnpm db:generate --name <what>` | Writes a migration for a change in `packages/db/src/schema` |
| `pnpm api:android`               | Generates the Android API client after a contract change    |
| `nix build`                      | Builds the server package                                   |
| `nix flake check`                | Builds it and runs the NixOS module's tests                 |
| `nix develop .#android`          | Enters a shell with a JDK and the Android SDK               |
| `just`                           | Lists the shortcuts, including `just android ...`           |

After `pnpm-lock.yaml` changes, `nix build` fails and prints the new
dependency hash. Put it in `pnpmDepsHash` in `nix/package.nix`.
`nix flake update nixpkgs` updates the package's and the shell's toolchain
together.

Without Nix, install Node 24 and pnpm 11, copy `.env.example` to `.env`, and
point `DATABASE_URL` at a Postgres of your own.

<details>
<summary>Coming from the old devenv shell</summary>

The dev database used to live in `.devenv/state/matinee-postgres`. The new
shell won't start while it's still there. Stop it from the old shell, then
move it:

```sh
pg_ctl -D .devenv/state/matinee-postgres -w stop  # from the old shell, if running
mkdir -p data
mv .devenv/state/matinee-postgres data/postgres
direnv allow
```

Don't delete `.devenv` before the database has moved.

The early migrations were later squashed into `0000_initial_schema`. A
database with the old migration history can't take it. Back up what you
need and create the database again, which deletes its data.

</details>

## Repository layout

```
apps/
  server/      Hono server: oRPC and REST, auth, library scanner, streaming
  web/         React web client (Vite, TanStack Router and Query)
  android/     Android app (Kotlin, Compose, Media3), a Gradle project
packages/
  contracts/   The oRPC contract and its schemas, shared by the server and clients
  client/      The typed client every TypeScript app uses
  db/          Drizzle schema and migrations
  ui/          shadcn components on Base UI, and the theme
brand/         Logo, wordmark, app icons
nix/           The package, the NixOS module and its tests, the dev shells
```

## License

MIT, see [LICENSE](LICENSE), except the Android app in `apps/android`, which
is GPL-3.0 (see [its LICENSE](apps/android/LICENSE)) because it plays DTS
and TrueHD with a GPL build of FFmpeg and can play with mpv.
