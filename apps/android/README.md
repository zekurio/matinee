# Matinee for Android

A native app for Android phones and tablets, written in Kotlin with Jetpack
Compose and Media3. The same APK installs on Android TV, where every
screen is one of its own, drawn for the remote (see Android TV below).

It looks like the web app on a phone: the same dark theme, Red Hat Text,
lucide icons, the banner on Home, library chips, rails of cards, and title
pages over their backdrop. Text comes in English and German, copied from the
web app's catalogs where the words are the same.

- [Install](#install)
- [Build](#build)
- [What it does](#what-it-does)
- [Android TV](#android-tv)
- [Develop](#develop)
- [Layout](#layout)
- [Status](#status)
- [License](#license)

## Install

Android 8.0 (API 26) or later. Each
[release](https://github.com/zekurio/matinee/releases) has signed APKs,
named `matinee-v<version>-<abi>.apk`, and their SHA-256 in `checksums.txt`.
The same app runs on phones, tablets, and TVs:

| APK           | For                                                      |
| ------------- | -------------------------------------------------------- |
| `universal`   | Any device. Four times the download, take it if unsure   |
| `arm64-v8a`   | Phones and tablets, the Nvidia Shield, newer TV boxes    |
| `armeabi-v7a` | Most TVs and streaming sticks, which run a 32-bit system |
| `x86_64`      | Emulators, Chromebooks                                   |
| `x86`         | Old emulators and x86 tablets                            |

Copy one to the device, open it in a file manager, and allow that app to
install unknown apps when Android asks. Releases share one signing key, so a newer one installs over an
older one, and [Obtainium](https://obtainium.imranr.dev) can follow the
repository for updates.

To build the APK yourself ([Build](#build)), with the device on USB or
Wi-Fi debugging, where `adb devices` lists it:

```sh
just android sideload   # build the release APKs and adb install the universal one
```

Without adb, build it with `just android release`, copy
`apps/android/app/build/outputs/apk/release/app-universal-release.apk` to
the device, open it in a file manager, and allow that app to install unknown
apps when Android asks.

For an Android TV or a Google TV, turn on developer options (press the
build number in Settings → System → About seven times), then USB or
network debugging. Connect with `adb connect <tv-address>:5555`, accept the
prompt on the TV, and run `just android sideload`. With more than one
device connected, pick one with `ANDROID_SERIAL=<serial>`, as `adb devices`
names it.

Android installs an update only over an app signed with the same key.
Without a keystore, release builds use the debug key of the machine that
built them, so an APK from another machine, or from a release, has to
replace the app, which deletes its downloads and sign-in. For builds you keep updating, make one
keystore and point `MATINEE_KEYSTORE_PROPERTIES` at a properties file with
`storeFile`, `storePassword`, `keyAlias`, and `keyPassword`:

```sh
keytool -genkeypair -v -keystore matinee.jks -alias matinee \
  -keyalg RSA -keysize 4096 -validity 10000
```

The debug build is its own app, `io.github.zekurio.matinee.debug`, so it
installs beside a release build.

## Build

The flake has a shell with a JDK and the Android SDK this needs. Entering it
accepts the Android SDK license. The recipes in `justfile` enter it for you,
so from the repository root:

| Recipe                  | What it does                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| `just android build`    | Debug APK in `app/build/outputs/apk/debug/`                         |
| `just android release`  | Release APKs, one for each ABI, in `app/build/outputs/apk/release/` |
| `just android install`  | Builds the debug app and installs it on the connected device        |
| `just android run`      | Installs the debug app and opens it                                 |
| `just android sideload` | Builds the release APKs and installs the universal one              |
| `just android reverse`  | Lets the device reach the dev server at `localhost:5173`            |
| `just android logcat`   | Follows the running debug app's log                                 |
| `just android test`     | Runs the unit tests                                                 |
| `just android api`      | Generates the API client again after a contract change              |

In `apps/android`, leave out the `android`: `just build`. Arguments after a
Gradle recipe go to Gradle, as in `just build --offline`. The same by hand:

```sh
cd apps/android
nix develop ../..#android -c ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

The debug build isn't debuggable, since Compose runs several times slower
in a debuggable app and its animations stutter. Build with
`just build -Pmatinee.debuggable` to attach a debugger or the Layout
Inspector.

Without Nix, install JDK 17 or later and the Android SDK with platform
`android-37.0` and build tools 36.0.0, point `ANDROID_HOME` at it, and run
`./gradlew assembleDebug`. Android Studio opens the folder as it is.

## What it does

- Connects to a server by its address. Without a scheme it tries https, then
  http, since a server on a home network often has no certificate.
- Keeps several servers, each with its own sign-in, as the Jellyfin and Plex
  apps do. Change server lists them: a tap switches, with no sign-in while
  that server's session stands; Add server connects to another, and going
  back from its connect or sign-in screen returns to the server in use,
  which stays as it was until the new one is signed in. Removing a server
  signs out there first, as far as it answers, then deletes its token and
  its downloads. Sign out ends the session on the server in use only.
- Signs in two ways, both from the contract's `auth.app` and `auth.device`
  (see [Signing in apps](../server/README.md#signing-in-apps)):
  - In the browser: a Custom Tab opens `/authorize` with a PKCE challenge,
    the page signs in with a passkey or the OIDC provider, and sends the
    browser back to `matinee://auth/callback`.
  - With a code: the app shows a user code, someone signed in enters it at
    `/link`, and the app polls until it's approved. TVs only offer this.
    The token lives in the app's preferences, one per server, encrypted with
    a key in the Android Keystore, and stays out of backups.
- Home: the featured banner, Continue watching, Next up, and what each
  library got last, or, for an account that may open no library, a note to
  ask whoever runs the server. Libraries with sorting, a genre filter, and
  search; genres, studios, people, search across the server.
- Title, season, and episode pages, with watched marks and favorites. A
  long press on any card offers the rest.
- The player tells the server what this device plays, for the engine and
  settings it has, and plays what `playback.start` answers: the file as it
  is, a stream of the copied video with converted audio, or an HLS encode,
  with the audio and subtitle that start and the next episode. A source that
  fails asks again with its method among the failed ones, and the server
  falls back. Tracks the viewer picks go to `playback.pickTracks`, so the
  server remembers them, as on the web. The player draws WebVTT subtitles
  itself, on the file's timeline, so they stay in step with every source;
  the engine draws picture tracks inside a file that plays as it is, and the
  server burns the rest into an encode. It shows trickplay frames while
  scrubbing, counts down to the next episode, reports progress, and keeps
  playing in picture in picture. The quality menu leaves Original out for a
  file over the account's bit rate limit. When the account may not play a
  file, or plays on as many devices as it may, the player shows the
  server's message and stops, as the web does.
- Downloads for watching offline, from a file's menu: a version the
  server makes for this device (the video kept when the phone decodes it,
  else encoded to H.264 at a picked size, and the preferred audio track kept
  or converted to stereo), or the file as it is. WorkManager fetches them,
  on Wi-Fi only unless Settings says otherwise, and picks up after a break:
  the original with a byte range, a version from the first segment it
  doesn't have, as the server's
  [Downloads](../server/README.md#downloads) section describes. Subtitles in
  the languages you read or hear save beside the video. A downloaded file
  plays from the phone. When the server doesn't answer, the app offers the
  downloads, and where you got to in them goes to the server once it's back.
  Each download, and the progress waiting to be sent, belongs to the server
  it came from: the app shows and plays only the server in use's, sends
  progress only to its own server, and fetches each with its server's
  sign-in, whichever server is in use.
  An account that may not download, as `playback.options` says, gets no
  Download in any menu and keeps what's on the phone; a download the server
  refuses stops with words that say so, without retrying.
- Settings: the account's language preferences; how subtitles look, in the
  system's caption style or the app's own size, color, background, and edge;
  this device's quality, of those the account may use and with its bit
  rate limit, codecs for encodes, decoders, skip length, autoplay
  of the next episode, picture in picture, and audio passthrough; downloads'
  network, version, and subtitles; the app's language through Android's
  per-app setting; sessions; the server; and About, with the app's
  version, Android's, and the model, the latest playback's report, and
  the app's own log. Both are read on the device only and leave it when
  you copy or share them. The report holds codes and formats; the log is
  this process's logcat, with the server, the account, addresses, paths,
  file names, quoted text, ids, and tokens replaced (`ui/settings/AppLog.kt`).

Not built yet: Chromecast, a media session for the lock screen, and
downloads of a whole season.

## Android TV

On a TV, nothing of the phone's layout shows. `MatineeRoot` picks once, on
`LocalTv` (true on a leanback device): the phone's screens, or the TV's
own. Those live in `ui/tv/`, and the player's in `ui/player/tv/`.

- `ui/tv/auth/` is what a TV shows before and around the account: the
  servers found on the local network, searched for while it shows, the
  server used before, typing an address, signing in with the code and QR
  code, a server that doesn't answer, and the saved servers' panel
  (`TvServers.kt`), which settings opens too.
- `TvApp.kt` is the signed-in app: a drawer at the left edge, a rail of
  icons that opens into labels when focus comes in from the page, the
  clock at the top right, and its own `NavHost` that maps the phone's
  routes to TV pages. Home, the libraries, browse, search, favorites,
  title, season, episode, person, profile, recently watched, and settings
  each have one, in `home/`, `browse/`, `detail/`, `profile/`, and
  `settings/`.
- The player keeps the phone's video, subtitles, and controller, and
  draws its own controls: the title, one seek bar, and a row of large
  buttons inside the TV margins. With the controls away, Left and Right
  skip and glide while held, Select brings the controls, and the media
  keys work at any time. Back closes a menu, then the controls, then the
  player. It asks the display for the video's frame rate while it plays.

Every TV screen is built from the same few pieces, so they look and behave
alike:

- `TvType.kt` has the text styles and `Overscan`, the margins: 32dp at
  the sides, 27dp at the top and bottom. `TvPage` starts a page's content
  clear of the drawer's rail.
- `Focus.kt` has the focus look, by one rule. A picture (a poster, a still,
  a person's photo) grows and gets a ring, with `tvPicture`. A control (a
  button, a chip, a tab, a list row, a drawer entry, a field) fills with
  the text color and its content turns dark, with `tvControl` and
  `tvContent`. It also has `TvFocusMemory`, which keeps the card each row
  and page had focused.
- `Buttons.kt` has `TvButton`, `TvIconButton` (an icon that opens to its
  label), `TvRoundButton` (an icon alone, like the player's), and `TvChip`.
  `TvListItem.kt` has the list row that settings, the connect screen, and
  every panel use.
- `TvSidePanel.kt` has the one right-edge panel: a card's actions on Menu
  or a held Select, the sort and genre, a setting's choices, and the
  player's menus. It dims the screen, keeps focus until Back or a choice
  closes it, and puts focus back on what opened it.
- `Cards.kt`, `PosterGrid.kt`, and `People.kt` have the cards, rows, and
  grids, and `Backdrop.kt` the picture behind a page.

What a TV and a phone share is everything under the layout: the API and
the state each page loads (`HomeData`, `TitleData`, `LibraryData`, and the
rest, beside the phone's screens), `Navigator` and its routes, `Actions`,
the player's controller, formatters, `Palette`, and image loading. A TV
leaves out downloads and offline mode, the admin pages, the image editor
and identify, linking a device by camera, appearance, and picture in
picture. Nothing on a TV leads to them. The launcher's
Watch Next row is TV-only, in `launcher/`.

## Develop

The flake has no emulator. Run the app on one from your own Android SDK,
started from T3 Code's Device panel, Android Studio, or `emulator -avd`. A TV
needs an AVD on an `android-tv` system image, such as
`system-images;android-36;android-tv;x86_64` with the `tv_1080p` device.

To reach a dev server on the host from an emulator or a phone on USB,
forward the port with `just android reverse`, then connect to
`http://localhost:5173`, the same `PUBLIC_URL` the browser uses.

### The API client

The API client is generated from the server's OpenAPI document, as the
contract describes it: `api/ContractModels.kt` has a class for each
schema, and `api/ContractApi.kt` a function for each procedure, named as
on the web (`api.titles.get(id)` is `orpc.titles.get`). An API change
starts in the contract, as always; then, from the repository root:

```sh
pnpm api:android
```

`pnpm verify` and CI fail while the two files are out of date. Don't edit
them; what the app adds goes beside them in `api/`: `ApiTransport.kt`
sends the requests, `Extensions.kt` has names and constants the document
doesn't carry, and `Saved.kt` reads what an older app saved. In the
generated Kotlin, enums stay strings with an object of their values, a
union with a tag is a sealed interface, and a field that can be left out,
null, or set takes an `Explicit`. A schema the generator can't map fails
the run, so a new kind of shape in the contract gets a deliberate form in
`apps/server/scripts/kotlin-client.ts`.

### Strings and icons

Strings go in `res/values/strings.xml` and `res/values-de/strings.xml`.

Icons are lucide's, as on the web. Add one with
`scripts/lucide.py <name>` (or `<name>:filled`) from a checkout where
`pnpm install` has run, and reference it in `Lucide` in
`ui/components/Picture.kt`.

### Local network access

Android 17 keeps an app off the local network until it has
`ACCESS_LOCAL_NETWORK`. The docs tie that to target SDK 37, but a Pixel on
Android 17 held this app to it at target 36, so the app asks on every
Android 17 device. `localNetworkPermission` in `auth/ServerDiscovery.kt`
says whether to ask, and `rememberLocalNetworkAccess` in
`ui/signin/LocalNetwork.kt` asks, then runs what comes next either way.
Connecting to a server goes through it, on the phone and the TV, and so
does Retry when the saved server doesn't answer, since the permission can
be taken back in Settings. When connecting fails while it's still missing,
the error says where to allow it.

### Finding servers on the network

The Android `auth/discoverServers` function returns a cold flow of name and
URL pairs, with a three-second timeout and injectable destinations for tests.
Collect it in a cancellable screen scope. Call `localNetworkPermission`
first and request the returned permission if any. Replies are
unicast, so no Wi-Fi multicast lock is needed. Pass the selected URL to
`Session.connect`, which already checks health and compatibility. The TV's
connect screen (`ui/tv/auth/TvConnect.kt`) uses it; the phone doesn't yet.
The protocol is in the server's
[Local server discovery](../server/README.md#local-server-discovery).

## Layout

```
app/src/main/java/io/github/zekurio/matinee/
  api/        The REST API under /api/v1, generated from the contract, and
              the plain routes from paths.ts
  auth/       The server, the session and its token, browser sign-in
  downloads/  The download list, the WorkManager job that fetches them, and
              progress made offline
  launcher/   TV-only Watch Next publishing, authenticated artwork copies,
              launcher playback links, and the periodic WorkManager sync
  ui/         Compose screens: home, browse, title, search, settings, player
  ui/tv/      The TV's own screens and the pieces they share
  ui/player/  The device's decoders, what the player loads of the server's
              answers, a download's tracks, the WebVTT renderer, and the
              player; its TV controls in ui/player/tv/
scripts/
  lucide.py       Turns lucide icons into vector drawables
  themes.mjs      Writes ui/theme/ThemePresets.kt from the web's palettes
  web_strings.py  Copies the web's messages for the admin pages into
                  res/values*/strings_web_*.xml
```

## Status

Written against the server on `main` as of the downloads and image
editor commits, and checked on an emulator up to the player: connecting,
signing in with a code, Home, title, season, and episode pages, playback
as a stream with converted audio, seeking, and subtitles, and the TV
player with the remote on an Android TV emulator. Downloads, the offline
mode, and the last phone player fixes (the thin seek bar, the banner's
swipe hold, light status bar icons) are written but not built or tried
yet. The account's access (the bit rate limit, a server that may not
encode for it, downloads switched off, and the limit on devices) builds
and passes the unit tests, but isn't tried on a device yet.

## License

GPL-3.0, see [LICENSE](LICENSE). The rest of the repository is MIT; the
app is GPL because it includes GPL builds of FFmpeg: Jellyfin's build of
Media3's FFmpeg decoder (`org.jellyfin.media3:media3-ffmpeg-decoder`), and
mpv with its own FFmpeg (`dev.jdtech.mpv:libmpv`), the player settings can
pick instead of ExoPlayer. `MpvPlayer` follows Findroid's (GPL-3.0).
