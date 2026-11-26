# Matinee server

The Hono server behind every client. It scans libraries, fetches metadata,
streams and transcodes with jellyfin-ffmpeg, and handles accounts and
sign-in. It serves the web app too, so one process is the whole install.

To work on it, [CONTRIBUTING.md](../../CONTRIBUTING.md) sets up the dev
shell.

- [Running it](#running-it)
- [Libraries](#libraries)
- [Access](#access)
- [Playback](#playback)
- [Statistics and profiles](#statistics-and-profiles)
- [Requests](#requests)
- [Recommendations](#recommendations)
- [Accounts and sign-in](#accounts-and-sign-in)
- [For app developers](#for-app-developers)
- [Not built yet](#not-built-yet)

## Running it

### Running in production

```sh
pnpm install --frozen-lockfile
pnpm build
MATINEE_WEB_DIST=apps/web/dist PUBLIC_URL=https://media.example.com \
  DATABASE_URL=postgres://... pnpm start
```

The build bundles the server and its migrations into `apps/server/dist`,
so it runs on plain Node 24. A service manager can skip pnpm and run
`node dist/server/index.mjs` from `apps/server` with
`NODE_ENV=production`.

### Running on NixOS

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

The input follows `main`. Pin a release by its tag, like
`github:zekurio/matinee/v0.0.1`.

The server listens on `127.0.0.1:8420` and the module wants an https
`publicUrl`, so put a reverse proxy in front:

```nix
services.caddy = {
  enable = true;
  virtualHosts."watch.example.com".extraConfig = "reverse_proxy 127.0.0.1:8420";
};
```

On a tailnet, `tailscale serve --bg 8420` works too, with the
`https://<host>.<tailnet>.ts.net` address as `publicUrl`.

Data lives in `/var/lib/matinee` and encodes in
`/var/cache/matinee/transcodes`. The service can't see `/home`, so keep
libraries somewhere like `/srv` or `/mnt`.

The options are in `nix/module.nix`. `settings` takes any variable from
[`.env.example`](../../.env.example), and `secrets` takes files that
systemd passes as credentials. For a remote database with a password, set
`secrets.DATABASE_URL` and `database.createLocally = false`.

With `transcoding.hardwareAcceleration` unset, the service may open every
GPU, so the admin can pick one in setup. `"vaapi"`, or `"qsv"` with
`transcoding.qsvDevice`, allows only that render node, and `"none"`
blocks them all. `accelerationDevices` sets the list by hand. The host
still needs drivers in `hardware.graphics.extraPackages`, like
`intel-media-driver` and `vpl-gpu-rt` for Intel.

### Setup

The first visit goes to `/setup`. Without OIDC, it asks for the setup
token the server logs at start, or `MATINEE_SETUP_TOKEN`, then a username
and a passkey. On NixOS the token is in `journalctl -u matinee`. It asks
even when `PUBLIC_URL` is localhost, since `HOST` defaults to `::` and the
server answers on every address.

With `MATINEE_OIDC_ISSUER_URL` and `MATINEE_OIDC_CLIENT_ID` set, setup
offers only the provider. The first sign-in becomes admin only if its role
claim is `admin`. That claim is `matinee_role` unless
`MATINEE_OIDC_ROLE_CLAIM` names another. In Pocket ID, give a group like
`matinee-admins` the custom claim `matinee_role` = `admin`. Custom claims
need the `profile` scope. With no OIDC and `MATINEE_PASSKEYS_ENABLED=false`,
nobody can become admin, and setup says so.

Then setup asks for a GPU, unless `MATINEE_HARDWARE_ACCELERATION` is set,
and for libraries. Both can wait for Settings.

### Configuration

Settings are environment variables, each described in `.env.example`.
Any of them can come from a file with `NAME_FILE`. The ones to know:

- `PUBLIC_URL` is the https origin people use. Passkeys only work there.
- `MATINEE_WEB_DIST` is the built web app.
- `MATINEE_WATCH_LIBRARIES` and `MATINEE_SCAN_INTERVAL_HOURS` control
  [scanning](#scanning).

The authentication and transcoding variables are defaults for those pages
in Settings. The database keeps only the fields an admin changed, so the
rest still follow their variables, and clearing a field goes back to its
variable. The server logs every variable a saved value overrides.

## Libraries

### Scanning

A scan reads only the folders it's given and writes only what changed.
Scans run one at a time. They start from the file watcher, a minute after
startup, every `MATINEE_SCAN_INTERVAL_HOURS`, which is 12 by default and
0 for never, and from Scan now in Settings.

The watcher uses inotify and scans a library once it has been quiet for
10 seconds, so imports from Sonarr, Radarr, and Bazarr show up on their
own. It can't see what another host changes on an NFS or SMB share, so
those wait for the timed scan. A large library can run out of watches.
The server warns, and raising `fs.inotify.max_user_watches` fixes it.
`MATINEE_WATCH_LIBRARIES=false` turns the watcher off.

A renamed or moved file keeps its progress and subtitles when one scan
sees both paths with the same size and the same name or modification time.

Watch progress, favorites, and plays also survive a file that goes for
good, like a WEB-DL that Radarr or Sonarr upgrades to a Blu-ray. As in
Jellyfin, they're kept by what the file was, its title's match and ids
like TMDB and IMDb, plus the season and episode for a show, and a new
file with one of those ids takes them back, whether it comes in the same
scan, months later, or in another library. They wait 90 days, and a file
whose title matched nothing keeps nothing. Picked audio and subtitle
tracks don't carry over, since releases number their tracks differently.

So that storage going away can't empty a library, a scan skips a library
folder that's missing, unreadable, or suddenly empty, keeps everything
under a folder it couldn't list, and deletes nothing if the server stops
partway. Point a library at the share's mount point, not a folder above
it, or the check misses an unmounted share. Scans also skip hidden files
and NAS folders like `@eaDir` and `#recycle`.

### Metadata

Each library picks a provider and a language. TMDB, which Radarr uses,
needs `MATINEE_TMDB_API_KEY`. TheTVDB, which has shows in Sonarr's season
order, needs `MATINEE_TVDB_API_KEY`, plus `MATINEE_TVDB_PIN` for a
user-supported key. Both do movies and shows.

A show is a top-level folder. A movie is a folder with one video, or a
lone file. `Season 2` folders and `S02E05` in names give episode numbers.
Matching tries ids in the folder name first, like `{tvdb-81189}`,
`[tmdbid-603]`, or `{imdb-tt0133093}`, then the previous match, then ids
from another provider, then a search by name and year. Admins correct a
wrong one with Fix match on the title's page, and Edit images there
replaces artwork, keeping their choice through refreshes.

After a scan, the server refreshes new titles, titles with new files,
unmatched titles older than a day, and titles 30 days old. ffprobe reads
new and changed files in the background.

Artwork goes to `$MATINEE_DATA_DIR/artwork`, about 150 KB an image, so a
few GB for 1,000 titles. Resized WebP copies are made on first request.
Clients use `artworkPath()` or `artworkSrcSet()`. An image's id is a hash
of the provider's URL, which anyone can work out, so `/api/artwork` serves
an id only for images the catalog showed or a title the viewer can open
uses. Any other id is a 404.

A new provider implements `MetadataSource` in `src/metadata/types.ts`,
goes in `sources.ts`, and gets its id in the contract's
`METADATA_PROVIDERS`.

A show's status is a `TitleStatus`: `continuing`, `ended`, or
`unreleased`, which clients word themselves. `src/metadata/status.ts` maps
the provider's word to it with Jellyfin's table, plus TheTVDB's `Upcoming`
as `unreleased`. Any other word, and every movie, has none.

### Filtering the libraries

Library, genre, and studio pages filter by what the metadata says, with
choices only from titles the viewer can see there. A title's age rating
comes from the country of its library's language, or the US, and the
order of ratings from TMDB, so the age filter needs
`MATINEE_TMDB_API_KEY`. Unrated titles fail an age limit. TheTVDB has no
community score, so its titles fail a score bound.

### Jobs

Background work runs in queues, which scheduled tasks fill at startup, on
an interval, or from Run now. A duplicate joins the job already there, and
work a player waits on jumps ahead. Settings → Jobs shows each queue and
its failures, pauses and clears them, and sets the concurrency of the
heavy ones. More clears a backlog sooner and takes more from streams.
Queues live in memory, and after a restart the tasks find unfinished work
in the database again.

## Access

Admins see everything and may do everything. Everyone else gets access
from groups in Settings → Access. A group sets one list of capabilities,
`AccessPolicy` in `packages/contracts/src/access.ts`:

- which libraries, or all of them, future ones too. A library someone
  can't see doesn't show up anywhere, not even by URL.
- a bit rate limit for streaming. Files over it play as an encode.
  Downloads aren't limited.
- whether the server may encode video for them
- how many devices may play at once
- whether they may download
- whether they may ask for titles: not at all, with an approval, or
  added right away, and how many titles in how many days
- whether they may make API tokens
- how far they take on each part of running the server: none, view, or
  manage. See [Permissions](#permissions).

Someone in several groups gets the most generous mix: every library any
of them opens, the loosest limits, and the highest level of each
capability. The built-in Everyone group holds every account and starts
with all libraries and no limits. To make access opt-in, take its
libraries away and grant them through other groups. A group that opens
no libraries doesn't count for the streaming limits, so an emptied
Everyone won't hold anyone back. The other capabilities add up whether a
group opens a library or not.

Settings → Users puts accounts in groups. Invite links can assign groups,
and a group can follow an OIDC group. Edit access in the user menu
overrides one account, as the OIDC policy claim does. Changes apply on the
next request, the next chunk of a playing stream included.

### Permissions

The server checks permissions named `resource.action`, like
`media.download`, `library.scan`, or `adminRequest.approve`.
`PERMISSIONS` in `packages/contracts/src/permissions.ts` lists them.
Groups and accounts never list them: `permissionsOf` in
`packages/contracts/src/access.ts` works them out from the capabilities.
Only API tokens pick permissions one by one, see [API tokens](#api-tokens).

- Every procedure behind a sign-in names the permission it takes, as the
  second argument of `get`, `post`, and the rest in `packages/contracts`,
  and the OpenAPI document repeats it in each operation's description.
  `authed` in `rpc/base.ts` checks it on every call. A procedure that
  names none takes `all`, so a new one is an admin's alone until someone
  names its permission.
- Every account holds `BASE_PERMISSIONS`: using the app as a viewer and
  looking after its own account, its passkeys, sessions, and existing API
  tokens included. Nobody grants or takes those. `User.permissions` names
  them with the rest, and `all` alone for an admin, so a client reads the
  list without knowing which ones they are.
- The capabilities grant the rest. Downloads grant `media.download`,
  API tokens `apiToken.create`, and requests `request.create`, with
  `request.autoApprove` when titles are added right away. Each part of
  running the server, `AREA_PERMISSIONS` in `access.ts`, grants its view
  permissions at View and all of them at Manage:

  | Part             | View                                                              | Manage adds                                                                               |
  | ---------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
  | Request queue    | `adminRequest.read`                                               | `adminRequest.approve`, `.decline`, `.retry`                                              |
  | Connections      | `fulfilment.read`                                                 | `fulfilment.create`, `.update`, `.delete`                                                 |
  | Libraries        |                                                                   | `folder.read`, `library.create`, `.update`, `.delete`, `.scan`                            |
  | Metadata         |                                                                   | `title.update`                                                                            |
  | Users and groups | `adminUser.read`, `group.read`, `invite.read`, `serverStats.read` | the rest of `adminUser`, `group`, `invite`, `adminSession.delete`, `adminApiToken.delete` |
  | Server settings  | the settings' `read`, `authSettings.read`, `job.read`             | the settings' `update`, `job.update`, `serverSetup.update`                                |

  Libraries and Metadata are all or nothing.

- An admin holds `all`. Only `all` makes someone an admin or takes it
  away, and no group grants it: the role is in Settings → Users, or the
  OIDC role claim.
- An account's override sets any capability over its groups, each part
  of running the server on its own. One it leaves out follows the groups.
- Nobody grants or takes away a permission they don't hold. That covers
  what a change to a group's capabilities adds or removes, deleting a
  group, putting an account in a group or taking it out, an invite link's
  groups, and what an override grants or holds back. Someone who edits groups
  can't give themselves more through one. Only an admin changes, signs
  out, or deletes an admin's account.
- Saving Settings → Authentication takes `all`, since the provider and its
  role claim decide who signs in as an admin. `library.create` opens any
  folder the server can read as a library, so grant it as you would the
  admin role. The `fulfilment` permissions show every connection, but
  never a library the holder's groups don't open: a folder that lands in
  one reads as a library they can't see, and the by-hand source offers
  only the folders of libraries they see. A connection that sends titles
  to such a library can be looked at and tested, not changed or deleted,
  and a save that would send to one is refused.
- The web and Flutter apps show a section of Settings, or the request
  queue, to whoever holds its permission. The Samsung TV app has neither.

Settings → Branding sets the accent for light and dark mode, and can put a
wall of artwork behind the login form. Anyone can open the login page, so
the wall uses only downloaded images from libraries Everyone can see.
While it's on, `/api/artwork` serves those in the two smallest sizes
without a session.

## Playback

The default audio track plays straight from the file when the browser
decodes it. Another track, or audio the browser can't decode, plays as a
stream with the video copied and one audio track. Any quality but
Original plays an H.264 HLS encode, and so does a file the browser can't
play at all.

The web player tells the server which audio it decodes, from Opus, AAC,
MP3, FLAC, ALAC, AC-3, and E-AC-3. Anything else, like DTS, TrueHD, or
PCM, becomes stereo Opus at 192 kb/s, or AAC at 256 kb/s without Opus.
Mono gets 128 kb/s, and surround uses the downmix from Settings →
Transcoding. A DTS file in Chrome costs only an audio conversion.

Copied streams have no byte ranges, so a seek starts a new stream at the
nearest keyframe. Safari doesn't play them yet.

Encodes are six-second fMP4 HLS segments on disk, shared by everyone
playing the same file, track, quality, and audio codecs. A seek past
what's encoded restarts ffmpeg there. ffmpeg pauses when it's far enough
ahead and stops two minutes after the last request. Encodes stay in
`$MATINEE_DATA_DIR/transcodes`, or `MATINEE_TRANSCODE_DIR`, for
`MATINEE_TRANSCODE_CACHE_HOURS` after the last play, 24 by default. Past
`MATINEE_TRANSCODE_CACHE_GB`, 50 by default, the least recently played go
first.

The bit rate limit, the encoding switch, and the stream limit from
[Access](#access) apply here. A file with an unknown bit rate counts as
over the limit.

### Subtitles

Subtitle files sit beside the video or in a `Subs` or `Subtitles` folder,
named like `Movie.en.srt` or `Movie.eng.forced.srt`, and release-pack
layouts like `Subs/<video name>/2_English.srt` work. They can be SRT,
WebVTT, ASS, SSA, PGS `.sup`, or VobSub `.idx`.

Embedded text and PGS tracks go to `$MATINEE_DATA_DIR/subtitles` the
first time someone turns them on. From Matroska the server reads only
that track's blocks. Other containers go through ffmpeg, which can take
minutes. The Prepare subtitles task extracts text tracks ahead of time
where that's cheap, one file at a time at low I/O priority.

Browsers that draw ASS get it as authored, through JASSUB with the file's
attached fonts, at most 32 fonts and 24 MiB. PGS goes to the browser for
[libpgs](https://github.com/Arcus92/libpgs-js), and everything else as
WebVTT. VobSub and DVB can only be burned in, which takes an encode, and
other clients ask for PGS burn-in with `subtitle` in `mediaHlsPath()`.

The default track is your last language if you had subtitles on, then a
forced track in the audio language, then the file's default. C toggles
subtitles, and G and H shift them 0.1 s earlier or later.

### Transcoding and ffmpeg

Matinee uses Jellyfin's filter chains and defaults, and expects
[jellyfin-ffmpeg](https://github.com/jellyfin/jellyfin-ffmpeg). Get it
from Nix, where the dev shell has it, from the Debian and Ubuntu packages
on repo.jellyfin.org, or as a portable build. Set `MATINEE_FFMPEG_PATH`
and `MATINEE_FFPROBE_PATH` when it isn't on `PATH`.

Stock FFmpeg encodes in software and on VAAPI, QSV, NVENC, and
VideoToolbox, deinterlaces, and makes 10-bit HDR10 and HLG encodes. You
need jellyfin-ffmpeg for:

- tonemapx, the software tone mapper for HDR10, HLG, and Dolby Vision,
  profile 5 included. Without it HDR looks washed out unless a GPU tone
  maps it.
- full GPU paths, with BT.2390 tone mapping and `hwupload_vaapi`. Without
  them VAAPI and QSV scale on the CPU.
- pausing ffmpeg, which throttling needs
- stripping Dolby Vision and HDR10+ from copied streams

Settings → Transcoding configures it, with `MATINEE_HARDWARE_ACCELERATION`,
`MATINEE_VAAPI_DEVICE`, and `MATINEE_QSV_DEVICE` as defaults. At startup
and when the device changes, the server tests each GPU encoder and tone
mapper, and the page offers only what passed. Run detection again after
updating drivers or ffmpeg.

Intel's low-power encoder, VDENC, speeds up 4K and tone-mapped encodes.
Each codec has a switch, off by default. It needs Skylake or newer for
H.264, Ice Lake or newer for HEVC, and HuC firmware. Arc always uses it.

In Docker, pass through `/dev/dri` for VAAPI and QSV, and the driver's
OpenCL runtime, like `intel-compute-runtime`, for OpenCL tone mapping.
NVENC needs the NVIDIA container toolkit.

### Trickplay

The seek bar previews a 320 px frame every 10 seconds, from 10×10 JPEG
tiles in `$MATINEE_DATA_DIR/trickplay`. A 24-minute 1080p episode takes
about 18 seconds and 1.2 MB. Files get them after ffprobe reads them, and
opening one moves it to the front. ffmpeg decodes only keyframes by
default, so a frame can be a second or two off. Settings → Trickplay can
decode every frame, at about twelve times the CPU, and sets the interval,
the width, and GPU decoding.

Clients load tiles with `trickplayTilePath()`. Players that read HLS image
playlists can use `trickplayPlaylistPath()`, sending `Authorization` with
the tile requests.

### Intros and credits

Players offer Skip intro, and the next episode once the credits start. The
server takes intros, credits, recaps, and previews from chapter names like
`Opening`, `Credits`, or `Abspann`. Without those, it fingerprints the
audio at each end of an episode with ffmpeg's `chromaprint` muxer and
compares it with up to three nearby episodes. A shared stretch of 15
seconds to 2 minutes is the intro, and of up to 7½ minutes the credits.
The end of a stretch moves to a silence that starts within 2 seconds of
it, or to a keyframe in that silence. Without a silence it moves to a
keyframe within a second, which is usually the cut to the episode.
Episodes get checked after ffprobe reads them, a season at a time.

`playback.start` returns the `segments` to offer a skip for, and
`upNextAt`, where to start offering `next`. Without credits that's 30 to
40 seconds before the end of an episode of 10 minutes or more, as in
Jellyfin. Credits that run to the end get no skip. Once a viewer skips a
segment, its button stays away until they seek, even when the skip lands
a little short of the end.

### Downloads

Download… in a file's menu offers the original or a version for the
device, which can
re-encode the video, convert audio to AAC or Opus, and burn in a
picture subtitle. Text subtitles save beside it as WebVTT.

`downloads.resolve` also answers with what the file offers once it plays
with no server to ask: the skip segments, where to start offering the
next episode, and the show's files in order, for the app to keep with the
download.

The server keeps no finished downloads. ffmpeg makes six-second fMP4
segments as the client fetches them, deletes the ones behind it, and
stops 30 seconds after the client leaves. A client that comes back
resumes at the next segment, even after a restart. Re-encodes run two at
a time and copies four, in queues under Settings → Jobs. A download left
idle for `MATINEE_TRANSCODE_CACHE_HOURS` gets deleted.

Browsers download one stream from `downloadFilePath()`, which can't
resume. Apps fetch `downloadInitPath()`, then `downloadSegmentPath()` from
0 until it answers 204, and resume at the first missing segment. A 409
means the file or the settings changed, and the download starts over. A
segment that isn't ready in 25 seconds answers 503 with Retry-After, so
proxies don't cut a silent connection. A client that retries at least
every 30 seconds keeps its place in the queue.

### Watch parties

Accounts on the server can watch a file together from a shared link, one
party at a time. Everyone plays, pauses, and seeks for everyone. The owner
picks what plays, takes others' picks as suggestions, and can hand the
party on or remove members for good. A player that falls behind catches up
by playing a little faster or slower, or jumps when it's more than two
seconds off.

The party's state is a position at a moment on the server's clock, which
`party.follow` streams to each member. A member with no stream open for a
minute has left, and the next to join takes over from an owner who leaves.
Parties live in memory, so a restart ends them.

### Local and remote

Settings → Network holds what the server is told about its network. It
works none of it out.

- Local networks are the addresses at home, the private ranges by
  default. Friends on a VPN arrive with private addresses but through your
  upload, so take their range out.
- Trusted proxies are the reverse proxies in front of the server. Only
  from them does it believe `X-Forwarded-For`. Without its proxy listed,
  every request looks like the proxy's, and the panel says so.
- Upload speed splits evenly between a watch party's remote members, as a
  bit rate limit on top of their group's.

## Statistics and profiles

Each player session has an id the client makes, sent with progress reports
and stream requests. Reports count seconds actually played, capped at the
session's age plus 30 seconds. Stream requests record how the file played,
with the encoder, GPU, and tone mapping. A session counts as a play after
a minute or at the end. Marking a file watched asks when, and counts as a
play everywhere but the breakdown of how files played.

Statistics, in the account menu, shows whoever holds `serverStats.read`
current streams, watch time, and how files played, and shows everyone what
the libraries hold and a
leaderboard of the people who share their stats. Times are in the
browser's time zone. Other clients send `timeZone`, UTC by default.

Sessions, watching now, and the Clients panel name a client by what it
said it is, as Jellyfin's clients name themselves. Each client sends its
name to `account.sessions.identify` when it starts: the web app the
browser's, like `Firefox` or `Chrome Android`, and the apps their own,
like `Matinee Android TV`. The server keeps it on the session, and a
player session takes it from the session that asked for it, so a stream
request names its client too. It never reads a name from the User-Agent.

Profiles at `/profiles/<username>` show a name and picture to accounts on
the server. Owners can share their favorites and statistics there from
Settings → Account. Both start off.

## Requests

People can request a title the server lacks from search, from Discover, or
from a library show missing seasons. A group says whether its members may
request, with the `request.create` permission, whether what they ask for
is added at once, with `request.autoApprove`, or waits for someone with
`adminRequest.approve`, and how many titles they may request in a number of
days. Groups start with requests off.

There's one request per title and library, with the seasons asked for and
everyone who asked or wants to hear. Whether a title is here is never stored. Every
call reads it from the library with the viewer's access, so a deleted file
stops showing as playable and a hidden library stays hidden.

### Catalog and Discover

Search for titles the server lacks asks the provider of the library a
request would land in. Discover, browsing, related titles, and the TMDB
part of person pages need `MATINEE_TMDB_API_KEY`. Discover's rows show only
titles the viewer can request. TMDB can't leave out what's here, so a
browse page of only those can come back short. Provider answers are cached
for 6 hours for search and feeds and a day for details, and come back
marked stale while a provider is down.

### Connections

A connection sends approved requests to Radarr or Sonarr. Settings →
Requests sets them up as Seerr does, with quality profiles, root folders,
tags, Sonarr's anime fields, and override rules on users, genres,
languages, and TMDB keywords. One connection is the default for films and
one for shows. Rules on genres and keywords need `MATINEE_TMDB_API_KEY`.

Requests don't need a connection, as in Seerr. Every library with a
metadata provider takes them, and one that no connection fills holds an
approved request until someone adds the file and a scan finds it. Without
a default connection, a title goes to the first library of its kind the
viewer can request into.

A connection's API key comes from `MATINEE_CONNECTION_<SLUG>_API_KEY`, or
its `_FILE` form, unless one is saved in Settings, which stores it as it
is. A new download manager implements `FulfilmentSource` in
`src/requests/fulfilment/types.ts` and goes in `sources.ts`.

The library a request lands in follows from the folder. Matinee applies
the connection's anime fields and rules, then picks the library whose
folder is the resulting root folder or holds it. When the download manager
sees other paths, as in a container, the settings ask which library a
folder is. A connection or rule whose folder lands in no library can't be
saved. A request keeps the connection it got when it was made, so later
changes don't send it elsewhere.

### After approval

An approved request goes out ten seconds later, and until then whoever
asked can take it back. One with no connection goes nowhere and waits for
its file. An unreachable connection is tried again after 5,
10, and 20 seconds, and then the request waits under Needs attention for
an admin. While a request is on its way, Matinee reads its progress once a
minute. A movie has arrived when a scan finds its file, and a season with
its first playable episode.

A declined request stays declined until an admin lifts it, and until then
nobody can request the title. Giving up on one that never turned up
cancels nothing in the download manager.

## Recommendations

Home recommends titles on the server, and Discover titles to request. Both
need `MATINEE_TMDB_API_KEY`. Watch time, rewatches, and favorites build a
profile of what someone likes, out of the TMDB genres, keywords, people,
and more of each title, which `title_features` keeps. A title dropped
early counts against what it's about.

The candidates are the library titles the person can see, plus TMDB's
picks around their top titles. `src/recommendations/score.ts` scores them,
with every number in `WEIGHTS`. The `recommendations` queue works one
person out again after they watch, mark, favorite, or say "Not
interested", and a task catches the rest daily. The best 100 on the server
and the best 100 to request are kept per person, each with a reason.

Every title a row shows is logged once a day in
`recommendation_impression`, with its position, score, and algorithm
version, to compare with what got played or requested.

## Accounts and sign-in

### OIDC

Admins set up single sign-on in Settings → Authentication. Register
`$PUBLIC_URL/api/auth/oidc/callback` as the redirect URI. To make the
admin through the provider, set the `MATINEE_OIDC_*` variables, since
Settings can't be reached before setup.

The issuer must be https, or http on loopback, since discovery, the token
exchange, and refreshes carry the client secret and sign-in codes. For a
provider on a network you trust, like another container or a LAN host,
set `MATINEE_OIDC_ALLOW_HTTP=true`. Without it, the server won't start
with an http issuer elsewhere, Settings won't save one, and sign-in
refuses one saved before.

A client secret belongs to one issuer and client ID, and goes only to
them. A saved secret is bound to the ones it was saved with, and
`MATINEE_OIDC_CLIENT_SECRET` to `MATINEE_OIDC_ISSUER_URL` and
`MATINEE_OIDC_CLIENT_ID`. Changing either in Settings while a saved secret
is in use takes the new client's secret, or removing the saved one for a
public client. Moving away from the environment's issuer or client ID
leaves its secret out, so enter one in Settings if the new client needs
it. A secret saved by an older version, without that binding, is removed
at startup. Enter it again before the next sign-in.

A new account takes its username and display name from
`MATINEE_OIDC_USERNAME_CLAIM` and `MATINEE_OIDC_NAME_CLAIM`,
`preferred_username` and `name` by default, and keeps them. A `picture`
claim is its picture until the user sets one. Matinee keeps the claim's
URL and clients load the picture from the provider, so viewers need to
reach that URL, and a change at the provider shows once their cache lets
it. Uploads are the only pictures Matinee stores. Access groups linked to a
provider group sync their members at every sign-in, from the claim
`MATINEE_OIDC_GROUPS_CLAIM` names, dotted paths like `realm_access.roles`
included.

`MATINEE_OIDC_POLICY_CLAIM` names a claim with an access override for the
account, as an object or as JSON text:

```json
{
  "libraries": ["Movies", "Family"],
  "maxBitrate": 8000000,
  "transcode": true,
  "downloads": false,
  "maxStreams": 2
}
```

Fields left out follow the account's groups. `requests` is `"off"`,
`"ask"` for asking with an approval, or `"add"` for titles added right
away, and `requestLimit` is `{ "titles": 5, "days": 7 }` or `null`. The
parts of running the server stay with groups. Libraries are ids or
names, whatever their case, and `"all"` includes future ones. Bit rates are bits
per second, at least 1000000, and `null` lifts a limit. A missing claim
clears an override the provider set, but keeps one an admin set. Only the
provider's admins should be able to set the role, groups, and policy
claims.

With `offline_access` in `MATINEE_OIDC_SCOPES`, a task refreshes roles,
pictures, and access every six hours, so people who only use the apps
stay current. `MATINEE_OIDC_SIGN_OUT_REFUSED=true` signs an account out
everywhere once the provider refuses its token for good.

### How auth works

- Sessions are random tokens, stored as SHA-256 hashes, in an HttpOnly
  cookie for browsers and sent as `Authorization: Bearer` by apps. A
  session expires 30 days after its last use, and Settings → Account signs
  any of them out.
- Passkeys go through SimpleWebAuthn, and OIDC through openid-client with
  PKCE, state, and nonce. Accounts match a provider on issuer and subject,
  never email. The server refuses a provider whose discovery document
  names a different issuer, or plain http off loopback without
  `MATINEE_OIDC_ALLOW_HTTP`.
- Nobody can remove their last passkey or linked account, and an admin who
  only uses SSO can't turn SSO off or change the issuer. The server won't
  demote or delete the last admin, even when the role claim says so.
- With SSO, the role claim sets the role at every sign-in: `admin`,
  `user`, or a list where admin wins. Roles are read on every request.
- Admins can turn passkeys off, or default them off with
  `MATINEE_PASSKEYS_ENABLED=false`, once their own account is linked. If
  the provider goes down then, run
  `delete from setting where key = 'passkeys'` and restart.
- Sign-up is off by default. `MATINEE_OPEN_REGISTRATION` opens it with
  passkeys, and `MATINEE_OIDC_ALLOW_SIGN_UP` lets an unlinked provider
  account make one. An OIDC username that matches an unlinked account
  never signs in to it, since whoever controls the claim would get the
  account. The login page offers to link it instead.
- Invite links work once, expire, and stop working when whoever made them
  is deleted or may no longer invite.
- Deleting a user deletes their sessions, API tokens, passkeys, links,
  progress, favorites, and history.
- A client secret saved in Settings is stored as plain text.
  `MATINEE_OIDC_CLIENT_SECRET_FILE` keeps it out of the database.
- What anyone can call without signing in is limited per client address:
  passkey sign-in and sign-up options to 30 a minute, single sign-on
  starts to 20 a minute, device codes to 20 per 10 minutes, device polls
  to 120 a minute, and setup token tries to 10 per 15 minutes. Past a
  limit the API answers 429 with `Retry-After`. The address is the one
  Settings → Network works out, so behind a reverse proxy, add it to the
  trusted proxies, or all clients share one limit. IPv6 clients count by
  their /64. The counts live in memory and reset on restart.
- Request bodies are capped at 1 MB before anything parses them, except
  avatar and title image uploads, which get the file's limit.

### API tokens

An API token lets a service or an app call the API as an account without
anyone signing in, for months if need be. Make one in Settings → API
tokens: name it after what will use it and choose what it may do. The
secret shows once, when it's made. The list afterwards shows each token's
name, how much it may do, when it was made, and when it was last used, to
the minute. It changes a token's name and permissions, and revokes one.

Permissions work as Immich's API keys do. A token holds `all`, or a list
of [permissions](#permissions), like `title.read`, `library.scan`, or
`adminRequest.retry`. It can only be given ones its account holds, so a
token never waits on a permission for its account to be granted it. The
settings dialog offers those.

Approving, declining, and retrying are separate permissions, so an
automation token can retry failed sends without being able to approve or
decline requests, its own included.

- A call made with a token needs its permission twice: the account holds
  it, and the token holds it or `all`. A token narrows its account and
  never widens it. The account's role and groups are read again on every
  request, so a token sees the libraries its account opens, asks within
  its account's quota, and loses a permission the moment its account
  does. Put a service that asks for titles on an account in the group
  whose rules it should follow, and give its token `request.autoApprove`
  too if the group's members skip the approval.
- Making a token takes `apiToken.create`, which a group's API tokens
  capability grants. An account without it keeps, changes, and revokes
  the tokens it has.
- `all` is the whole account: everything its owner can do signed in, the
  account's passkeys, sessions, and tokens included, and for an admin all
  of administration. On any other account it reaches what the account
  holds and no further. Give it to nothing that works with less.
- A token with the `apiToken` permissions manages the account's tokens,
  but only hands on what it holds: it can't make, change, or rotate a
  token to hold a permission it lacks. An invite made with a token is
  checked against the token when it's made, and against its maker's
  account when someone uses it. For the same reason only a token
  with `all` adds a way to sign in: registering a passkey, linking a
  single sign-on account, or approving a device, each of which does all
  the account may.
- The plain routes name their permission where they read the session:
  streams take `media.play`, downloads `media.download`, artwork
  `title.read`, and profile pictures `profile.read`. Approving an app at
  `/authorize` and the single sign-on link flow are the browser's own and
  take a session.
- A token is `matinee_` and 43 random base64url characters, 256 bits. The
  server stores its SHA-256, as for sessions. A session token is always 43
  characters, so the prefix and length tell the two apart before any
  lookup, and a secret scanner can find a leaked one.
- It never expires. It stops working when its owner revokes it or rotates
  its secret, someone with `adminApiToken.delete` revokes the account's
  tokens in Settings → Users,
  or the account is deleted.
- The server reads it only from `Authorization: Bearer`, never from the
  `matinee_session` cookie or the query string, so the CSRF check in
  `app.ts` holds: a browser sends that header to another site only after a
  preflight, which fails.
- A live stream checks its credential when it opens and ends after ten
  minutes at most, so a revoked token's streams end by then, as a revoked
  session's do. Its next request, the reconnect included, gets 401.

A service should keep the token where it keeps secrets and send it on
every request:

```sh
curl -H "Authorization: Bearer $MATINEE_TOKEN" \
  https://media.example.com/api/v1/account/api-tokens/me
```

`/account/api-tokens/me` answers any token with its own name and
permissions, and `/auth/session` with its account, so a service can check
what it was given when it starts. Calls under `/api/v1` are the REST API
in [The API](#the-api). A 401 means the token was revoked or its account
deleted, and retrying won't help. A 403 names the permission that is
missing, and says whether the account lacks it or the token does. The
plain routes answer 401 for a token without their permission.

## For app developers

### The API

`packages/contracts/src/contract.ts` is the API. The server implements it
and clients call it through `createMatineeClient()`, so a schema change
breaks the type check on both sides. Video, artwork, and OIDC redirects
are plain HTTP routes in `packages/contracts/src/paths.ts`.

The same contract is REST under `/api/v1`, with the OpenAPI document at
`/api/v1/openapi.json` and a reference at `/api-docs` in the web app.
Browsers use the session cookie, apps send a bearer token from
[Signing in apps](#signing-in-apps), and services send an
[API token](#api-tokens) the same way. Errors are JSON with `code`,
`status`, and `message`.

`/api/health` returns `{ "ok": true, "contract": "…" }` without a session.
`contract` is a hash of the REST paths and schemas, also in the OpenAPI
`info.version`, so a generated client can tell it's talking to a server on
another version.

### Signing in apps

Apps get a session of their own, apart from the browser's. Both flows are
in the contract's `auth.app` and `auth.device`, and return
`{ token, user }`. Apps send a device name like `Living room TV` and a
platform: `android`, `ios`, `linux`, `macos`, `tizen`, or `windows`.

Once signed in, and each time it starts, an app sends what it calls
itself to `PUT /api/v1/account/sessions/current/client`, like
`{ "name": "Matinee Android" }`, for the server's sessions list and
statistics. The server shows it as it is.

Apps that can open a browser use OAuth for native apps, RFC 8252, with
PKCE:

1. Make a code verifier and open `/authorize` in the system browser with
   `redirect_uri`, `state`, `code_challenge` as the base64url SHA-256 of
   the verifier, `code_challenge_method=S256`, `platform`, and
   `device_name`. `appAuthorizePagePath()` builds the URL.
2. The page signs the person in and asks them to approve.
3. The browser redirects to `redirect_uri` with `code` and `state`. That's
   a registered `matinee:` URI or a loopback URL like
   `http://127.0.0.1:43123/callback`.
4. Post `code` and `codeVerifier` to `/api/v1/auth/app/token`. A code works
   once and expires after two minutes.

Apps without a browser, like TV apps, use the device grant, RFC 8628:

1. Post the device to `/api/v1/auth/device`. Show `userCode`, like
   `BCDF-GHJK`, and `verificationUri`, which is `$PUBLIC_URL/link`.
   `verificationUriComplete` has the code filled in, for a QR code.
2. Someone signed in opens the page, enters the code, and approves.
3. Poll `/api/v1/auth/device/token` with `deviceCode` every `interval`
   seconds. It returns `pending` until someone approves, and 429 for a
   poll sooner than `interval` after the last. After `expiresIn`, ten
   minutes, it returns 404 and the app starts over.

Both pages warn that approving gives the device the account. That warning
is the only defense against someone sending you their own link or code.

The Samsung TV app loads its pages from its own package, so its requests
carry `Origin: file://` and the TV holds them to CORS. For that origin
alone, `/api/*` answers preflights and adds
`Access-Control-Allow-Origin: *`, never with credentials, so the app sends
its token and never the cookie. Samsung's player can't send a header, so
it sends the token as the `matinee_session` cookie, which the server reads
when a request has no `Authorization`.

### Local server discovery

Discovery is IPv4 UDP on port 8421. A client broadcasts the ASCII string
`Matinee discovery v1`, padded with spaces to exactly 512 bytes, with no
newline, to each interface's broadcast address and to `255.255.255.255`,
then listens for unicast replies. Three seconds is enough.

A reply is UTF-8 JSON of at most 512 bytes:

```json
{ "version": 1, "name": "Matinee", "url": "https://media.example.com" }
```

`name` is at most 64 code points, and always `Matinee` for now. `url` is
the server's `PUBLIC_URL`, an http or https URL of at most 400 code points
without credentials. Clients ignore unknown fields, reject other versions
and malformed replies, and drop duplicate URLs. The constants and schema
are in `packages/contracts/src/discovery.ts`. Discovery isn't in the
OpenAPI document.

`MATINEE_DISCOVERY_ENABLED=false` turns it off. The server never
advertises a loopback URL, so set `PUBLIC_URL` to one the LAN can reach.
Failing to bind only logs a warning. Broadcasts don't cross routers,
Docker bridge networks, or most emulator NATs, so use host networking in
a container, and allow UDP 8421 only on trusted interfaces. On NixOS,
`discovery.enable` turns it on and off, and `openFirewall` opens the port.

The server answers one probe per source address a second, and 20 a second
in all. The padded probe keeps it from amplifying traffic. Discovery isn't
authenticated, so check `/api/health` before using a URL, and never sign
in to a server just because it answered.

## Not built yet

- Copied streams in Safari. Encodes work there.
- Surround audio in streams. Converted audio is always stereo.
- Text subtitle burn-in for devices that can't render ASS.
- NFO metadata, local artwork, absolute episode numbers for anime, and
  setting provider keys in Settings.
