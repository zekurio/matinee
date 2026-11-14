# Matinee server

The Hono server behind every client. It scans libraries, fetches metadata,
streams and transcodes with jellyfin-ffmpeg, and handles accounts and
sign-in. It also serves the web app, so one process is the whole
deployment.

For NixOS and the dev shell, see the [repository README](../../README.md).

- [The API](#the-api)
- [Running in production](#running-in-production)
- [Running on NixOS](#running-on-nixos)
- [Setup](#setup)
- [Configuration](#configuration)
- [Access](#access)
- [Branding](#branding)
- [Scanning](#scanning)
- [Metadata](#metadata)
- [Requests](#requests)
- [Jobs](#jobs)
- [Subtitles](#subtitles)
- [Playback](#playback)
- [Downloads](#downloads)
- [Transcoding and ffmpeg](#transcoding-and-ffmpeg)
- [Trickplay](#trickplay)
- [Watch parties](#watch-parties)
- [Local and remote](#local-and-remote)
- [Statistics](#statistics)
- [Profiles and favorites](#profiles-and-favorites)
- [How auth works](#how-auth-works)
- [Signing in apps](#signing-in-apps)
- [Local server discovery](#local-server-discovery)
- [Not built yet](#not-built-yet)

## The API

`packages/contracts/src/contract.ts` is the API. The server implements it
and clients call it through `createMatineeClient()`, so a schema change
breaks the type check on both sides. Video, artwork, and OIDC redirects
are plain HTTP routes in `packages/contracts/src/paths.ts`.

The same contract is served as REST under `/api/v1`, with the OpenAPI
document at `/api/v1/openapi.json`. Browsers use the session cookie. Apps
send `Authorization: Bearer <token>` from one of the flows in
[Signing in apps](#signing-in-apps). Errors are JSON with `code`, `status`,
and `message`. The web app shows a reference at `/api-docs`, rendered
locally with Scalar.

`/api/health` returns `{ "ok": true, "contract": "…" }` without a session.
`contract` is a hash of the REST paths and schemas, also in the OpenAPI
`info.version`, so a generated client can detect a server on a different
version.

## Running in production

```sh
pnpm install --frozen-lockfile
pnpm build
MATINEE_WEB_DIST=apps/web/dist PUBLIC_URL=https://media.example.com \
  DATABASE_URL=postgres://... pnpm start
```

The build bundles the server and its migrations into `apps/server/dist`,
so it runs on plain Node 24. A service manager can skip pnpm and run
`node dist/server/index.mjs` with `NODE_ENV=production` from `apps/server`.

## Running on NixOS

The [repository README](../../README.md#run-it-on-nixos) has the basic
setup. Options are in `nix/module.nix`. `settings` takes any variable from
`.env.example`, and `secrets` takes files that systemd passes as
credentials. For a remote database with a password, set
`secrets.DATABASE_URL` and `database.createLocally = false`.

With `transcoding.hardwareAcceleration` unset, the service can open every
GPU device so the admin can pick one during setup. `"vaapi"`, or `"qsv"`
with `transcoding.qsvDevice`, limits it to that render node, and `"none"`
blocks them all. `accelerationDevices` sets the list directly. The host
still needs GPU drivers in `hardware.graphics.extraPackages`, like
`intel-media-driver` and `vpl-gpu-rt` for Intel.

## Setup

The first visit goes to `/setup`. How it creates the admin depends on
whether `MATINEE_OIDC_ISSUER_URL` and `MATINEE_OIDC_CLIENT_ID` are set.

Without OIDC, the server logs a setup token at start, or uses
`MATINEE_SETUP_TOKEN`. Enter it, pick a username, and create a passkey. If
`MATINEE_PASSKEYS_ENABLED=false` too, there's no way to create an admin,
and setup says so.

With OIDC, setup only offers the provider. The first sign-in becomes admin
only if its role claim is `admin`. The claim is `matinee_role` unless
`MATINEE_OIDC_ROLE_CLAIM` says otherwise. In Pocket ID, give a group like
`matinee-admins` the custom claim `matinee_role` = `admin`. Custom claims
need the `profile` scope.

Setup then asks for a GPU, unless `MATINEE_HARDWARE_ACCELERATION` is set,
and for libraries. You can skip either and set them in Settings later.

## Configuration

Settings are environment variables, documented in `.env.example`. Any of
them can be read from a file with `NAME_FILE`. The important ones:

- `PUBLIC_URL`: the https origin people use. Passkeys only work there.
- `MATINEE_WEB_DIST`: the built web app.
- `MATINEE_WATCH_LIBRARIES` and `MATINEE_SCAN_INTERVAL_HOURS`: see
  [Scanning](#scanning).

The authentication and transcoding variables are defaults for Settings →
Authentication and Settings → Transcoding. The database stores only fields
an admin actually changed, so later changes to a variable still apply to
the rest. Clearing a text field goes back to the variable. The server logs
every variable a saved value overrides.

### OIDC

Admins configure single sign-on in Settings → Authentication, and changes
apply on the next sign-in. Register `$PUBLIC_URL/api/auth/oidc/callback`
as the redirect URI. To create the admin through the provider, set the
`MATINEE_OIDC_*` variables, since Settings isn't reachable before setup.

A new account takes its username from `MATINEE_OIDC_USERNAME_CLAIM`
(`preferred_username`) and its display name from `MATINEE_OIDC_NAME_CLAIM`
(`name`). Either falls back to the standard claim when the one it names is
missing. Both apply only when the account is created; later sign-ins don't
change them.

`MATINEE_OIDC_GROUPS_CLAIM` names a claim with a group name or list, and
dotted paths like `realm_access.roles` work. Access groups linked to a
provider group sync their members on every sign-in. Memberships set in
Matinee aren't touched.

`MATINEE_OIDC_POLICY_CLAIM` names a claim with a per-account access
override, as an object or a JSON string:

```json
{
  "libraries": ["Movies", "Family"],
  "maxBitrate": 8000000,
  "transcode": true,
  "downloads": false,
  "maxStreams": 2
}
```

Omitted fields follow the account's groups. Libraries are names, matched
case-insensitively, or ids. `"all"` includes future libraries. Bit rates
are bits per second, minimum 1000000, and `null` removes a limit. A
missing claim clears an override the provider set, but keeps one an admin
set. Invalid policies get logged and ignored.

Only the provider's admins should be able to set the role, groups, and
policy claims.

Add `offline_access` to `MATINEE_OIDC_SCOPES` if the provider supports
refresh tokens. A task then refreshes roles, pictures, and access every six
hours, so app-only users stay current. If the provider permanently rejects
a token, Matinee stops trying. With `MATINEE_OIDC_SIGN_OUT_REFUSED=true` it
also signs that account out everywhere.

A `picture` claim becomes the account picture until the user uploads or
removes one. Pictures are cropped to 256px squares in
`$MATINEE_DATA_DIR/avatars`.

## Access

Admins see everything with no limits. Everyone else gets access from
groups in Settings → Access. A group sets:

- Which libraries, or all of them including future ones. A hidden library
  doesn't show up anywhere, not even by guessing its URL.
- A streaming bit rate limit. Files over it play as an encode. Downloads
  aren't limited.
- Whether the server may encode video for them.
- Whether they may download.
- How many devices may play at once.

An account in several groups gets the most generous combination. The
built-in Everyone group holds every account and starts with all libraries
and no limits. To make access opt-in, remove its libraries and grant them
through other groups. A group that opens no libraries doesn't affect
limits, so an emptied Everyone won't override other groups.

Admins add accounts to groups in Settings → Users. Invite links can assign
groups, and groups can follow an OIDC group. The user menu's Edit access
overrides settings for one account, as does the OIDC policy claim. Changes
apply on the next request, including the next chunk of a playing stream.

## Branding

Settings → Branding sets the theme accent for light and dark mode, and can
turn on an artwork wall behind the login form. It's off by default. The
wall only uses already-downloaded images from libraries Everyone can see,
because anyone can open the login page. While it's on, `/api/artwork`
serves those images in the two smallest sizes without a session.

## Scanning

A scan only reads the folders it's given and only writes changes. Scans
run one at a time and start from:

- The file watcher, for changed folders.
- A full scan one minute after startup.
- A full scan every `MATINEE_SCAN_INTERVAL_HOURS`, default 12, 0 to turn
  off.
- Scan now in Settings → Libraries, or adding or editing a library.
- Run now on Scan libraries in Settings → Jobs.

The watcher uses inotify. It waits until a library has been quiet for 10
seconds, then scans what changed, so Sonarr, Radarr, and Bazarr imports
show up on their own. inotify can't see changes another host makes on an
NFS or SMB share, so those wait for the timed scan. Large libraries can
run out of watches. The server warns, and you can raise
`fs.inotify.max_user_watches`. `MATINEE_WATCH_LIBRARIES=false` turns the
watcher off.

A file that's renamed or moved keeps its watch progress if one scan sees
both paths with the same size and either the same name or modification
time. Its subtitles move with it.

Scans skip hidden files and NAS folders like `@eaDir` and `#recycle`. To
avoid emptying a library when storage disappears, a scan:

- Skips a library folder that's missing, unreadable, or suddenly empty,
  and logs a warning. Point libraries at the share's mount point, not a
  folder above it, or this check won't catch an unmounted share.
- Keeps everything under a folder it couldn't fully list.
- Deletes nothing if the server stops partway through.

## Metadata

Each library picks a provider and a language:

- TMDB, for movies and shows. Radarr uses it. Needs `MATINEE_TMDB_API_KEY`.
- TheTVDB, for shows in Sonarr's season order, and movies. Needs
  `MATINEE_TVDB_API_KEY`, plus `MATINEE_TVDB_PIN` for user-supported keys.

A show is a top-level folder. A movie is a folder with one video, or a
lone file. `Season 2` folders and `S02E05` in names give episode numbers.
Matching tries provider ids in the folder name first (`{tvdb-81189}`,
`[tmdbid-603]`, `{imdb-tt0133093}`), then the previous match, then ids from
another provider, then a search by name and year. Admins fix bad matches
with Fix match on the title page.

New titles, unmatched titles older than a day, titles with new files, and
titles 30 days old get refreshed after a scan. ffprobe reads codecs and
tracks of new or changed files in the background.

Metadata includes the first 20 actors, studios, and key crew: directors
and writers for movies, creators and series-level directors and writers
for shows. TheTVDB lists crew per episode only, so its shows get cast and
studios.

Artwork downloads to `$MATINEE_DATA_DIR/artwork`, with WebP copies at 240,
480, 960, and 1920 px made on first request, or JPEG and PNG if ffmpeg
lacks libwebp. Clients use `artworkPath()` or `artworkSrcSet()`. Each image
also gets a BlurHash for placeholders. Expect about 150 KB per image, so a
few GB for 1,000 titles.

Admins can replace a poster, backdrop, logo, or still with Edit images.
It lists the provider's options and accepts JPEG, PNG, and WebP uploads up
to 25 MB. Refreshes keep the admin's choices.

To add a provider, implement `MetadataSource` in
`apps/server/src/metadata/types.ts`, list it in `sources.ts`, and add its id
to `METADATA_PROVIDERS` in the contract.

## Requests

People can request a title the server doesn't have, from search, from
Discover, or from a show in the library that is missing seasons. A group's
access says whether its members may request, whether a request waits for
an admin or is added right away, and how many titles they may request in a
number of days. Existing groups start with requests off. Admins answer what waits
under Requests in the account menu, or on the title's page.

There is one request per title and library. It collects the seasons
requested and everyone who requested it or wants to be told. Whether a title is here is
never stored. It is read from the library on every call with the viewer's
library access, so a deleted file stops showing as playable and a title in
a library someone can't see stays hidden from them.

### Catalog and Discover

Search for titles the server lacks goes to the metadata provider of the
library a request would land in. Discover, browsing with filters, and the
rows of related titles on a title's page come from TMDB and need
`MATINEE_TMDB_API_KEY`.

- Discover's rows are TMDB's weekly trending movies and shows,
  recommendations for the viewer's last watched title, popular titles out
  in the next 90 days, and what others requested.
- Browsing filters TMDB's movies or shows by genre, release year, user
  score, votes, age rating, original language, and runtime. The age
  ratings are those of the library language's country. Sorting by score
  leaves out titles with fewer than 250 votes.
- A title's page lists its recommendations and, for a movie, the rest of
  its collection.

Provider answers are cached: search and feeds for 6 hours, details for 24.
When a provider is down the last answer is served and marked stale.
Library search doesn't depend on any of it.

### Connections

A connection sends approved requests to a download manager: Radarr, Sonarr,
or By hand, where an admin adds the file and the scan finds it. Under
Settings → Requests each library picks the connection that fills it, with
its own quality and folder. The library needs a metadata provider. Radarr
needs a TMDB id and Sonarr a TheTVDB id, which Matinee looks up.

A connection's API key comes from `MATINEE_CONNECTION_<SLUG>_API_KEY`, or
its `_FILE` form, unless one is saved in the settings. A saved key is
stored in the database as is. The API only says where the key in use comes
from. On NixOS, put it in `services.matinee.secrets`.

To add a download manager, implement `FulfilmentSource` in
`apps/server/src/requests/fulfilment/types.ts` and list it in `sources.ts`.

### Anime

A library's mapping has a second, optional set of options under Anime: the
same quality, folder, and series type choices, used for anime instead of
the normal ones. Left empty, anime is sent like everything else.

The folder decides where anime lands. With Sonarr saving shows to
`/media/shows` and anime to `/media/anime`, and Matinee libraries on those
two folders, anime asked for through the Shows mapping lands in the Anime
library. A folder inside the library's own, like `/media/films/anime`,
lands in the same library. When a download manager sees the folder under
another path, as in a container, the settings ask for the library instead.

A title is anime when TheTVDB lists the Anime genre or TMDB has the "anime"
keyword. An admin can send a waiting request to another library before
adding it.

### Sending, progress, and arrival

An approved request is sent ten seconds after its approval. Until then the
one person who requested it can take it back, which is what Undo does for
someone whose requests need no approval. An unreachable connection is tried again after
5, 10, and 20 seconds. After that the request shows under Needs attention
with the error, and an admin retries it.

Progress is read once a minute per connection while something is on its
way, and kept in memory. A movie has arrived when a scan finds its file in
the library. A season has arrived with its first playable episode. A check
every five minutes covers anything a scan missed.

### Declines

An admin declines a waiting request with a reason, "Already have it" or
"Not for this server", and an optional note. An accepted request that
never turns up, under On the way or Needs attention, can be given up on,
which declines it with "Can't find a copy". Giving up leaves the download
manager alone: nothing there is cancelled or deleted. If the file turns up
anyway, the scan decides as always, and the request counts as arrived.

A decline doesn't run out. The title shows as not available to everyone
who can see its library, and nobody can request it, until an admin lifts
the decline from the request under Done. Allow requests again removes the
request, so the title can be requested afresh. Add after all accepts it as
it was, with its requesters and followers, and sends it. Only the people
who requested or follow a declined title are told who declined it, why,
and the admin's note. Discover's rows leave declined titles out; search
and browsing still show them. A declined request doesn't count against
anyone's limit.

### Notifications

Everyone who requested a title or follows it is told once when it is ready,
or when it is declined or given up on. Admins get a summary of waiting requests at most
once an hour, and of failed ones once a day. Approvals and progress notify
nobody. They reach people through web push and the Android app's
background check; neither app shows them while it's open.

Web push is opt-in and needs HTTPS. The server makes its VAPID keys on
first use and keeps them in the database. It is the one place the server
calls a URL a client sent, so only the browsers' push services are
accepted: `fcm.googleapis.com`, `updates.push.services.mozilla.com`,
`web.push.apple.com`, and `*.notify.windows.com`.

## Jobs

Background work runs in queues for scans, ffprobe, metadata, thumbnails,
trickplay, artwork, subtitles, and profile pictures. Duplicate requests
join the existing job, and work a player is waiting on jumps the queue.
Settings → Jobs shows each queue's state and failures, and lets admins
pause queues, clear them, and set concurrency for the media info,
trickplay, subtitle, and artwork queues. Higher concurrency clears
backlogs faster but competes with streams.

Scheduled tasks fill the queues. They scan libraries, refresh metadata,
probe files, fetch artwork, make trickplay, prepare subtitles, clean up
encodes, expire sessions, and send and track requests. Each runs at startup, on an interval, or on
Run now. Queues are in memory. After a restart, the tasks find unfinished
work again from the database.

## Subtitles

The player supports subtitle files next to the video and streams inside
it.

- Files can be `.srt`, `.vtt`, `.ass`, `.ssa`, `.sup` (PGS), or `.idx`
  (VobSub), named like `Movie.en.srt` or `Movie.eng.forced.srt`. They can
  sit next to the video or in a `Subs` or `Subtitles` folder, including
  release-pack layouts like `Subs/<video name>/2_English.srt`.
- Embedded text tracks and PGS get extracted to
  `$MATINEE_DATA_DIR/subtitles` the first time someone turns them on. For
  Matroska, the server reads only that track's blocks using the file's
  cue index. Other files go through ffmpeg, which can take minutes on a
  large file.
- The Prepare subtitles task extracts text tracks ahead of time when it
  can do so cheaply, at low I/O priority, one file at a time. It never
  falls back to reading the whole video.
- Browsers with ASS support get ASS/SSA as authored, rendered with JASSUB.
  Fonts come from the file's attachments, at most 32 fonts and 24 MiB
  total, with a bundled fallback. Everything else gets WebVTT.
- PGS goes to the browser as `.sup` and renders with
  [libpgs](https://github.com/Arcus92/libpgs-js).
- VobSub and DVB can only be burned in, which forces an encode. Other
  clients can request PGS burn-in with `subtitle` in `mediaHlsPath()`.

The default track is your last language if you had subtitles on, then a
forced track in the audio language, then the file's default. Burn-in
tracks never start automatically. C toggles subtitles. G and H shift them
earlier or later by 0.1 s for the rest of the file.

## Playback

The default audio track plays straight from the file if the browser can
decode it. Other tracks, or audio the browser can't decode, play as a
stream with the video copied and one audio track. Any quality besides
Original plays an H.264 HLS encode. If the browser can't play the file at
all, the player switches to an encode on its own.

The player reports which audio codecs it decodes: Opus, AAC, MP3, FLAC,
ALAC, AC-3, or E-AC-3. Anything else, like DTS, TrueHD, or PCM, becomes
stereo Opus at 192 kb/s, or AAC at 256 kb/s without Opus. Mono is
128 kb/s. Surround uses the downmix from Settings → Transcoding. So a DTS
file in Chrome only costs an audio conversion.

Copied streams have no byte ranges, so seeking starts a new stream at the
nearest keyframe. Safari doesn't play them yet.

Encodes are six-second fMP4 HLS segments written to disk. Everyone playing
the same file, track, and quality with the same audio codecs shares one
encode, so each segment is encoded once. Seeking past the encoded part
restarts ffmpeg there. ffmpeg pauses when far enough ahead and stops two
minutes after the last request. Changing the file or transcoding settings
starts a new encode.

Encodes live in `$MATINEE_DATA_DIR/transcodes`, or `MATINEE_TRANSCODE_DIR`,
for `MATINEE_TRANSCODE_CACHE_HOURS` (24) after the last play. Past
`MATINEE_TRANSCODE_CACHE_GB` (50), the least recently played go first.

Bit rate limits, disabled encoding, and stream limits from
[Access](#access) apply here. A file with an unknown bit rate counts as
over the limit.

## Downloads

Download… in a file's menu offers the original file or a version for the
device. The version keeps or re-encodes the video, keeps or converts each
chosen audio track to AAC or Opus, and can burn in a picture subtitle. The
dialog shows an estimated size. Text subtitles save beside it as WebVTT.

The server doesn't store finished downloads. ffmpeg makes six-second fMP4
segments as the client fetches them and deletes the ones behind it. It
pauses ten segments ahead and stops 30 seconds after the client leaves.
When the client comes back, a new run starts at the next segment, even
after a restart, without redoing earlier work. Audio lines up sample for
sample across runs.

Download encodes, which re-encode video, run two at a time by default.
Download copies, which keep the video, run four. Both are queues in
Settings → Jobs. Downloads idle for `MATINEE_TRANSCODE_CACHE_HOURS` get
deleted.

Browsers download one stream from `downloadFilePath()`, which can't
resume. Apps fetch `downloadInitPath()`, then `downloadSegmentPath()` from
0 until it returns 204, and resume from the first missing segment. A 409
means the file or settings changed and the download has to restart.

If a segment isn't ready within 25 seconds, the server returns 503 with
Retry-After so proxies don't cut a silent connection. A download keeps its
place in the queue while the client retries at least every 30 seconds.

## Transcoding and ffmpeg

Matinee uses Jellyfin's filter chains and defaults, and expects
[jellyfin-ffmpeg](https://github.com/jellyfin/jellyfin-ffmpeg). Get it
from Nix (`jellyfin-ffmpeg`, already in the dev shell), the Debian and
Ubuntu packages on repo.jellyfin.org, or a portable build. Set
`MATINEE_FFMPEG_PATH` and `MATINEE_FFPROBE_PATH` if it isn't on `PATH`.

You need jellyfin-ffmpeg for:

- tonemapx, the software tone mapper for HDR10, HLG, and Dolby Vision,
  including profile 5. Without it, HDR looks washed out unless a GPU tone
  maps it.
- Full GPU paths, including BT.2390 tone mapping and `hwupload_vaapi`.
  Without them, VAAPI and QSV scale on the CPU.
- Pausing ffmpeg, which throttling needs.
- Stripping Dolby Vision and HDR10+ from copied streams.

Stock FFmpeg still handles software encoding, GPU encoding on VAAPI, QSV,
NVENC, and VideoToolbox, deinterlacing, and 10-bit HDR10 and HLG encodes.

Admins configure transcoding in Settings → Transcoding.
`MATINEE_HARDWARE_ACCELERATION`, `MATINEE_VAAPI_DEVICE`, and
`MATINEE_QSV_DEVICE` set its defaults. On startup and device changes, the
server tests each GPU encoder and tone mapper, and the page only offers
what passed. Run detection again after updating drivers or ffmpeg.

Intel's low-power encoder, VDENC, speeds up 4K and tone-mapped encodes. It
has a switch per codec, off by default. It needs Skylake or newer for
H.264, Ice Lake or newer for HEVC, and HuC firmware. Arc always uses it.

In Docker, pass through `/dev/dri` for VAAPI and QSV, plus the driver's
OpenCL runtime like `intel-compute-runtime` for OpenCL tone mapping. NVENC
needs the NVIDIA container toolkit.

## Trickplay

The seek bar shows preview frames. The server makes a 320 px thumbnail
every 10 seconds in 10×10 JPEG tiles under `$MATINEE_DATA_DIR/trickplay`.
A 24-minute 1080p episode took 18 seconds and 1.2 MB. A 99-minute 4K HDR
remux took two minutes and 4.3 MB.

Images get made after ffprobe reads a file, with a daily task catching the
rest. Opening a file moves it to the front of the queue.

By default ffmpeg decodes keyframes only, so thumbnails can be a second or
two off. Decoding every frame of that episode took four CPU minutes
instead of 20 seconds. Admins can change this, the interval, the width,
and GPU decoding in Settings → Trickplay. GPU decoding helps most when
decoding every frame, and failures fall back to the CPU.

Clients read `media.trickplay` and load tiles with `trickplayTilePath()`.
Players that read HLS image playlists can use `trickplayPlaylistPath()`,
but must send the `Authorization` header with tile requests.

## Watch parties

Accounts on the server watch a file together, at the same point. Someone
starts a party from the bar and shares its link; anyone with an account
joins with it, after the page asks. An account is in one party at a time.

- Everyone plays, pauses, and seeks for all. A party plays at normal speed.
- The owner picks what plays: whatever they open in the player, the party
  watches. Only the owner sets the queue. Anyone else's file becomes a
  suggestion, which the owner takes into the queue or dismisses.
- The owner names the party, hands it to another member, and removes
  members, who can't join that party again.
- A file that ends goes on to the queue's first, or the party rests at the
  end.
- A player that buffers falls behind alone and catches up after. Up to two
  seconds off it plays a little faster or slower; further off it jumps.

The party's state is a position at a moment on the server's clock, sent to
each member as a stream (`party.follow`). Players work out where that is
now and match it. A member with no stream open for a minute has left, and
when the owner leaves, the member who joined next owns the party. Parties
live in memory, so a restart ends them.

## Local and remote

Settings → Network holds what the server is told about its network. It
works none of it out.

- **Local networks**: the addresses that are at home, the private ranges by
  default. A request from any other address is remote. Friends on a VPN
  arrive with private addresses but through the upload, so take their range
  out.
- **Trusted proxies**: the reverse proxies in front of the server. Only
  from these does it believe `X-Forwarded-For`, which anyone can send.
  Without its proxy listed, every request looks like the proxy's, and the
  panel says so.
- **Upload speed**: what the connection sends. A watch party's remote
  members each get an equal share of it as their bit rate limit, on top of
  their group's. Local members aren't limited and don't count. The share
  applies when a player asks how to play, so a stream that runs already
  keeps its rate when someone joins.

The panel shows the address the server sees the admin's own browser at, and
whether that counts as local.

## Statistics

Each player session has a client-made id sent with progress reports and
stream requests. Reports count seconds actually played. The server caps
them at the session's age plus 30 seconds. Stream requests record whether
the file played directly, as a direct stream, or as a transcode, plus the
encoder, GPU, tone mapping, and audio conversion.

A session counts as a play after a minute or at the end. A file is
watched when a session reaches the end or someone marks it. Marking asks
for a time: now, the release date, or a custom date. Marked plays count
everywhere except the playback method breakdown.

Statistics, in the account menu, has four views. Times use the browser's
time zone. Other clients send `timeZone`, default UTC.

- Activity, for admins: current streams, watch time, top titles and
  genres, start times, and viewers.
- Playback, for admins: direct play vs. direct stream vs. transcode,
  encoders, source codecs, and clients.
- Library, for everyone: library contents, file arrivals over time, and
  resolutions, HDR, and codecs.
- Leaderboard, for everyone: watch time, plays, streaks, and completions.
  Only people who share their stats appear. You always see your own rank.

## Profiles and favorites

Everyone has a profile at `/profiles/<username>` showing their name and
picture. In Settings → Account, owners can also share their favorites and
their statistics. Both are off by default. Profiles require an account on
the server.

## How auth works

- Sessions are random tokens. The database stores only the SHA-256.
  Browsers get an HttpOnly cookie, apps send `Authorization: Bearer`.
  Sessions expire 30 days after last use. Settings → Account lists them
  and can sign any of them out.
- Passkeys use discoverable credentials with user verification, through
  SimpleWebAuthn.
- OIDC uses authorization code with PKCE, state, and nonce, through
  openid-client. Accounts match on issuer and subject, never email. Each
  account links one provider account. The server rejects a provider whose
  discovery document names a different issuer.
- You can't remove your last passkey or linked account. An admin who only
  uses SSO can't turn SSO off or change the issuer.
- Admins can turn passkeys off in Settings → Authentication, or default
  them off with `MATINEE_PASSKEYS_ENABLED=false`. SSO is then the only way
  in. The server only allows this once your own account is linked, and it
  shows how many accounts aren't. If the provider goes down while passkeys
  are off, run `delete from setting where key = 'passkeys'` and restart.
- Self sign-up is off by default. With passkeys and open registration on,
  anyone can create an account. `MATINEE_OPEN_REGISTRATION` sets the
  default. With OIDC sign-up allowed, or `MATINEE_OIDC_ALLOW_SIGN_UP`, an
  unlinked provider account creates a new one.
- Invite links in Settings → Users work once and expire. They stop working
  if the admin who made them is deleted or demoted.
- An OIDC sign-in whose username matches an existing unlinked account
  never signs in to it automatically, since that would hand the account to
  whoever controls the claim. The login page asks the person to sign in to
  that account and link it, or create a new one if sign-up is allowed.
- The server won't demote or delete the last admin. Roles are read on
  every request. Deleting a user deletes their sessions, passkeys, links,
  progress, favorites, and history.
- With SSO, the role claim sets the role on every sign-in: `admin`, `user`,
  or a list where admin wins. A claim that would demote the last admin is
  ignored and logged.
- A client secret saved in Settings is stored in plain text. Use
  `MATINEE_OIDC_CLIENT_SECRET_FILE` to keep it out of the database.

## Signing in apps

Apps get their own session, separate from the browser's. Both flows are in
the contract's `auth.app` and `auth.device` and return `{ token, user }`.
Apps send a device name like `Living room TV` and a platform: `android`,
`ios`, `linux`, `macos`, `tizen`, or `windows`.

Apps that can open a browser use OAuth for native apps (RFC 8252) with
PKCE:

1. Generate a code verifier and open `/authorize` in the system browser
   with `redirect_uri`, `state`, `code_challenge` as the base64url SHA-256
   of the verifier, `code_challenge_method=S256`, `platform`, and
   `device_name`. `appAuthorizePagePath()` builds the URL.
2. The page signs the person in and asks them to approve.
3. The browser redirects to `redirect_uri` with `code` and `state`. That's
   either a registered `matinee:` URI or a loopback URL like
   `http://127.0.0.1:43123/callback`.
4. Post `code` and `codeVerifier` to `/api/v1/auth/app/token`. Codes are
   single-use and expire after two minutes.

Apps without a browser, like TV apps, use the device grant (RFC 8628):

1. Post the device to `/api/v1/auth/device`. Show `userCode`, like
   `BCDF-GHJK`, and `verificationUri`, which is `$PUBLIC_URL/link`.
   `verificationUriComplete` has the code filled in, for a QR code.
2. A signed-in user opens the page, enters the code, and approves.
3. Poll `/api/v1/auth/device/token` with `deviceCode` every `interval`
   seconds. It returns `pending` until approved. After `expiresIn`, ten
   minutes, it returns 404 and the app starts over.

Both pages warn that approving gives the device the account. That warning
is the only defense against someone sending you their own link or code.

## Local server discovery

Discovery uses IPv4 UDP on port 8421. Clients broadcast the ASCII string
`Matinee discovery v1`, padded with spaces to exactly 512 bytes and no
newline, to each interface's broadcast address and `255.255.255.255`, then
listen for unicast replies. A three-second scan is enough.

Replies are UTF-8 JSON, at most 512 bytes:

```json
{ "version": 1, "name": "Matinee", "url": "https://media.example.com" }
```

`name` is at most 64 code points and is always `Matinee` for now. `url` is
the server's `PUBLIC_URL`, an http or https URL of at most 400 code points
with no credentials. Clients ignore unknown fields, reject other versions
and malformed replies, and drop duplicate URLs. Constants and the schema
are in `packages/contracts/src/discovery.ts`. Discovery isn't part of
OpenAPI.

`MATINEE_DISCOVERY_ENABLED=false` turns it off. Loopback URLs aren't
advertised, so set `PUBLIC_URL` to something the LAN can reach. A bind
failure only logs a warning. Broadcasts don't cross routers, Docker bridge
networks, or most emulator NATs, so use host networking in containers.
Only allow UDP 8421 on trusted interfaces. In NixOS, `discovery.enable`
controls it and `openFirewall` opens the port.

The server rate-limits replies to one per source IP per second and 20 per
second total. The padded probe prevents amplification. Discovery isn't
authenticated, so check `/api/health` before using a URL and never sign in
automatically.

## Not built yet

- Copied streams in Safari. Encodes work there.
- Surround audio in streams. Converted audio is always stereo.
- Text subtitle burn-in for devices that can't render ASS.
- NFO metadata, local artwork, absolute episode numbers for anime, and
  setting provider keys in Settings.
