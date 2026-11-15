<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">
    <img alt="matinee" src="brand/logo-light.svg" width="380">
  </picture>
</p>

<p align="center">
  A self-hosted media server for your folders of movies and shows.
</p>

---

Point Matinee at the folders your videos already live in. It groups the
files into movies and shows, fetches posters, cast, and episode details from
TMDB or TheTVDB, and picks up new files as Sonarr, Radarr, or Bazarr drop
them in. People sign in with a passkey or your OIDC provider and watch in
the browser, the Android app, or the iOS app. A file plays as it is when the device can
decode it. When it can't, the server copies the video and converts only
the audio, or transcodes on your GPU with jellyfin-ffmpeg, HDR tone mapping
included.

It's an early MVP. Expect breaking changes until the first release.

| Part                    | What it is                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- |
| [Server](apps/server)   | Hono and oRPC, Postgres, the library scanner, streaming and transcoding, sign-in |
| [Web](apps/web)         | The React client the server serves                                               |
| [Android](apps/android) | A native app for phones, tablets, and Android TV, with offline downloads         |
| [iOS](apps/ios)         | A native SwiftUI app for iPhone and iPad, with offline downloads                 |
| [Brand](brand)          | The logo, the wordmark, the app icons, and the script that renders them          |

Each one's README goes into detail. The server's covers configuration,
access groups, transcoding, and the API.

## Run it on NixOS

The flake has a package for `x86_64-linux` and a NixOS module that runs it
with a local Postgres.

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

In `host.nix`:

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

Builds are cached, so you can skip compiling:

```nix
nix.settings = {
  substituters = [ "https://zekurio.cachix.org" ];
  trusted-public-keys = [
    "zekurio.cachix.org-1:mv0mACvSLZtBkXXh5YDPPXmFBJ/eO+VkSzep6LJZrAg="
  ];
};
```

The input follows `main`. Pin a release with its tag, like
`github:zekurio/matinee/v0.0.1`.

The server listens on `127.0.0.1:8420` and the module wants an https
`publicUrl`, so put a reverse proxy in front:

```nix
services.caddy = {
  enable = true;
  virtualHosts."watch.example.com".extraConfig = "reverse_proxy 127.0.0.1:8420";
};
```

On a tailnet, `tailscale serve --bg 8420` works too. Use the
`https://<host>.<tailnet>.ts.net` address as `publicUrl`.

Data lives in `/var/lib/matinee` and encodes in
`/var/cache/matinee/transcodes`. The service can't see `/home`, so put
libraries somewhere like `/srv` or `/mnt`. Any variable from
[`.env.example`](.env.example) goes in `services.matinee.settings`, and
secret files go in `secrets`.

Open the `publicUrl` and `/setup` walks you through the admin account, the
GPU, and the first libraries. Without OIDC, the setup token is in
`journalctl -u matinee`.

Not on NixOS? See
[Running in production](apps/server/README.md#running-in-production).

## Develop

```sh
nix develop        # or `direnv allow`
pnpm install
pnpm dev           # server on :8420, web app on http://localhost:5173
```

The dev shell has Node 24, pnpm 11, jellyfin-ffmpeg, `just`, and a Postgres
on a Unix socket in `data/postgres`. It creates `.env` from `.env.example`
the first time. Migrations run when the server starts. On localhost,
`/setup` doesn't ask for a token. `matinee-postgres stop` stops the
database.

Run `pnpm verify` before you commit. It checks formatting, runs oxlint and
the type checker, and fails if the Android or iOS API client is out of date.
[`AGENTS.md`](AGENTS.md) has the repository's conventions, for people and
coding agents alike. The Android app builds in its own shell, see
[its README](apps/android/README.md#build). The iOS app needs a Mac and
Xcode, see [its README](apps/ios/README.md#build).

| Command                          | What it does                                                         |
| -------------------------------- | -------------------------------------------------------------------- |
| `pnpm db:generate --name <what>` | Writes a migration for a change in `packages/db/src/schema`          |
| `pnpm api:android`               | Generates the Android API client after a contract change             |
| `pnpm api:ios`                   | Generates the iOS API client after a contract change                 |
| `nix build`                      | Builds the server package                                            |
| `nix flake check`                | Builds it and runs the NixOS module's tests                          |
| `nix develop .#android`          | Enters a shell with a JDK and the Android SDK                        |
| `just`                           | Lists the shortcuts, including `just android ...` and `just ios ...` |
| `just tag <version>`             | Releases that version, see [Release](#release)                       |

| Command                          | What it does                              |
| -------------------------------- | ----------------------------------------- |
| `pnpm db:generate --name <what>` | Writes a migration for a schema change    |
| `pnpm api:android`               | Regenerates the Android API client        |
| `nix build`                      | Builds the server package                 |
| `nix flake check`                | Builds it and runs the NixOS module tests |
| `nix develop .#android`          | Shell with a JDK and the Android SDK      |
| `just`                           | Lists the shortcuts                       |
| `just tag <version>`             | Cuts a release, see [Release](#release)   |

When `pnpm-lock.yaml` changes, `nix build` fails and prints the new hash.
Put it in `pnpmDepsHash` in `nix/package.nix`.

<details>
<summary>Coming from the old devenv shell</summary>

The dev database used to live in `.devenv/state/matinee-postgres`, and the
new shell won't start while it's there. Move it first:

```sh
pg_ctl -D .devenv/state/matinee-postgres -w stop  # from the old shell, if running
mkdir -p data
mv .devenv/state/matinee-postgres data/postgres
direnv allow
```

Don't delete `.devenv` until the database has moved.

The early migrations were squashed into `0000_initial_schema`. A database
with the old history can't apply it, so back up what you need and recreate
it.

</details>

## Release

The server, the web app, and both native apps share one version, the
`version` in the root `package.json`. The Nix package, Android build, and
iOS project generator read it from there. A release is a `v<version>` tag on `main`:

```sh
just tag 0.2.0
```

This bumps `package.json`, commits `chore: release v0.2.0`, tags it, and
pushes. You need to be on a clean `main` that matches `origin/main`. Keep
minor and patch under 100, since the Android version code is
`major * 10000 + minor * 100 + patch`.

The tag runs [`release.yml`](.github/workflows/release.yml). It checks the
tag against `package.json`, runs `nix flake check`, pushes the package to
Cachix, and builds and signs the Android APKs. Then it drafts a GitHub
release with one APK per ABI, a universal one, and `checksums.txt`. Try
the APKs on a phone and a TV before you publish the draft.

The workflow needs `CACHIX_AUTH_TOKEN` and a `release` environment with
these secrets:

| Secret                      | Value                          |
| --------------------------- | ------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 matinee.jks`       |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password          |
| `ANDROID_KEY_ALIAS`         | The key alias, `matinee` below |
| `ANDROID_KEY_PASSWORD`      | The key password               |

```sh
keytool -genkeypair -v -keystore matinee.jks -alias matinee \
  -keyalg RSA -keysize 4096 -validity 10000
```

Give the `release` environment a required reviewer to approve each
release's signing by hand.

## Repository layout

```
apps/
  server/      Hono server: oRPC and REST, auth, library scanner, streaming
  web/         React web client (Vite, TanStack Router and Query)
  android/     Android app (Kotlin, Compose, Media3), a Gradle project
  ios/         iPhone and iPad app, SwiftUI with a shared Swift package
packages/
  contracts/   The oRPC contract and its schemas, shared by the server and clients
  client/      The typed client every TypeScript app uses
  db/          Drizzle schema and migrations
  ui/          shadcn components on Base UI, and the theme
brand/         Logo, wordmark, app icons
tools/         The lint rules and the release scripts
nix/           The package, the NixOS module and its tests, the dev shells
```

## License

MIT, except `apps/android`, which is GPL-3.0 because it ships GPL builds of
FFmpeg and mpv. See [LICENSE](LICENSE) and
[apps/android/LICENSE](apps/android/LICENSE).
