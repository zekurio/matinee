# Matinee

A self-hosted media server. You point it at folders of video files, sign in
with a passkey or your OIDC provider, and watch in the browser.

This is the MVP. It scans libraries, fetches names, posters, and episode
details from a metadata provider, and plays files as they are when the
browser can, converting them on the server when it can't.

## Layout

```
apps/
  server/      Hono server: oRPC and REST handlers, auth, library scanner, video streams
  web/         React web client (Vite, TanStack Router + Query)
  android/     Native Android app (Kotlin, Compose, Media3), see its README
packages/
  contracts/   oRPC contract and TypeBox schemas shared by server and clients
  client/      Typed client factory for any app (web now, TV and mobile later)
  db/          Drizzle schema and migrations (Postgres)
  ui/          shadcn components on Base UI, plus the theme
brand/         The logo, the app icons for iOS and Android, and the script that renders them
```

The contract in `packages/contracts/src/contract.ts` is the API. The server
implements it with `implement(contract)` and clients call it through
`createMatineeClient()`, so a rename or a schema change fails typechecking on
both ends. Video bytes and the OIDC redirects are plain HTTP routes, listed in
`packages/contracts/src/paths.ts`.

The server also serves the contract as REST under `/api/v1`, for clients that
aren't written in TypeScript. Each procedure's method and path sit beside it
in the contract. The OpenAPI document is at `/api/v1/openapi.json`; feed it to
a generator such as openapi-generator or swift-openapi-generator. Browsers
authenticate with the session cookie. Apps send `Authorization: Bearer` with
the token they get from one of the sign-ins in
[Signing in apps](#signing-in-apps). Errors come back as JSON with `code`,
`status`, and `message`.

`/api/health` answers `{ "ok": true, "contract": "…" }` without a session.
`contract` is a hash of the REST API's paths and schemas, and the OpenAPI
document carries the same one as its `info.version`. A generated client
keeps the one it was generated from, so it can tell a server of another
version from one that answers nonsense.

## Local server discovery

Discovery is IPv4 UDP on port **8421**, separate from the HTTP API. Broadcast
an ASCII `Matinee discovery v1` padded with spaces to exactly 512 bytes,
without a newline, to each active interface's broadcast address and
`255.255.255.255`. Listen on the sending socket for unicast replies. Clients
can scan for three seconds and start another scan when asked.

A reply is UTF-8 JSON, at most 512 bytes:

```json
{ "version": 1, "name": "Matinee", "url": "https://media.example.com" }
```

`name` is a nonempty display name of at most 64 code points. Matinee has no
configurable server name, so it currently sends `Matinee`. `url` is the
server's `PUBLIC_URL`, never an address inferred from the probe. It is an
HTTP or HTTPS URL without credentials, at most 400 code points. Clients
ignore unknown fields, reject other versions and malformed replies, and
skip duplicate URLs. A future incompatible protocol gets a new probe and
version. The TypeScript constants and reply schema live in
`packages/contracts/src/discovery.ts`; this is not part of OpenAPI.

Discovery is on by default. `MATINEE_DISCOVERY_ENABLED=false` turns it off.
Loopback public URLs, including the dev default, are not advertised because
a client would connect to itself. The responder also skips URLs that don't
fit the reply. Set `PUBLIC_URL` to an address LAN clients can actually reach.
A bind failure only warns and leaves HTTP running. IPv6 multicast is not
implemented. Broadcasts don't cross routers, container bridge networks, or
most emulator NATs. Publish UDP 8421 on the host network when deploying in a
container, and allow it only on trusted LAN interfaces in your firewall.
The NixOS module's `discovery.enable` controls the responder; `openFirewall`
opens UDP 8421 with the HTTP port when discovery is enabled.

Only the exact probe gets a reply. The server answers one probe per source
IP per second and at most 20 per one-second window in total. The padded
probe prevents byte amplification. Discovery is unauthenticated, so treat
replies as hints and check `/api/health` before using a URL. Never sign in
automatically.

The Android `auth/discoverServers` function returns a cold flow of name and
URL pairs, with a three-second timeout and injectable destinations for tests.
Collect it in a cancellable screen scope. Call `serverDiscoveryPermission`
first and request the returned permission if any. Android 17 requires
`ACCESS_LOCAL_NETWORK` once the app targets SDK 37; our current target 36
gets LAN access through `INTERNET` and must not request it yet. Replies are
unicast, so no Wi-Fi multicast lock is needed. Pass the selected URL to
`Session.connect`, which already checks health and compatibility. No screen
or permission-request UI is included here.

## Development

Needs Node 24 and pnpm 11. `nix develop` provides both, Jellyfin's FFmpeg,
and a repo-local Postgres on a Unix socket. It creates `.env` from
`.env.example` and exports `DATABASE_URL`, `PORT`, and `PUBLIC_URL`.
With direnv, run `direnv allow` to enter the same shell automatically.

```sh
pnpm install
pnpm dev          # server on :8420, web on :5173
```

Open http://localhost:5173. The first visit goes to `/setup`, which creates
the admin account and then asks about transcoding and libraries. See
[Setup](#setup). Loopback URLs skip the setup token.

The server applies migrations on start. After changing
`packages/db/src/schema/`, generate a migration with a descriptive name:

```sh
pnpm db:generate --name add_watch_progress
```

The early migrations were squashed into `0000_initial_schema` when invites
were added. If your development database has the old migration history,
back up anything you need, stop the server, and recreate the database before
starting this version. This deletes its data. The new initial migration
cannot run over the old tables, and deleting only the migration history
won't fix that.

Run `pnpm verify` (format check, lint, typecheck) before committing.

Without Nix, copy `.env.example` to `.env` and point `DATABASE_URL` at your
own Postgres.

The dev database lives in `data/postgres`. Stop it with `matinee-postgres stop`
inside the dev shell. When switching from the old devenv shell, stop its
Postgres before entering the new shell, then move the existing database:

```sh
pg_ctl -D .devenv/state/matinee-postgres -w stop  # from the old shell, if running
mkdir -p data
mv .devenv/state/matinee-postgres data/postgres
direnv allow
```

Do not delete `.devenv` until the database has been moved. The new shell
refuses to create an empty database if it finds the old one.

`nix build` builds the package from `flake.nix`, and `nix flake check` runs
the NixOS module's tests too. After `pnpm-lock.yaml` changes, the build fails
with the new dependency hash; put it in `pnpmDepsHash` in `nix/package.nix`.
Bump the shared package and dev-shell toolchain with `nix flake update nixpkgs`.

## Configuration

Server settings are environment variables, documented in `.env.example`. Any
of them can come from a file: `NAME_FILE` names a file to read `NAME` from,
such as a systemd credential, without its surrounding whitespace. The ones
that matter for a real deployment:

- `PUBLIC_URL`: the https origin people use. Passkeys only work on this origin.
- `MATINEE_WEB_DIST`: path to the built web app, served by the server.
- `MATINEE_WATCH_LIBRARIES` and `MATINEE_SCAN_INTERVAL_HOURS`: when libraries
  get scanned. See [Scanning](#scanning).

Settings → Authentication and Settings → Transcoding start from the
`MATINEE_PASSKEYS_ENABLED`, `MATINEE_OPEN_REGISTRATION`, `MATINEE_OIDC_*`, and
transcoding variables, as alloy's admin settings do. The
server saves only the fields an admin changed: a field saved with the
variable's value is no override, so a later change to the variable still
applies, and an empty text field hands the field back to it. At start the
server logs each variable that a saved value overrides.

Single sign-on is set up by an admin under Settings → Authentication, and takes
effect on the next sign-in without a restart. The redirect URI to register with
the provider is `$PUBLIC_URL/api/auth/oidc/callback`. Set the `MATINEE_OIDC_*`
variables to create the admin account itself through the provider, since
settings can't be opened before setup.

`MATINEE_OIDC_GROUPS_CLAIM` names a claim holding a group name or a list of
names. Dotted paths such as `realm_access.roles` work too. Access groups
that name a provider group follow it at every sign-in, adding and removing
members while leaving memberships set in Matinee alone. Empty turns this
off. Only the provider's admins should be able to set the claim.

`MATINEE_OIDC_POLICY_CLAIM` names a claim holding an account's access
override, as an object or a string containing JSON. Only the provider's
admins should be able to set this claim too. For example:

```json
{
  "libraries": ["Movies", "Family"],
  "maxBitrate": 8000000,
  "transcode": true,
  "downloads": false,
  "maxStreams": 2
}
```

Leave fields out to follow the account's access groups. Libraries can be
names, compared without regard to case, or ids; `"all"` allows every
library, including ones added later. Unknown libraries are skipped and
logged. Bit rates are bits per second, at least 1000000; `null` removes a
bit rate or stream limit. A missing claim clears a provider-set override,
not one an admin set. An invalid policy is logged and leaves access alone.
Empty turns policy syncing off. Unlinking a provider removes its memberships
and override, including when a link to another issuer replaces it.

Add `offline_access` to `MATINEE_OIDC_SCOPES` if the provider supports
refresh tokens. Matinee stores the token and uses the Sync provider
accounts task to update roles, pictures, and access every six hours and a
few minutes after startup, even for people who only use an app. If the
provider refuses the token for good, Matinee stops retrying it. Set
`MATINEE_OIDC_SIGN_OUT_REFUSED=true` to also sign that account out
everywhere, so its next sign-in goes through the provider. Off, it keeps
its sessions and last claims. Network failures wait for the next run.

If the provider sends a `picture` claim, in the ID token or from userinfo,
Matinee uses it as the account's picture and fetches it again when it
changes. Uploading a picture or removing it under Settings → Account stops
that until the user picks the provider's picture again. Pictures are cropped
to 256px squares and kept in `$MATINEE_DATA_DIR/avatars`.

## Access

Admins see every library and have no limits. What everyone else may open,
and how the server streams to them, comes from access groups under
Settings → Access. A group sets:

- Libraries: all of them, including ones added later, or a list. A library
  an account can't open doesn't exist for it: not in lists, search, other
  people's profiles, or by a guessed address.
- A bit rate limit for streaming. A file over it plays as an encode under
  it. Downloads aren't limited, since a download only takes longer.
- Whether the server may encode video for its members. Off, a file plays as
  it is or with its video copied, and one that needs an encode doesn't play.
- Whether its members may download.
- How many devices may play at once.

An account is in any number of groups and gets the most generous of what
they allow: every library any of them opens, the highest limit, and
anything one of them permits. Everyone is the built-in group that holds
every account. It starts with every library and no limits, so nothing
changes until an admin changes it, and while it stays that way no other
group can hold anyone back. Take its libraries away to make access opt-in,
then open them through other groups. A group that opens no library has no
say in the limits, so the emptied Everyone doesn't lift the ones the other
groups set. Its limits only count for an account that no group opens
anything for.

Accounts get into a group three ways. An admin puts them there under
Settings → Users. An invite link can name groups for the account it
creates. Or the group names a group at the OIDC provider, and then holds
whoever the provider's groups claim lists, kept in step at every sign-in;
see [Configuration](#configuration). A group that starts following a
provider group fills up at once, from the claims each linked account last
sent.

Edit access in a user's menu also sets things on that one account, over
its groups: a field left at From groups follows them, and anything else
wins. The OIDC policy claim sets the same per account from the provider.

Changes apply to an account's next request, which for a stream that is
playing is its next piece of the file.

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
- Run now on Scan libraries in Settings → Jobs.

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

A scan groups files into titles: a show is a top-level folder, a movie is a
folder holding one video (or a lone file), and `Season 2` folders or `S02E05`
in file names give episode numbers. After the scan, titles that are new,
unmatched for a day, gained files, or are 30 days old get fetched again.
In the background, ffprobe reads the codecs, audio tracks, and subtitles of
files that are new or changed, a few at a time. A file it can't read is
left alone until it changes.

## Jobs

Background work runs in queues, as in Immich: library scans, media info
(ffprobe), metadata, thumbnails, trickplay images, artwork, subtitle
conversion, and profile pictures. Each queue runs a few jobs at a time, and asking for a job that
is already waiting or running joins it, so a file is never probed twice at
once. What a player waits for, like a thumbnail or the file it's about to
play, goes ahead of background work. Under Settings → Jobs admins see what
each queue is doing and its latest failures, pause it, or drop its waiting
jobs. Concurrency, further down, sets how many jobs the media info,
trickplay, and artwork queues run at once, the three that build up long
backlogs. Higher numbers clear one sooner but take CPU, disk, and network
from people streaming. A change applies at once and stays for the next
start. The other queues run a fixed number.

Scheduled tasks fill the queues, as in Jellyfin: scanning every library,
refreshing stale metadata, reading media info of files that haven't been
read, fetching artwork, making trickplay images, cleaning up old encodes,
and deleting expired sessions. Each runs at startup, on an interval, or when an admin presses
Run now, and can be cancelled, which also drops the jobs it queued. The
last run of each is stored, so an interval counts across restarts. The
queues live in memory: the tasks find unfinished work again after a
restart, since it's all derived from the database.

Matching tries, in order, a provider id in the folder name (`{tvdb-81189}`,
`[tmdbid-603]`, `{imdb-tt0133093}`, as Sonarr, Radarr, and Jellyfin write
them), the title's earlier match, ids another provider found, and last a
search by the folder's name and year. Admins fix wrong matches from a title's
page with Fix match.

A fetch also keeps the first 20 billed actors with their characters, the
studios, and some of the crew. Movies get their directors and writers,
including screenplay, story, and source credits such as a novel. Shows get
their creators and whoever directed or wrote the show as a whole: anime's
series director and series composition, anyone credited on a third of the
episodes, and the author of the source. TheTVDB only lists crew per episode,
so its shows get the cast and studios. Like Jellyfin, Matinee leaves out the
rest of the crew and episode guest stars.

The server downloads artwork into `$MATINEE_DATA_DIR/artwork` and scales
it with ffmpeg to WebP copies 240, 480, 960, and 1920 px wide, made as
they're first asked for (JPEG and PNG when ffmpeg lacks libwebp). Clients
get artwork ids and load them through `artworkPath()`, or offer every size
with `artworkSrcSet()` and let the browser pick; the server only fetches
URLs a provider gave it. As in
Jellyfin, a metadata fetch downloads every image it saved: posters,
backdrops, logos, season posters, episode stills, and cast photos.
Posters and backdrops go first, and an image someone opens goes ahead of
all of them. The original and its card copies take about 150 KB per image
on average, so a library of 1,000 titles needs a few GB.

Like Jellyfin, the server reads a [BlurHash](https://blurha.sh) from each
image it downloads and sends it, with the image's aspect ratio, next to
the artwork id. The web app draws it as a blurred stand-in until the image
loads. An image opened before its download finished has none on that
view. The Fetch artwork task downloads whatever a restart or a failure
left without a BlurHash.

Admins pick a title's poster, backdrop, and logo, a season's poster, and an
episode's still with Edit images in its menu, as in Jellyfin's image editor.
It lists what the library's provider has for that image, those in the
library's language, English, or without text first, and every language on
request. It also takes JPEG, PNG, and WebP uploads of up to 25 MB, stored
under an id from their bytes. A refresh keeps what an admin picked, uploaded,
or removed. Fix match to another entry drops the picks from the old one and
keeps the uploads, and the server deletes an upload once nothing shows it.

Providers live in `apps/server/src/metadata`. Adding one means implementing
`MetadataSource` in `types.ts`, listing it in `sources.ts`, and adding its id
to `METADATA_PROVIDERS` in the contract.

## Subtitles

The player shows subtitle files beside a video and subtitle streams inside it.

- Files: `Movie.srt`, `Movie.en.srt`, `Movie.eng.forced.srt`,
  `Movie.de.sdh.srt`, also `.vtt`, `.ass`, `.ssa`, `.sup` (PGS), and `.idx`
  (VobSub), in the video's folder or
  a `Subs` or `Subtitles` folder next to it. Release packs with
  `Subs/<video name>/2_English.srt` work too. A scan of the video's folder
  picks them up, and the watcher sees them come and go like videos. A file
  in `Subs` with no video's name goes to the folder's only video.
- Streams: text subtitles inside the file, such as SubRip, ASS/SSA,
  mov_text, and WebVTT, and picture subtitles: PGS, VobSub, and DVB. The
  first time someone turns a text or PGS stream on, ffmpeg copies it into
  `$MATINEE_DATA_DIR/subtitles`, where it stays until the file changes.
  That reads the whole file, so on a large one it can take minutes.
- Browsers get WebVTT for text. ASS and SSA lose their styling on the way.
- PGS goes to the browser as it is, a `.sup` file, and the player draws it
  over the video with [libpgs](https://github.com/Arcus92/libpgs-js). It
  works with every source, the file as it is included.
- VobSub and DVB only show burned into the video. Picking one switches to
  an encode with the subtitle drawn on, at the quality picked, or the
  fallback quality for Original. The overlay runs on the CPU; the GPU still
  decodes and encodes if it's set up. Other clients can burn in PGS the
  same way, with `subtitle` in `mediaHlsPath()`.

A file starts with the viewer's last language if they had subtitles on, else a
forced track in the audio's language, else a track the file marks default.
Tracks that need burning in never start by themselves. The player remembers
the last choice, a language or Off, for the next file. Press C to toggle
subtitles.

When subtitles run early or late, the Offset buttons at the bottom of the
subtitles menu move them by a tenth of a second, as do G (earlier) and H
(later). The offset holds for the rest of the file, across tracks and
qualities, and starts at zero for the next one. Burned-in subtitles are
part of the picture and can't move.

## Audio tracks and quality

The player's audio menu lists every audio track in the file. The track the
file marks default plays from the file as it is, if the browser decodes
it. Any other track, or a default track the browser can't decode, plays a
stream that ffmpeg makes on the fly: fragmented MP4 with that one audio
track and the video copied. A quality other than Original in the settings
menu plays an encode, the video in H.264 at the picked size and bit rate,
as HLS. When the browser can't play a file as it is, the player switches
to an encode by itself. The quality you pick is remembered for the next
file.

An account's bit rate limit applies to streaming, not downloads. A file
over it plays as an encode at a quality under the limit, and Original
isn't offered. A file whose bit rate isn't known counts as over it too.
When video conversion is turned off for the account, the player offers
no encode qualities. Files still play as they are or with their video
copied and their audio converted, but one that needs its video converted
can't play. An account with a stream limit must stop on another device
before starting on one more.

The player tells the server which audio codecs the browser decodes in MP4,
out of Opus, AAC, MP3, FLAC, ALAC, AC-3, and E-AC-3. A stream copies a
track in one of them. Anything else, like DTS, TrueHD, or PCM, becomes
Opus, or AAC in a browser without Opus. Converted audio is stereo, at
Jellyfin's bit rates: 192 kb/s for Opus, 256 kb/s for AAC, 128 kb/s for
mono. Surround goes through the downmix set under Settings → Transcoding.
So a file with DTS audio plays in Chrome with its video copied and Opus
audio, which costs the server little.

A copied stream has no byte ranges, so the player seeks by starting a new
one. The video can only start on a keyframe, so a seek lands on the
nearest one. Safari won't play media without byte ranges, so these streams
don't play there yet.

Encodes work the way Jellyfin's transcodes do: ffmpeg writes six-second
fMP4 segments to disk, and the player loads them from an HLS playlist with
hls.js, or natively where the browser has no Media Source Extensions. A
seek past what's encoded starts ffmpeg at the segment the player asked
for. Unlike Jellyfin, an encode belongs to no one player. Everyone who
plays the same file with the same audio track and quality, in browsers
that decode the same audio codecs, reads the same segments, so the server
encodes each segment once and serves it from disk after that, also on a
second viewing. A change to the file or to the transcoding settings
starts a new encode. ffmpeg runs while someone is watching ahead of what's
on disk and stops when it reaches segments it already wrote, or two
minutes after the last player asked for anything. Throttling pauses it
once it is far enough ahead of every player, and segment deletion removes
segments every player is past.

Encodes stay in `$MATINEE_DATA_DIR/transcodes`, or `MATINEE_TRANSCODE_DIR`,
for `MATINEE_TRANSCODE_CACHE_HOURS` (24) after anyone last played them,
and the least recently played go first once they pass
`MATINEE_TRANSCODE_CACHE_GB` (50) together.

## Downloads

A file's menu has Download…, for watching offline. The original is the
file as it is, from the stream route, which any downloader resumes with
byte ranges. The other choice is a version made for the device. It keeps
the video, or encodes it to a size, bit rate, and codec. It holds the audio
tracks you pick, each kept or converted to AAC or Opus in mono, stereo,
5.1, or 7.1. It can also burn in a picture subtitle. The dialog offers only
the codecs the server encodes and the browser plays, and shows the size
the server estimates. Text subtitles stay out of the file and save next to
it as WebVTT. Downloads can be turned off for an account; when video
conversion is off, download the file as it is or keep its video.

The server doesn't keep a finished copy. `downloads.start` sets up a
download, and ffmpeg makes it as the client fetches it: six-second
fragmented MP4 segments, which make one MP4 file when appended to the init
segment. The client fetches them in order, and segments behind it are
deleted. A run that gets ten segments ahead pauses, so a slow connection
doesn't fill the disk. When the client goes away, ffmpeg stops after 30
seconds. When it asks for the next segment, a new run starts there: on the
segment grid for an encode, and on the keyframe the segment starts with
for kept video. So a download picks up where it broke off, after a
restart of the server too, and nothing made before is made again. The
audio joins sample for sample. Each segment's `moof` boxes say where
every track ended and how many packets it has had, so the new run drops
the kept tracks' packets the file already has, and starts each converted
track's encoder a few seconds early on the old run's frame grid, keeping
only what follows. Matroska's millisecond timestamps leave the decode
after a seek up to half of one off; frames lie on a fixed grid from the
start, so the server snaps to it, and for TrueHD, whose frames are
shorter than that, it encodes each candidate and compares it with the
last segment. Runs go through two queues under Settings → Jobs. Download
encodes runs two at a time by default, for downloads whose video is
encoded, each of which takes an encoder as a stream does. Download copies
runs four, for downloads that keep their video, which read the file,
convert at most the audio, and mostly wait for their client. So a copy
never waits behind an encode. A download nobody fetched from for
`MATINEE_TRANSCODE_CACHE_HOURS` is deleted.

Browsers save it as one stream from `downloadFilePath()`, which can't
resume. Apps fetch `downloadInitPath()` and then `downloadSegmentPath()`
from 0 until it answers 204, and after a break ask for the first segment
they don't have. If the file or the transcoding settings changed in
between, the server answers 409, and the download starts over.

No request waits in silence for long, since proxies and HTTP clients cut
a quiet connection after a minute or so. A request for a segment that
isn't made within 25 seconds answers 503 with Retry-After, whether the
run is still at it or waits for its turn in the queue, and the client
asks again; a download keeps its place in the queue while its client asks
at least every half minute. The whole file as one stream answers 503 the
same way when its run got no turn in that time, before anything is sent,
so a browser shows a download that failed and can be tried again rather
than one that hangs.

## Transcoding and ffmpeg

Matinee encodes video the way Jellyfin does, with Jellyfin's filter chains
and defaults, and is built for
[jellyfin-ffmpeg](https://github.com/jellyfin/jellyfin-ffmpeg): FFmpeg 8.1
with Jellyfin's patches. Get it as the Nix package `jellyfin-ffmpeg` (the
dev shell has it), as the Debian and Ubuntu packages from
repo.jellyfin.org (what Jellyfin's Docker image ships, in
`/usr/lib/jellyfin-ffmpeg`), or as a portable build from its GitHub
releases. Point `MATINEE_FFMPEG_PATH` and `MATINEE_FFPROBE_PATH` at it if it
isn't first on `PATH`.

What needs jellyfin-ffmpeg:

- tonemapx, the software tone mapper. It turns HDR10, HLG, and Dolby Vision
  into SDR, including Dolby Vision profile 5, which has no HDR10 layer and
  needs the RPU applied. Without it, HDR that no GPU tone maps comes out
  washed out.
- The GPU paths in full: BT.2390 in `tonemap_opencl`, `tonemap_cuda`,
  `tonemap_videotoolbox`, VPP tone mapping without HDR10 metadata, and
  `hwupload_vaapi`. Without them VAAPI and QSV fall back to scaling on the
  CPU and uploading frames for the encoder.
- Pausing ffmpeg with `p` and `u`, which throttling needs.
- Dropping Dolby Vision and HDR10+ from a stream copy with `hevc_metadata`
  and `av1_metadata`. Stock FFmpeg 7.1 and later can drop Dolby Vision with
  `dovi_rpu`.

Stock FFmpeg still decodes and encodes in software (libx264, libx265,
libsvtav1), encodes on VAAPI, QSV, NVENC, and VideoToolbox, deinterlaces,
and keeps HDR10 and HLG in 10-bit HEVC and AV1 encodes.

Admins set it up under Settings → Transcoding: the GPU (VAAPI, Intel Quick
Sync, NVIDIA NVENC, or Apple VideoToolbox) and its device, which codecs it
decodes, HEVC and AV1 encoding, the x264 preset and CRF, tone mapping,
deinterlacing, the stereo downmix and its boost, VBR for AAC, and
throttling. Changes apply to the next transcode. The
`MATINEE_HARDWARE_ACCELERATION`, `MATINEE_VAAPI_DEVICE`, and
`MATINEE_QSV_DEVICE` variables are the defaults for that form.

When the server starts, and when the devices change, it finds out what
ffmpeg can do: its encoders, filters, and options, then a short test encode
with each GPU encoder and each tone mapper. The settings page shows the
result, and offers only what passed. Detect again after updating drivers
or ffmpeg. A GPU path that can't tone map a file falls back to tonemapx.

Intel GPUs also have a low-power encoder (VDENC) for H.264 and HEVC. It
skips CPU-GPU syncs, which helps 4K and tone mapped encodes. As in
Jellyfin, a switch per codec turns it on for QSV and for VAAPI on an Intel
driver, and both are off by default. Low power needs a GPU with VDENC for
the codec (Skylake and later for H.264, Ice Lake and later for HEVC) and
the HuC firmware for bitrate control, so detection tries it too, and the
switches work only where it passed. Arc GPUs encode in low power either
way.

In Docker, pass the GPU through: `/dev/dri` for VAAPI and QSV, plus the
OpenCL runtime of the driver (such as `intel-compute-runtime`) for OpenCL
tone mapping; the NVIDIA container toolkit for NVENC.

## Trickplay

While someone hovers over or drags the seek bar, the player shows the
frame at that point, as Jellyfin does. The server makes these trickplay
images with ffmpeg in the background: a 320 px thumbnail every 10
seconds, in JPEG tiles of 10 by 10, kept in `$MATINEE_DATA_DIR/trickplay`.
In a test, a 24-minute 1080p episode took 18 seconds and 1.2 MB, and a
99-minute 4K HDR10 remux two minutes and 4.3 MB. HDR is tone mapped with
tonemapx. ffmpeg runs at low priority.

Scans queue images for their files once ffprobe has read them. The Make
trickplay images task catches the rest once a day, and deletes the images
of files that are gone. A file someone opens before its images exist moves
to the front of the queue, and the seek bar picks them up when they're
done.

By default ffmpeg decodes only keyframes, so a thumbnail can be a second
or two off its time. That makes a whole library practical: decoding every
frame of that episode took four CPU minutes, its keyframes 20 seconds.
Admins change this, the interval, and the width under Settings →
Trickplay, or turn trickplay off. New settings make every file's images
again; the old ones show until then.

Hardware decoding, off by default as in Jellyfin, decodes on the GPU set
up under Transcoding, for the codecs it decodes there, and copies each
frame back for the CPU filters. It saves the most with keyframes only off:
decoding every frame of three minutes of the 4K remux took 306 CPU
seconds in software and 32 with VAAPI. A run that fails on the GPU runs
again on the CPU, and a keyframes-only run that fails or finds nothing
decodes every frame, as Jellyfin does.

Clients read a file's images from `media.trickplay` and load the tiles
through `trickplayTilePath()`. Players that read HLS image playlists, as
Roku's and Apple's do, can load `trickplayPlaylistPath()` instead: an
`#EXT-X-IMAGES-ONLY` playlist with `#EXT-X-TILES` per tile, like
Jellyfin's `tiles.m3u8`. Its tile URLs are relative and carry no token, so
the player has to send the `Authorization` header with them.

## Statistics

Each time someone opens a file in the player, it starts a playback session
with an id it makes up, and sends that id with its progress reports and its
stream requests. Reports carry the seconds spent playing, not counting
pauses, buffering, or seeks. The server never counts more than the time
since the session began plus 30 seconds, so a client can't claim more than
it could have watched. Stream requests record what the server did: copied
the file, copied the video into a stream ("direct stream"), or encoded it,
with the encoder, whether a GPU did it, tone mapping, the converted audio,
and how long ffmpeg ran.

A session counts as a play once it has played a minute or reached the end.
Movies and episodes count as watched when a session played them to the
end, or when someone marked them watched. Marking asks when, as Trakt
does: just now, on the release date (an episode's air date, a movie's
release date), or on a date and time picked in a dialog. It adds a play at
that time holding the runtime from the resume point on, since the player
already counted what came before. A file that's already watched gets no
second play, and marking it unwatched takes the marked plays back while
the player's sessions stay. Marked plays count everywhere except the
playback method breakdown, since the server played nothing.

The migration that added marks gave every file that was already watched,
but never played to the end in a session, a marked play at its last
progress update. That covers files marked by hand earlier and files
watched before statistics existed. Sessions outlive the files and titles
they played, so watch time stays when a library loses them.

Statistics, in the account menu, shows one of four views, picked from a
dropdown. Days and hours count in the browser's time zone; other clients
send `timeZone` with the request, and it defaults to UTC. Everything but
the library totals follows the period picked beside the dropdown.

- Activity, for admins: who is watching right now and how each stream
  plays, watch time per day, week, or month, the most watched titles and
  genres, when playback starts, and viewers.
- Playback, for admins: how plays split between direct play, direct
  stream, and transcode, which encoders and source codecs transcoding
  needed, and browsers and apps.
- Library, for everyone: what the libraries hold, the files that arrived
  over time, and their resolution, dynamic range, and codecs. A file
  arrived at its modification time, or when a scan found it if that came
  first, so a new server shows when its files were downloaded rather than
  one spike on the day of the first scan.
- Leaderboard, for everyone: watch time, plays, the current and longest
  streak of days in a row with a play, and movies and episodes finished.
  Only people who share their statistics take part. You always see your
  own place, and nobody else does until you share. The current streak
  runs up to today or yesterday, whatever the period.

The leaderboard is one statement that ranks in Postgres. Its totals and
play days come from index-only scans of `playback_session_user_idx`, which
carries every column they read; `playback_session_started_idx` does the
same for the server-wide views.

## Profiles and favorites

Everyone on the server has a profile at `/profiles/<username>`, linked from
the leaderboard and the admins' statistics. A profile always shows the name
and picture. Its owner decides under Settings → Account whether others
also see:

- Favorites: the movies, shows, and episodes they marked with the heart,
  on a title's or episode's page or on its poster or still. Home lists
  your own favorites too.
- Statistics: watch time, the most watched titles and genres, when they
  watch, and the last file of each title they played.

Both start off. The owner sees everything on their own profile either way,
with a note on the parts nobody else can see.
The Share button copies the profile's address, or opens the share sheet on
a phone. The page needs an account on the server; nothing on it is public.
Admins still see each person's total watch time in the server's
statistics.

## Running in production

```sh
pnpm install --frozen-lockfile
pnpm build
MATINEE_WEB_DIST=apps/web/dist PUBLIC_URL=https://media.example.com \
  DATABASE_URL=postgres://... pnpm start
```

The build bundles the server into `apps/server/dist`, with the migrations
beside it, so it runs on plain Node without the TypeScript sources. `pnpm
start` keeps a pnpm process around it; a service manager can run
`node dist/server/index.mjs` with `NODE_ENV=production` from `apps/server`
instead, which is all `pnpm start` does.

## Running on NixOS

The flake packages the server for `x86_64-linux` and has a NixOS module:

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

```nix
services.matinee = {
  enable = true;
  publicUrl = "https://watch.example.com";
  extraGroups = [ "media" ];         # one that can read the libraries
  oidc = {
    issuerUrl = "https://id.example.com";
    clientId = "matinee";
    displayName = "Pocket ID";
  };
  transcoding.hardwareAcceleration = "qsv";
  secrets = {
    MATINEE_OIDC_CLIENT_SECRET = config.sops.secrets.matinee-oidc.path;
    MATINEE_TMDB_API_KEY = config.sops.secrets.tmdb.path;
  };
};
```

This runs PostgreSQL on the host, with a database and role that sign in over
the socket. Matinee keeps its data in `/var/lib/matinee` and its encodes in
`/var/cache/matinee/transcodes`, and runs jellyfin-ffmpeg. The typed options
cover the usual settings. `settings` takes any variable from `.env.example`,
and `secrets` takes files, which systemd hands the server as credentials, so
they can stay readable by root only. A remote database with a password goes
in `secrets.DATABASE_URL` with `database.createLocally = false`.

The server listens on `127.0.0.1:8420` and the module requires an https
`publicUrl`, so something in front terminates TLS. With Caddy on the same
host:

```nix
services.caddy = {
  enable = true;
  virtualHosts."watch.example.com".extraConfig = "reverse_proxy 127.0.0.1:8420";
};
```

On a tailnet, `tailscale serve --bg 8420` serves it on the machine's
`https://<host>.<tailnet>.ts.net` address, which is then the `publicUrl`.

The service sees no `/home`, so keep the libraries under a path such as
`/srv` or `/mnt`. With `transcoding.hardwareAcceleration` unset, the admin
picks the GPU during setup, so the service may open every device. `"vaapi"`,
or `"qsv"` with `transcoding.qsvDevice`, limits it to that render node, and
`"none"` closes them all; `accelerationDevices` sets the list outright.
The host needs the GPU's drivers in `hardware.graphics.extraPackages`, such
as `intel-media-driver` and `vpl-gpu-rt` for Intel.

## Setup

Until setup is done, the first visit goes to `/setup`. How it creates the
admin account depends on whether `MATINEE_OIDC_ISSUER_URL` and
`MATINEE_OIDC_CLIENT_ID` are set:

- Without them, the server logs a setup token at start, or takes
  `MATINEE_SETUP_TOKEN`. Enter it, then create the admin with a username and
  a passkey. With `MATINEE_PASSKEYS_ENABLED=false` as well, nothing can
  create the admin, and the setup page and the log say so.
- With them, setup only offers the provider, and there is no token. The
  first sign-in becomes the admin only if its role claim says `admin`; the
  server turns anyone else away and logs what the claim held. The claim is
  `matinee_role` unless `MATINEE_OIDC_ROLE_CLAIM` names another, and only
  the provider's admins should be able to set it. In Pocket ID, give a group
  such as `matinee-admins` the custom claim `matinee_role` with the value
  `admin`. Custom claims come with the `profile` scope.

Setup then asks which GPU to transcode on, unless
`MATINEE_HARDWARE_ACCELERATION` sets it, and for the libraries, unless some
exist. Each step can be skipped, and everything in it is in Settings later.
Until the admin finishes, signing in as an admin goes back to setup.

## How auth works

- Sessions are random tokens. The database stores only their SHA-256. Browsers
  get an HttpOnly cookie; apps send `Authorization: Bearer`. A session ends
  30 days after it was last used.
- Settings → Account lists every session: browsers by the browser and system
  in their User-Agent, apps by the device name and platform they sent when
  they signed in. You can sign out any of them, or all but the current one.
- Passkeys use discoverable credentials with user verification, via
  SimpleWebAuthn.
- OIDC uses authorization code + PKCE with state and nonce, via openid-client.
  A short-lived cookie binds each round trip to the browser that started it.
  Accounts are matched on issuer + subject, never on email. Each account
  links at most one provider account. Linking one at a new issuer replaces
  the link at the old one, which can't sign in anymore. Settings → Account
  says when a link is at an old issuer.
- The issuer URL is the `issuer` the provider's discovery document names,
  or the document's own address. Linked accounts match on it, so the
  server refuses a provider that names another issuer, both when an admin
  saves the settings and at sign-in.
- Nobody can remove their last passkey or linked account. A passkey only
  counts while passkeys are on, and a linked account while single sign-on
  is on. An admin who signs in only through single sign-on can't turn it
  off or change the issuer.
- Admins turn passkeys off under Settings → Authentication, as in alloy, and
  `MATINEE_PASSKEYS_ENABLED=false` makes off the default. Single sign-on is
  then the only way in. The login page shows only the provider, and the
  server refuses passkey sign-in, sign-up, setup, and adding a passkey.
  Stored passkeys stay for when they're back on, and nobody gets signed out.
  The server turns passkeys off only once your own account is linked at the
  current issuer. The form counts the accounts that aren't, since those
  can't sign in afterwards. So link yours, ask everyone else to link theirs
  under Settings → Account, then turn passkeys off. Someone still signed in
  can link later.
- With passkeys off, a provider that is down keeps everyone out until it's
  back. If you can't wait, delete the saved switch with
  `delete from setting where key = 'passkeys'` and restart. Passkeys then
  follow `MATINEE_PASSKEYS_ENABLED` again.
- People create their own accounts. With passkeys and open registration on,
  the login page lets anyone pick a username and create a passkey. Admins
  change open registration under Settings → Authentication;
  `MATINEE_OPEN_REGISTRATION` is its default. With sign-up allowed in the OIDC
  settings (or `MATINEE_OIDC_ALLOW_SIGN_UP`), the first sign-in of an unlinked
  provider account creates a new account. Both start off. Settings → Users
  lists the accounts for admins to manage.
- Admins can create invite links under Settings → Users to let people in
  while passkey sign-up is closed. Each link works once and expires. The person picks a username and
  registers a passkey, and no account exists until the passkey is verified.
  The server stores only the token's SHA-256, so it can show the link only
  when it is created. An admin's links stop working if the admin is deleted
  or loses the role, including through an OIDC role claim.
- An unlinked OIDC sign-in whose username claim matches an account, as sent
  or as Matinee would turn it into a username, doesn't sign in to it or make
  a numbered copy. Linking on the claim alone would hand the account to
  whoever controls that claim at the provider. The server keeps the
  verified sign-in for 10 minutes, tied to the browser by an HttpOnly
  cookie, and the login page asks the person to sign in to that account and
  link it, without another trip to the provider. While sign-up is allowed,
  they can create a new account from it instead. This works whether or not
  sign-up is on. With passkeys off, a signed-out person can't sign in to
  the account to link it, so the page offers only a new account, and with
  sign-up off the sign-in fails.
- There is always an admin who can sign in: the server refuses to demote or
  delete the last one, yourself included. Every request reads the role from
  the database, so a demotion applies to the user's next request. Deleting a
  user deletes their sessions, passkeys, linked accounts, watch progress,
  favorites, and playback history.
- With single sign-on, the role claim sets the account's role on every
  sign-in, as alloy and Immich read it: `admin` or `user`, or a list holding
  them, where admin wins. Without the claim the role stays. A claim that
  would demote the last admin who can sign in is ignored, and logged.
- An OIDC client secret saved in settings is stored in the database as is,
  like the rest of the settings. Use `MATINEE_OIDC_CLIENT_SECRET_FILE` to keep
  it out of the database.

## Signing in apps

Apps get a session of their own, separate from the browser's, so signing
out of one leaves the other signed in. There are two ways, both in the
`auth.app` and `auth.device` procedures of the contract, and both end in
`{ token, user }`. An app sends its device name, like `Living room TV`, and
its platform: `android`, `ios`, `linux`, `macos`, `tizen`, or `windows`.

Apps that can open a browser, on phones and desktops, follow OAuth for
native apps (RFC 8252) with PKCE:

1. The app makes a random code verifier and opens `/authorize` in the system
   browser (`ASWebAuthenticationSession` on iOS, Custom Tabs on Android) with
   `redirect_uri`, `state`, `code_challenge` (base64url SHA-256 of the
   verifier), `code_challenge_method=S256`, `platform`, and `device_name`.
   `appAuthorizePagePath()` builds the URL.
2. The page signs the person in if they aren't already, with a passkey or the
   OIDC provider, and asks them to approve the app.
3. The browser goes to `redirect_uri` with `code` and `state`. The redirect
   URI is either a `matinee:` URI the app registered, or a loopback URL such
   as `http://127.0.0.1:43123/callback` for a desktop app that listens on a
   port.
4. The app posts `code` and `codeVerifier` to `/api/v1/auth/app/token`.
   A code works once, for two minutes, and only with its verifier.

Apps without a browser, like TV apps, follow the OAuth device grant
(RFC 8628):

1. The app posts its device to `/api/v1/auth/device` and shows the
   `userCode`, like `BCDF-GHJK`, with `verificationUri`, which is
   `$PUBLIC_URL/link`. `verificationUriComplete` has the code filled in, for
   a QR code.
2. Someone signed in opens the page on their phone, enters the code, checks
   the device, and approves.
3. The app polls `/api/v1/auth/device/token` with `deviceCode` every
   `interval` seconds. It answers `pending` until the approval, then the
   session. After `expiresIn` seconds, 10 minutes, it answers 404 and the app
   starts again.

Both pages warn that approving hands the device the account. They are the
only guard against someone sending a link or code of their own to get in.

## Translations

The web app's text lives in catalogs under `apps/web/src/i18n/locales/`,
one folder per language and one file per area of the app (`player.ts`,
`stats.ts`, and so on). `en/` is the source and holds every message. Each
other folder is a language, named by its BCP 47 tag (`de/`, `pt-BR/`), and
loads only when picked. Settings → Appearance → Language picks one per
device, and by default the app follows the browser's languages. Dates,
numbers, language names, and the calendar follow the pick.

To add a language, copy `de/` to `<tag>/` and translate the values.
Nothing else needs changing: the picker lists the folder under the
language's own name. Keys left out show the English text, so a
translation can ship partial. The types reject unknown keys, a dropped
`{placeholder}`, and a plain string where English has a `plural(...)`.
A plural lists the forms its language has, as `Intl.PluralRules` names
them: English has `one` and `other`, Polish also has `few` and `many`.

The shared components in `packages/ui` can't reach the catalog. The app
hands them their text (the `ui` area) through `setUiText` from
`@matinee/ui/lib/ui-text`.

The server's error messages and the contract schemas' validation
messages arrive in English. The `server` and `validation` areas copy them
word for word, and `translateKnown()` matches what arrives against those
copies, with `{name}` standing for a value. A message changed on the
server needs the same change in `en/server.ts` (or `en/validation.ts`),
or it shows in English. Metadata from providers, such as overviews,
genres, and statuses, shows as the provider sent it.

## Not built yet

- HLS. Streams are progressive MP4, which Safari doesn't play.
- Surround in streams. Converted audio is always stereo.
- Text subtitle burn-in, so ASS and SSA play without their styling.
- Metadata from NFO files and local artwork, absolute episode numbering for
  anime, and provider keys set in admin settings instead of the environment.

## License

MIT, see [LICENSE](LICENSE), except the Android app in `apps/android`,
which is GPL-3.0 (see [its LICENSE](apps/android/LICENSE)): it plays DTS
and TrueHD with a GPL build of FFmpeg, and can play with mpv.
