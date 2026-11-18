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

Matinee reads the folders your videos are already in, groups them into
movies and shows, and pulls metadata from TMDB or TheTVDB. New files from
Sonarr, Radarr, or Bazarr show up on their own. People sign in with a
passkey or OIDC and watch in the browser, the Android app, or the desktop
app. Files play
as they are when the device can decode them. Otherwise the server copies
the video and converts the audio, or transcodes on the GPU with
jellyfin-ffmpeg.

It's an early MVP. Expect breaking changes until the first release.

| Part                    | What it is                                                |
| ----------------------- | --------------------------------------------------------- |
| [Server](apps/server)   | Hono and oRPC on Postgres. Scanning, streaming, sign-in   |
| [Web](apps/web)         | The React client, served by the server                    |
| [Android](apps/android) | Phones, tablets, and Android TV, with offline downloads   |
| [Desktop](apps/desktop) | Linux, macOS, and Windows, playing with mpv               |
| [Brand](brand)          | Logo, wordmark, app icons, and the scripts that draw them |

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

Without Nix, install Node 24 and pnpm 11, copy `.env.example` to `.env`,
and point `DATABASE_URL` at your own Postgres.

Run `pnpm verify` before you commit. [`AGENTS.md`](AGENTS.md) has the
conventions, and [`CONTRIBUTING.md`](CONTRIBUTING.md) covers issues and
pull requests.

| Command                          | What it does                              |
| -------------------------------- | ----------------------------------------- |
| `pnpm db:generate --name <what>` | Writes a migration for a schema change    |
| `pnpm api:android`               | Regenerates the Android API client        |
| `nix build`                      | Builds the server package                 |
| `nix flake check`                | Builds it and runs the NixOS module tests |
| `nix develop .#android`          | Shell with a JDK and the Android SDK      |
| `nix develop .#desktop`          | Shell with CMake, Qt, and libmpv          |
| `nix build .#matinee-desktop`    | Builds the desktop app                    |
| `just`                           | Lists the shortcuts                       |

When `pnpm-lock.yaml` changes, `nix build` fails and prints the new hash.
Put it in `pnpmDepsHash` in `nix/package.nix`.

## License

MIT, except `apps/android` and `apps/desktop`, which are GPL-3.0: the
Android app ships GPL builds of FFmpeg and mpv, and the desktop app links
mpv. See [LICENSE](LICENSE), [apps/android/LICENSE](apps/android/LICENSE),
and [apps/desktop/LICENSE](apps/desktop/LICENSE).
