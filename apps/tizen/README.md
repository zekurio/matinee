# Matinee for Samsung TVs

The Samsung TV package of Matinee's shared TV UI, a Solid 2 app with the
Flutter app's TV screens. The screens, the remote's focus, the session,
and the player controller live in `packages/tv`; this app adds Samsung's
AVPlay, its remote keys, its package metadata, and the legacy build that
a TV loads by file path. The same UI is served by the Solid web app at
`/tv/`, where the browser's video element plays instead. It's in English
and German, with the same words as the Flutter app.

**Nobody has run it on a TV yet.** The packaged `file://` document has
run in Chromium 63 (Tizen 5.0's engine): it connected, completed a real
device-code sign-in, and drew the screens, with the remote's arrows and
Back. The same UI at the Solid web app's `/tv/` played an H.264 file in
Chrome. The packaged app's player could not be played in the open-source
Chromium available here, which has no H.264 decoder, so AVPlay and the
file path stay untested. Chromium 56 (Tizen 4.0) is still the build
target, but the old binary available here crashes in its own tcmalloc
before the page loads, so its last check is the same legacy bundle in
Chromium 63. The video, the remote's media keys, and the codec table are
educated guesses until someone tries them. If you do, the About page in
Settings lists what to report.

## Install

Needs a Samsung TV from 2018 or later (Tizen 4.0), and a Matinee server
as new as the app. Older servers don't answer the TV app's cross-origin
requests, so it can't connect.

There's no release of the app yet, so you build it and install it with
[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung), which signs
it for your TV and installs it without Tizen Studio. You need a computer
or phone on the same network as the TV, and a Samsung account.

### 1. Build the package

In a clone of this repository, with Nix:

```sh
nix develop
pnpm install
pnpm --filter @matinee/tizen package
```

Without Nix, install Node 24 and pnpm 11 and run the last two commands.
`just tizen package` does the last one too, once dependencies are
installed. The package is built with `NODE_ENV=production`, so the dev
shell's `NODE_ENV` doesn't put Solid's development runtime in it.

This writes `apps/tizen/dist/Matinee.wgt`. Copy it to the device that
runs Apps2Samsung if that isn't this computer.

### 2. Put the TV in Developer Mode

1. On the TV, press Home and open Apps. On Tizen 10, scroll down to App
   Settings in Apps first.
2. Type `1 2 3 4 5`, with the number keys or the on-screen pad behind the
   remote's **123** button.
3. Switch Developer Mode on.
4. In Host PC IP, enter the address of the device that runs Apps2Samsung,
   then OK. Apps2Samsung shows its address in its guide.
5. Restart the TV. Hold the power button until the logo shows, or unplug
   it for 30 seconds. Standby isn't a restart.

### 3. Install with Apps2Samsung

1. Install Apps2Samsung from its
   [releases](https://github.com/Apps2Samsung/Apps2Samsung/releases) and
   open it. It finds the TV on the network. If it says the TV isn't
   ready, press **Fix Developer Mode** on the TV's card and it shows the
   step that's missing.
2. On the Install tab, press **Install a file…** and pick `Matinee.wgt`.
3. The first install opens Samsung's sign-in in a browser. Sign in, and
   Apps2Samsung makes a certificate for this TV and keeps it for later
   installs. With Firefox's strict tracking protection the page says
   "Access denied". Copy the sign-in link from the certificate window into
   another browser.
4. Matinee shows up in the TV's apps. Open it, enter the server's address,
   and sign in with the code or the QR code from a phone where you're
   signed in.

If the TV isn't found, check that it's on rather than in standby, that
neither side is on a guest network or a VPN, and that Host PC IP is right.
You can also add it with **Add TV by IP…** in the **⋯** menu on the
Install tab. Apps2Samsung's
[FAQ](https://github.com/Apps2Samsung/Apps2Samsung/wiki/FAQ) has more.

### Updating

Build the package again and install it the same way. With the same
certificate it installs over the old app and keeps the sign-in. A
package from another computer, signed with another certificate, fails
with "Author certificate not match". Uninstall Matinee from the TV first,
which signs it out, or export the certificate from the first computer
under Settings > Backup and diagnostics and import it on the other.

### With Tizen Studio instead

With a Samsung certificate profile that has the TV's DUID, Tizen's CLI
signs the build folder, not the `.wgt`:

```sh
tizen package -t wgt -s <profile> -o apps/tizen/dist/signed -- apps/tizen/dist/app
tizen install -n Matinee.wgt -s <tv-address>:26101 -- apps/tizen/dist/signed
```

## Build

| Recipe               | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `just tizen package` | Builds `dist/app/` and packs it into `dist/Matinee.wgt`   |
| `just tizen dev`     | Runs the TV UI in a browser on `:5174`                    |
| `just tizen strings` | Takes the shared strings from the Flutter app's ARB files |

Inside `apps/tizen`, drop the `tizen`. By hand, `pnpm --filter
@matinee/tizen package`.

Every TV gets the same build, Vite's legacy output for Chromium 56 with
core-js filling in what old engines lack, and the Solid compiler that
`packages/tv` and the web app share. A Samsung TV loads a packaged app by
file path, which allows no module scripts and no `crossorigin`, so
`vite.config.ts` makes one plain script. It also adds the tag that loads
Samsung's `webapis.js`, which only the TV has. `scripts/package.mjs`
copies `config.xml` into `dist/app/` with the version from the root
`package.json`, and zips the folder.

## Develop

`just tizen dev` serves the app on `http://localhost:5174` and forwards
`/api/` to the server on `:8420`, or to `VITE_SERVER_URL`. Connect the app
to `http://localhost:5174`, not to the server itself. Then its requests
are same-origin and the browser's video element gets the session cookie.

The same UI is in the web app: run `pnpm dev:web` and open
`http://localhost:5173/tv/`, which runs beside the Tizen dev server. Its `/tv/` document imports only `packages/tv`, so
the desktop app's root size, theme, and Tailwind styles don't follow it.
The Tizen app and `/tv/` take the same screens from the same package; a
change there shows in both.

The keyboard stands in for the remote. The arrows move, Enter selects,
and Escape or Backspace goes back. Holding Enter opens a card's menu, as
holding Select does. Without AVPlay the player uses a video element, so it
plays what the browser plays.

For an old engine, build and open `dist/app/index.html` in a Chromium of
that age with `--allow-file-access-from-files`. Builds of open-source
Chromium have no H.264 or AAC, so the player can't play anything there,
but every screen up to it works.

## How it works

- `packages/tv` is the shared UI: its `input/` moves focus with the
  arrows by where things are on screen, within the groups and rows the
  markup names with `data-f*` attributes, and remembers the last focus
  per row and page. Its `kit/` has the buttons, cards, list rows, fields,
  and the right-edge panel, in `rem`, where 1 rem is a 960th of the
  screen's width. Its `screens/` has connecting and signing in, the
  drawer, Home, title, season, and episode pages, Movies and Shows,
  genres and studios, people, search, favorites, the profile with its
  statistics, recently watched, settings, and the player.
- `src/platform/tizen.ts` implements the package's `Platform`: it types
  the parts of `tizen` and `webapis` used here, asks for the remote's
  media keys, closes the app, keeps the screen saver away, and gives the
  package AVPlay or the browser's player. In a browser the Samsung APIs
  are missing, and everything that uses them checks.
- `src/player/engine.ts` is the AVPlay engine, which stays here because
  it is Samsung's. The shared `player/engine.ts` has the browser's video
  element and the interface both follow.
- `src/platform/polyfills.ts` stands in for APIs old engines lack before
  the app's code runs. The Vite legacy plugin covers the language.
- `src/main.tsx` is the whole app: it mounts the shared UI with the
  Samsung platform.
- The shared `auth/session.ts` keeps several servers, each with its own
  sign-in. A page at a web address starts on its own origin, which is how
  `/tv/` and a Tizen app served in development sign in; a packaged app
  loaded by file path has none, so the person types one. Without a scheme
  an address tries https, then http. Sign-in is the device grant, with
  the code and a QR code, as on Android TV. See
  [Signing in apps](../server/README.md#signing-in-apps).
- `packages/tv/src/i18n/shared.gen.ts` holds the Flutter app's messages
  the UI names, made by `packages/tv/scripts/strings.mjs` from
  `apps/flutter/lib/l10n`. Strings of its own start with `tizen_` and
  live in `i18n/own.ts`. `pnpm verify` fails while the generated file is
  stale.

The UI imports only types from `@matinee/contracts`, plus
`@matinee/contracts/paths`. Its schemas use syntax Chromium 56 can't
parse, so `lib/decode.ts` reads the few untyped values by hand.

### The player

`packages/tv/src/player/device.ts` tells `playback.start` what the TV
plays, by its Tizen version and panel, since a Samsung TV doesn't say.
Where Samsung's spec sheets and the Litefin and Jellyfin clients' reports
disagree, it leaves a format out and the server converts it. HLS needs a
2021 TV or later. Before that, an encode comes as one stream. In a
browser it asks the video element what it decodes, and asks only for
encodes it can play; an open-source Chromium without H.264 can't play a
file the server only encodes to H.264, so it turns that down rather than
show a black screen.

`src/player/engine.ts` drives Samsung's AVPlay, which plays on a plane
behind the page. The page stays see-through where the video is. Its call
order follows Samsung's reference and what Litefin learned across model
years:

- Properties and the display go in between `open` and `prepareAsync`.
- A seek goes out only while it plays or is paused, and nothing else is
  called until it answers. A source that starts partway in plays first and
  seeks with its first frame, under a black cover.
- An audio track is picked while it plays, and again after every seek.
  When AVPlay lists other tracks than the file has, the source counts as
  failed and the server sends a stream with the track in it.
- Leaving the app suspends it, and coming back restores it paused. A TV
  that gave the player away meanwhile opens the source again there.
- AVPlay can't send a header, so the token goes in the session cookie.
  Until a source has played on the TV, a retry also sends it as a header
  through `CUSTOM_MESSAGE`.

`packages/tv/src/player/controller.ts` asks the server again when a source
fails, seeks copied streams with `playback.seek`, reports progress, and
loads trickplay. The app draws WebVTT itself. The server burns picture
subtitles in, since AVPlay draws none the app can style.

## What it leaves out

- LAN discovery. A web app can't send the UDP broadcast, so you type the
  address.
- A browser without H.264, like an open-source Chromium build, can't play
  a file that needs an encode: the server has no VP9 or Opus encode, and
  its `/play` answers an MP4 content type even for a direct WebM. Chrome
  with proprietary codecs plays the H.264 path.
- Speeds other than 1×. AVPlay's others are silent trick modes.
- Requests, downloads, watch parties, and the admin pages.
- Matching the TV's refresh rate to the video, which the Flutter app
  does on Android TV.

## What to check on a TV

- The player plays a file as it is, an HLS encode, and a copied stream,
  and seeks in each.
- The same in the Solid web app's `/tv/` with Chrome that has H.264.
- Picking another audio track in an MKV with several, and seeking after.
- Leaving for the Home screen mid-video and coming back.
- The remote's media keys, and Back out of every layer.
- How Home scrolls on a 2018 or 2019 model.
- What the codec table in `packages/tv/src/player/device.ts` gets wrong: a file that
  should play as it is but fails, or one that plays but goes to the server.

## Credits

[Litefin](https://github.com/MoazSalem/litefin), a Jellyfin client for
Samsung TVs, taught the app most of what it knows about AVPlay. None of
its code is here. Litefin is MPL-2.0.
