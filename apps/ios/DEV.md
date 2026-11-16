# Shared iOS development server

The shared server on this Mac is **http://localhost:18420**. Simulators use
that exact URL, which is also `PUBLIC_URL`. HTTP listens on IPv6 loopback
`::1`, not the LAN. No app code is part of this fixture.

Everything persistent is under `~/.t3/scratch/matinee-ios-dev/`. Do not run
a second fixture, change its port, or reset it while another agent is testing.
Lifecycle commands are serialized with a file lock.

## Accounts and simulator sign-in

| Username     | Role  | Libraries                        |
| ------------ | ----- | -------------------------------- |
| `ios-admin`  | Admin | Movies, Restricted movies, Shows |
| `ios-viewer` | User  | Movies, Shows                    |

There are no passwords, passkeys, or OIDC identities on these fixture accounts.
Do not try the normal browser login. These accounts exist only for local tests.

From **any checkout** containing these scripts:

```sh
# The simulator starts the normal device grant and displays a user code.
apps/ios/scripts/dev/approve BCDF-GHJK ios-admin
# Or exercise limited access:
apps/ios/scripts/dev/approve BCDF-GHJK ios-viewer
```

The app posts `{ "platform": "ios", "name": "iPhone Simulator" }` to
`/api/v1/auth/device`, displays `userCode`, then polls
`/api/v1/auth/device/token` with `{ "deviceCode": "..." }` at the returned
interval. After approval the poll returns `status: "approved"`, `token`, and
`user`. Store that token normally and send `Authorization: Bearer <token>`.
A code expires after ten minutes. The app must support device-code sign-in;
this helper does not automate the browser PKCE flow.

For curl:

```sh
TOKEN=$(apps/ios/scripts/dev/token ios-admin)
curl -fsS -H "Authorization: Bearer $TOKEN" \
  http://localhost:18420/api/v1/home/continue-watching
unset TOKEN
```

`token` creates a random session secret and inserts its **base64url SHA-256**
hash directly into Postgres, matching `auth/session.ts` and `auth/tokens.ts`.
It expires after 30 days of inactivity. `approve` gets such a bootstrap
session, then calls the real authenticated
`POST /api/v1/auth/device/{userCode}/approve` endpoint. The server itself
consumes the device code and issues the app session. Only bootstrap account,
setup, access, watch, favorite, and CLI session rows are written directly;
no auth guard is disabled and no server code is changed.

The database trusts this Mac user on a mode-0700 Unix socket, has no TCP
listener, and is not a production auth configuration. Never publish fixture
tokens or use these helpers against another database.

## Commands

All entry points live in `apps/ios/scripts/dev/`. They resolve paths from
their own location and share one fixed state root, independent of cwd.

| Script                   | Action                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`                  | Clone the pinned server if absent, install/build if needed, start Postgres and detached Node, wait for health. Idempotent.                                                                                                         |
| `stop`                   | Stop Node gracefully, then Postgres. Leaves media and state intact.                                                                                                                                                                |
| `reseed --yes`           | **Destructive shared reset.** Stop everything, delete Postgres and generated server data, retain/generate media, start, seed accounts/libraries/access/watch/favorites, scan, queue trickplay. All previous tokens become invalid. |
| `approve CODE [account]` | Approve a simulator's live device code. Defaults to `ios-admin`.                                                                                                                                                                   |
| `token [account]`        | Print a new bearer token only. Defaults to `ios-admin`.                                                                                                                                                                            |
| `verify`                 | Real curl device grants for both accounts, approval, Home/favorites/library counts, direct CLI tokens, source decisions, HLS playlist and encoded segment. Creates a few test sessions.                                            |
| `run`                    | Common Nix launcher, also accepts those action names.                                                                                                                                                                              |
| `media.py`               | Idempotent ffmpeg media generator, used by reset. Delete a media file before reset to regenerate it.                                                                                                                               |
| `dev.py`, `verify.py`    | Implementations used by the launchers.                                                                                                                                                                                             |

Requirements are Nix, Python 3, Git, and `ffmpeg`/`ffprobe` on PATH. The
launcher pins Node 24, pnpm 11, and Postgres 17 to the nixpkgs revision in
the server's lockfile. The pinned repository's `nix develop` default is
Linux-only, so it cannot supply a Darwin shell here. The existing Mac
ffmpeg has libx264, libx265, AC-3, Opus, drawtext and VideoToolbox.

## Server and state

The dedicated independent clone is `~/.t3/scratch/matinee-ios-dev/server`,
detached at `7709f47a5a6d1e72959c8a941c4caf12e8c63b28`, the merge of `main`
that dropped request notifications and turned Discover's rows into browses.
Its database migrated from the previous pin without a reseed. It does not
borrow Git objects from an agent worktree. The production build serves the web
client and API in one Node process, without Vite or file watchers. This
avoids rebuilds and extra processes during hours of concurrent simulator use.

Node starts with a new session, stdin closed and logs redirected. It was
verified healthy in a later shell with parent PID 1. Postgres uses `pg_ctl`.
This survives shell/session exit, **not a reboot**, and has no automatic
restart on crash. Run `start` after reboot. Do not delete the dedicated clone.

| Path under the state root      | Contents                                           |
| ------------------------------ | -------------------------------------------------- |
| `server/`                      | Pinned checkout, node_modules, production bundles  |
| `postgres/`, `socket/`         | Database cluster and private Unix socket           |
| `media/`                       | Generated synthetic media and subtitle fixtures    |
| `data/`                        | Artwork, subtitles, trickplay and transcode caches |
| `server.log`, `postgres.log`   | Runtime logs, appended across restarts             |
| `build.log`, `seed.log`        | Initial build/reset command output from setup      |
| `server.pid`, `lifecycle.lock` | Process/lifecycle bookkeeping                      |
| `metadata.env`                 | Optional private provider keys, never committed    |

To update the running server deliberately, coordinate with the other agents:

```sh
apps/ios/scripts/dev/stop
cd ~/.t3/scratch/matinee-ios-dev/server
git fetch /path/to/a/current/matinee/checkout <commit>
git checkout --detach FETCH_HEAD
# Use the same nix shell package arguments as scripts/dev/run:
nix shell nixpkgs#nodejs_24 nixpkgs#pnpm_11 -c sh -c \
  'pnpm install --frozen-lockfile && pnpm build'
# Back in any checkout:
apps/ios/scripts/dev/start
```

Review migrations before updating. To reproduce the update on a fresh
machine, also change `PIN` in `dev.py` and document the new revision.
`start` never silently advances an existing checkout. Reset to reseed against
the new schema when necessary. Back up `postgres/` before a destructive update.

## Library fixtures

These are labeled test patterns, **not the real films or episodes**. Every
video draws its file stem and advancing frame timecode, and has an audio
tone. 15 videos, nine movie files grouped into eight
movie titles plus one show. Most are 24 seconds at 640x360 and 10 fps.

| Library / title                         | Exercise                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movies / The Matrix, 1999               | 22-minute H.264/AAC MP4 with continuous timecode, 440/880 Hz English/German audio, English/German embedded text. Seeking, resume, trickplay.                                                                                        |
| Movies / The Matrix Alternate           | Second short MP4 version in `The Matrix (1999)/Extras`, grouped under the same movie without metadata. It is labeled as an extra by the server, not a theatrical/director's-cut edition.                                            |
| Movies / Back to the Future, 1985       | H.264/AAC MP4, two audio languages, two embedded mov_text subtitle languages.                                                                                                                                                       |
| Movies / Toy Story, 1995                | H.264/AAC MP4 direct play, external matching `.en.srt`.                                                                                                                                                                             |
| Movies / MPV Styled Verification        | Two-minute 640x360, 10 fps H.264/AAC mono MKV. Identical styled ASS tracks embedded as German and external as `.en.ass`: bold yellow Arial 32, positioned at (80,140), seconds 1-115. Checks mpv styling for both subtitle sources. |
| Movies / Interstellar, 2014             | HEVC MKV, AC-3 5.1, two audio languages and embedded English/German SRT. Remux selection verified with an MP4-only device.                                                                                                          |
| Restricted movies / Blade Runner, 1982  | 3840x2160 HEVC MKV, AC-3 5.1, eight seconds.                                                                                                                                                                                        |
| Restricted movies / Dune, 2021          | 10-bit HEVC MKV tagged BT.2020/PQ, AC-3 5.1, twelve seconds. Synthetic HDR tags, not mastered HDR imagery or Dolby Vision.                                                                                                          |
| Restricted movies / Jurassic Park, 1993 | MPEG-2 video and Opus in MKV, two audio languages, English/German SRT and embedded PGS. Requires video encode for AVPlayer. The generated PGS displays a white bitmap bar at seconds 1-8; decoded successfully with ffmpeg overlay. |
| Shows / Breaking Bad, 2008              | `Season 01` and `Season 02`, S01E01-E03 and S02E01-E03, each one minute, H.264/AAC MP4.                                                                                                                                             |

To regenerate just the styled fixture safely outside the shared state:

```sh
python3 apps/ios/scripts/dev/media.py --root /tmp/matinee-media --only-styled
```

The scanner reads the actual library folders and creates the title/file rows.
Movie folders with one video group by folder; shows group by their top-level
folder and use season folders plus SxxExx episode names. Putting the second
Matrix file under Extras is intentional: two ordinary files in the same
movie folder otherwise become separate titles without a provider match.

Both accounts start with S01E01 and S01E02 watched, S01E03 in Next up, Toy
Story watched, both Matrix files partly watched, and The Matrix favorited.
Continue watching has two rows and Next up one. Reset queues `make-trickplay`;
the long file's JPEG sprite sheets were generated under `data/trickplay`.

## Metadata and transcoding

No TMDB or TheTVDB credentials were found in the process environment, the
original clone at `~/Git/matinee`, or sibling Matinee worktrees' `.env` files.
Libraries currently have no metadata provider. Titles scan with names and
years, but no provider artwork, cast, or episode summaries.

To enable metadata, create a mode-0600 `metadata.env` under the state root:

```sh
MATINEE_TMDB_API_KEY=your_actual_key
# Alternative provider:
# MATINEE_TVDB_API_KEY=your_actual_key
# MATINEE_TVDB_PIN=your_pin_if_required
```

Restart, then select TMDB or TheTVDB on each library in admin settings and
refresh metadata. Merely setting a key does not select a library provider.
Reset recreates libraries without providers.

VideoToolbox is configured and detected on this Apple Silicon Mac. The
smoke test requested MPEG-2-to-H.264 HLS through the server and fetched an
actual segment. Direct and remux **selection** also passed. Later app and
package checks cover playback and offline versions, as recorded in the app's
README; this fixture smoke test alone does not cover either.
The server README warns copied streams currently lack Safari byte-range
support, so a remux decision alone does not prove AVPlayer can play it.

This Mac has stock ffmpeg 9.0.2, not jellyfin-ffmpeg. Basic encodes work;
Jellyfin-specific pause/resume throttling and tone mapping patches are not
verified. Do not treat the synthetic HDR file as a color-accuracy test.

## Verification

`verify` passed against the live detached server after a clean reset,
including both real device-code exchanges and a video encode. The health
endpoint is `http://localhost:18420/api/health`; REST docs are
`http://localhost:18420/api/v1/openapi.json`. No simulator UI testing was
needed to provision this service.
