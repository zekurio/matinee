# Matinee

A self-hosted media server. You point it at folders of video files, sign in
with a passkey or your OIDC provider, and watch in the browser.

This is the MVP. It scans libraries, fetches names, posters, and episode
details from a metadata provider, and plays files as they are. There is no
transcoding yet.

## Layout

```
apps/
  server/      Hono server: oRPC handler, auth, library scanner, video streams
  web/         React web client (Vite, TanStack Router + Query)
packages/
  contracts/   oRPC contract and zod schemas shared by server and clients
  client/      Typed client factory for any app (web now, TV and mobile later)
  db/          Drizzle schema and migrations (Postgres)
  ui/          shadcn components on Base UI, plus the theme
```

The contract in `packages/contracts/src/contract.ts` is the API. The server
implements it with `implement(contract)` and clients call it through
`createMatineeClient()`, so a rename or a schema change fails typechecking on
both ends. Video bytes and the OIDC redirects are plain HTTP routes, listed in
`packages/contracts/src/paths.ts`.

## Development

Needs Node 24 and pnpm 11. With [devenv](https://devenv.sh) and direnv, `cd`
into the repo and the shell starts a repo-local Postgres on a Unix socket and
exports `DATABASE_URL`, `PORT`, and `PUBLIC_URL`.

```sh
pnpm install
pnpm dev          # server on :8420, web on :5173
```

Open http://localhost:5173. The first visit goes to `/setup`, where you create
the admin account with a passkey (or OIDC, if configured). Loopback URLs skip
the setup token.

The server applies migrations on start. After changing
`packages/db/src/schema.ts`, generate a migration with a descriptive name:

```sh
pnpm db:generate --name add_watch_progress
```

Run `pnpm verify` (format check, lint, typecheck) before committing.

Without devenv, copy `.env.example` to `.env` and point `DATABASE_URL` at your
own Postgres.

## Configuration

Server settings are environment variables, documented in `.env.example`. The
ones that matter for a real deployment:

- `PUBLIC_URL`: the https origin people use. Passkeys only work on this origin.
- `MATINEE_WEB_DIST`: path to the built web app, served by the server.
- `MATINEE_WATCH_LIBRARIES` and `MATINEE_SCAN_INTERVAL_HOURS`: when libraries
  get scanned. See [Scanning](#scanning).

Single sign-on is set up by an admin under Settings → Authentication, and takes
effect on the next sign-in without a restart. The redirect URI to register with
the provider is `$PUBLIC_URL/api/auth/oidc/callback`. The `MATINEE_OIDC_*`
variables are optional defaults for that form: an empty field falls back to
them. Set them if the admin account itself should be created through OIDC,
since settings can't be opened before setup.

## Scanning

A scan looks only at the folders it is given and writes only what changed:
new and changed files, files that are gone, their subtitle files, and the
titles they belong to. Scans run one at a time. They start from:

- The watcher, for the folders that changed. See below.
- A full scan of every library a minute after the server starts, for what
  changed while it was down.
- A full scan every `MATINEE_SCAN_INTERVAL_HOURS`, 12 by default, for what
  the watcher can't see. 0 turns it off.
- Scan now in Settings → Libraries, and adding or editing a library.

The watcher watches every folder in a library. Once a library's files have
stopped changing for 10 seconds, it scans a folder that appeared with
everything in it, and for a folder where a video or subtitle file came,
changed, or went, just that folder's own entries. A change in a `Subs`
folder rescans the folder of its videos. An import from Sonarr or Radarr, or
a subtitle from Bazarr, shows up on its own that way. Watching uses inotify,
with one watch per folder. Two limits:

- inotify only sees changes made on the same machine. On an NFS or SMB share
  that another host writes to, nothing fires, and changes show up with the
  timed scan or Scan now.
- A large library can run out of watches. The server logs a warning; raise
  `fs.inotify.max_user_watches` with sysctl and restart.

`MATINEE_WATCH_LIBRARIES=false` turns watching off. The startup and timed
scans still run.

A file that was moved or renamed keeps its row, and with it everyone's watch
progress, when one scan sees both its old and new path: same size, and the
same file name or the same modification time. Its subtitle files keep their
rows too when they move with it.

Scans skip hidden entries and NAS system folders such as `@eaDir` and
`#recycle`. So that storage going away doesn't empty a library, a scan:

- Skips a library folder that is missing, can't be read, or is empty while it
  still has files, which usually means a share isn't mounted. It logs a
  warning. If the folder really is empty now, remove it from the library.
  This only covers library folders, so point a library at a share's mount
  point, not at a folder above it.
- Keeps the files and subtitles below a folder it couldn't list completely.
- Deletes nothing when the server stops partway through.

## Metadata

Each movies or shows library picks one metadata provider and a language when
it is created or edited:

- TMDB: movies and shows, with episode stills and logos. Radarr matches on
  it. Needs `MATINEE_TMDB_API_KEY`.
- TheTVDB: shows in the season order Sonarr uses, plus movies. Needs
  `MATINEE_TVDB_API_KEY`, and `MATINEE_TVDB_PIN` for user-supported keys.
- AniList: anime, with no key. It names and illustrates the show only, so
  episodes keep their file names, and each AniList entry covers a single
  season.

A scan groups files into titles: a show is a top-level folder, a movie is a
folder holding one video (or a lone file), and `Season 2` folders or `S02E05`
in file names give episode numbers. After the scan, titles that are new,
unmatched for a day, gained files, or are 30 days old get fetched again.
In the background, ffprobe reads the codecs, audio tracks, and subtitles of
files that are new or changed, a few at a time. A file it can't read is
left alone until it changes.

Matching tries, in order, a provider id in the folder name (`{tvdb-81189}`,
`[tmdbid-603]`, `{imdb-tt0133093}`, as Sonarr, Radarr, and Jellyfin write
them), the title's earlier match, ids another provider found, and last a
search by the folder's name and year. Admins fix wrong matches from a title's
page with Fix match.

The server downloads artwork on first view into `$MATINEE_DATA_DIR/artwork`
and resizes it with ffmpeg. Clients get artwork ids and load them through
`artworkPath()`; the server only fetches URLs a provider gave it.

Providers live in `apps/server/src/metadata`. Adding one means implementing
`MetadataSource` in `types.ts`, listing it in `sources.ts`, and adding its id
to `METADATA_PROVIDERS` in the contract.

## Subtitles

The player shows subtitle files beside a video and text subtitles inside it.

- Files: `Movie.srt`, `Movie.en.srt`, `Movie.eng.forced.srt`,
  `Movie.de.sdh.srt`, also `.vtt`, `.ass`, and `.ssa`, in the video's folder or
  a `Subs` or `Subtitles` folder next to it. Release packs with
  `Subs/<video name>/2_English.srt` work too. A scan of the video's folder
  picks them up, and the watcher sees them come and go like videos. A file
  in `Subs` with no video's name goes to the folder's only video.
- Streams: text subtitles inside the file, such as SubRip, ASS/SSA,
  mov_text, and WebVTT. The first
  time someone turns one on, ffmpeg extracts it into
  `$MATINEE_DATA_DIR/subtitles`, where it stays until the file changes.
- Browsers get WebVTT. ASS and SSA lose their styling on the way.

A file starts with the viewer's last language if they had subtitles on, else a
forced track in the audio's language, else a track the file marks default.
The player remembers the last choice, a language or Off, for the next file.
Press C to toggle subtitles.

## Running in production

```sh
pnpm install --frozen-lockfile
pnpm build
MATINEE_WEB_DIST=apps/web/dist PUBLIC_URL=https://media.example.com \
  DATABASE_URL=postgres://... pnpm start
```

Until the first account exists, the server logs a setup token. Enter it on
`/setup` to claim the admin account.

## How auth works

- Sessions are random tokens. The database stores only their SHA-256. Browsers
  get an HttpOnly cookie; other clients can send `Authorization: Bearer`.
- Passkeys use discoverable credentials with user verification, via
  SimpleWebAuthn.
- OIDC uses authorization code + PKCE with state and nonce, via openid-client.
  A short-lived cookie binds each round trip to the browser that started it.
  Accounts are matched on issuer + subject, never on email.
- Nobody can remove their last passkey or linked account. A linked account
  only counts while single sign-on is on, and an admin who signs in only
  through it can't turn it off or change the issuer.
- Admins add people under Settings → Users. Adding a user creates the account
  and an invite link for the admin to copy and send. Whoever opens it creates
  a passkey for that account, or links the OIDC provider while single sign-on
  is on, and is signed in. For someone who lost their passkeys, a recovery
  link adds a new one to the existing account the same way.
- An invite or recovery link works once and expires after 7 days. A new link
  replaces the user's earlier ones, and admins can revoke a pending link. The
  database stores only the token's SHA-256, and the server builds the link
  from `PUBLIC_URL`. Opening the page doesn't use the link up, so a chat app
  that fetches it for a preview can't burn it. Linking the provider starts
  with a form post from that page, which the CSRF check keeps other sites
  from sending.
- There is always an admin who can sign in: the server refuses to demote or
  delete the last one, yourself included. Every request reads the role from
  the database, so a demotion applies to the user's next request. Deleting a
  user deletes their sessions, passkeys, linked accounts, links, and watch
  progress.
- An OIDC client secret saved in settings is stored in the database as is,
  like the rest of the settings. Use `MATINEE_OIDC_CLIENT_SECRET_FILE` to keep
  it out of the database.

## Not built yet

- Transcoding and remuxing. MKV, AVI, and HEVC files only play where the
  browser supports them.
- Picture subtitles (PGS, VobSub, DVB), which need burning in. The player
  lists them as unavailable. ASS and SSA play without their styling.
- Metadata from NFO files and local artwork, absolute episode numbering for
  anime, and provider keys set in admin settings instead of the environment.
- A sign-in flow that hands tokens to TV and mobile apps.
- A bundled server build and Nix package.
