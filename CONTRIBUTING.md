# Contributing

Matinee is an early MVP with one maintainer. Review time is the bottleneck,
so a small PR that fixes one thing gets merged faster than a big one.

What lands easily:

- Bug fixes, with steps to reproduce
- Translations, see [Translations](apps/web/README.md#translations)
- Fixes for a specific device, browser, GPU, or Android TV box
- Docs that are wrong or missing a step

Open an issue before you start on a feature, a new metadata provider, a
UI redesign, or a change to how playback decides between direct play, a
copied stream, and an encode. Some of these are planned a certain way, and
[Not built yet](apps/server/README.md#not-built-yet) lists what's known to
be missing. A PR for a feature nobody agreed on may be closed even if it
works.

## Issues

Use the bug report or feature request form. Search open and closed issues
first, and keep one problem per issue. Questions about setup or how
something works go in
[Discussions](https://github.com/zekurio/matinee/discussions/categories/q-a).

For a playback bug, say what the file is (container, video and audio
codecs, HDR or not), the Playback and Reason lines from the player's
Playback stats, and which GPU the server transcodes on. Most playback bugs
depend on those.

Don't open a public issue for a security problem. Report it privately from
the [Security tab](https://github.com/zekurio/matinee/security/advisories/new).

## Setup

```sh
nix develop        # or `direnv allow`
pnpm install
pnpm dev           # server on :8420, web app on http://localhost:5173
```

The dev shell has Node 24, pnpm 11, jellyfin-ffmpeg, `just`, and a Postgres
on a Unix socket in `data/postgres`. It creates `.env` from `.env.example`
the first time. Migrations run when the server starts. `/setup` asks for
the setup token the server logs, even on localhost. `matinee-postgres stop`
stops the database.

Without Nix, install Node 24 and pnpm 11, copy `.env.example` to `.env`,
and point `DATABASE_URL` at your own Postgres.

| Command                          | What it does                              |
| -------------------------------- | ----------------------------------------- |
| `pnpm db:generate --name <what>` | Writes a migration for a schema change    |
| `pnpm api:android`               | Regenerates the Android API client        |
| `pnpm api:ios`                   | Regenerates the Apple apps' API client    |
| `pnpm api:dart`                  | Regenerates the Flutter app's API client  |
| `nix build`                      | Builds the server package                 |
| `nix flake check`                | Builds it and runs the NixOS module tests |
| `nix develop .#android`          | Shell with a JDK and the Android SDK      |
| `nix develop .#flutter`          | Shell with Flutter and the Android SDK    |
| `just`                           | Lists the shortcuts                       |

The native apps build on their own, as their READMEs say:
[Android](apps/android/README.md#build), [iOS](apps/ios/README.md),
[Samsung TV](apps/tizen/README.md#build), and the
[Flutter app](apps/flutter/README.md#build) that will replace the first two.

[`AGENTS.md`](AGENTS.md) has the conventions: where code goes, the lint
rules and what they want from you, how translations, queues, and live
updates work, and what the server decides instead of the clients. Read it
before your first PR. It's written for coding agents, but it's the same
list a reviewer checks against.

## Before you open a PR

Run `pnpm verify`. CI runs the same checks plus `pnpm audit` and the web
build.

There are no automated tests for the server or web app yet, so try the
flows you touched in a browser. Then, depending on what changed:

| You changed                         | Also do                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| A contract in `packages/contracts`  | `pnpm api:android`, `pnpm api:ios`, and `pnpm api:dart`, and commit the clients |
| The Drizzle schema in `packages/db` | `pnpm db:generate --name <what>`. Never edit a merged migration                 |
| Text a user reads                   | Add it to `locales/en/` and translate it in the other languages                 |
| `pnpm-lock.yaml`                    | Update `pnpmDepsHash` in `nix/package.nix` from `nix build`                     |
| `nix/`                              | `nix flake check`                                                               |
| `apps/android`                      | `just android build` and `just android test`                                    |
| `apps/flutter`                      | `just flutter check` and `just flutter build`                                   |

Don't bump the version. `just tag` does that when a release goes out.

## Pull requests

**One problem per PR.** Include everything that fix needs across the
contract, server, web, and Android. Put cleanup, refactors, and a second
fix in their own PRs.

**Use a conventional title.** PRs are squash merged, so the title becomes
the commit on `main`. Write `type(scope): summary` in plain words, lowercase,
saying what changes for the user:

- `fix(web): make touch scrubbing on the seek bar precise`
- `feat(android): add picture-in-picture to the player`
- `perf(server): leave subtitle conversion to the background job`

Types are `feat`, `fix`, `perf`, `refactor`, `docs`, `build`, `ci`, and
`chore`. Scopes are usually `web`, `server`, `android`, or `nix`. Leave the
scope out when a change spans several.

**Show that it works.** Say how you found the bug, what you checked, and
what you saw. "verify passes" only says it compiles. UI changes need before
and after screenshots, and a short recording if it's about motion or
gestures. Upload them to the PR, don't commit them.

**Write the description yourself.** Coding agents are fine, and this repo
is set up for them. Say which one you used. You still need to understand
the change and explain it in a few sentences. A long generated summary
gets skimmed, not read.

## License

Code you contribute is under the license of the part it lands in: MIT for
most of the repository, and GPL-3.0 for `apps/android` and `apps/ios`,
except MatineeCore, which stays MIT. See [LICENSE](LICENSE),
[apps/android/LICENSE](apps/android/LICENSE), and
[apps/ios/LICENSE](apps/ios/LICENSE).
