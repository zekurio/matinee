# Matinee for Android

A native app in Kotlin, Compose, and Media3. One APK covers phones,
tablets, and Android TV, where it switches to its own screens built for a
remote. On a phone it looks like the web app. It's in English and German.

## Install

Needs Android 8.0 (API 26). Each
[release](https://github.com/zekurio/matinee/releases) has signed APKs
named `matinee-v<version>-<abi>.apk`, plus `checksums.txt`.

| APK           | For                                              |
| ------------- | ------------------------------------------------ |
| `universal`   | Anything. Four times the size, pick it if unsure |
| `arm64-v8a`   | Phones, tablets, Nvidia Shield, newer TV boxes   |
| `armeabi-v7a` | Most TVs and sticks, which run a 32-bit system   |
| `x86_64`      | Emulators, Chromebooks                           |
| `x86`         | Old emulators and x86 tablets                    |

Open the APK in a file manager and allow installs when Android asks.
Releases share a signing key, so updates install over each other.
[Obtainium](https://obtainium.imranr.dev) can track the repo for updates.

### Sideloading your own build

With the device listed in `adb devices`:

```sh
just android sideload   # builds release APKs and installs the universal one
```

For a TV, enable developer options by pressing the build number in
Settings → System → About seven times, then turn on USB or network
debugging. Run `adb connect <tv-address>:5555`, accept on the TV, and run
`just android sideload`. With several devices, set
`ANDROID_SERIAL=<serial>`.

Without a keystore, release builds use your machine's debug key, so they
can't update an APK signed elsewhere. Replacing the app deletes its
downloads and sign-in. To keep updating, make a keystore and point
`MATINEE_KEYSTORE_PROPERTIES` at a properties file with `storeFile`,
`storePassword`, `keyAlias`, and `keyPassword`:

```sh
keytool -genkeypair -v -keystore matinee.jks -alias matinee \
  -keyalg RSA -keysize 4096 -validity 10000
```

Debug builds are a separate app, `io.github.zekurio.matinee.debug`, and
install alongside release builds.

## Build

The recipes enter the flake's Android shell for you. Entering it accepts
the SDK license.

| Recipe                  | What it does                                             |
| ----------------------- | -------------------------------------------------------- |
| `just android build`    | Debug APK in `app/build/outputs/apk/debug/`              |
| `just android release`  | Release APKs per ABI in `app/build/outputs/apk/release/` |
| `just android install`  | Builds and installs the debug app                        |
| `just android run`      | Installs the debug app and opens it                      |
| `just android sideload` | Builds release APKs and installs the universal one       |
| `just android reverse`  | Forwards `localhost:5173` to the device                  |
| `just android logcat`   | Follows the debug app's log                              |
| `just android test`     | Runs unit tests                                          |
| `just android api`      | Regenerates the API client                               |

Inside `apps/android`, drop the `android`. Extra arguments go to Gradle,
like `just build --offline`. By hand:

```sh
cd apps/android
nix develop ../..#android -c ./gradlew assembleDebug
```

Debug builds aren't debuggable, because Compose runs several times slower
that way. Pass `-Pmatinee.debuggable` to attach a debugger or the Layout
Inspector.

Without Nix, you need JDK 17+, the Android SDK with platform `android-37.0`
and build tools 36.0.0, and `ANDROID_HOME` set. Android Studio opens the
folder as is.

## Features

- Connects by address. Without a scheme it tries https, then http.
- Keeps several servers, each with its own sign-in. Removing one signs out
  and deletes its token and downloads.
- Signs in through the browser with PKCE, or with a code entered at
  `/link`. TVs only offer the code. See
  [Signing in apps](../server/README.md#signing-in-apps). Tokens are
  encrypted with an Android Keystore key and excluded from backups.
- Home, libraries with sort and genre filters, search, title, season, and
  episode pages, watched marks, and favorites. Long press a card for more.
- The player sends the server what the device can play and plays what
  `playback.start` returns. If a source fails, it asks again and the server
  falls back. It draws WebVTT itself, shows trickplay while scrubbing,
  counts down to the next episode, and supports picture-in-picture. Phone
  gestures work like Findroid's. Swipe the left side for brightness, the
  right for volume, sideways to seek, double tap to skip, and hold for 2×
  speed.
- Offline downloads through WorkManager, Wi-Fi only by default, resumable.
  Either the original file or a version the server makes for the device.
  Subtitles in your languages save alongside. When the server is
  unreachable, the app offers downloads and syncs progress later. Each
  download belongs to the server it came from.
- Settings for languages, caption style, quality, codecs, decoders,
  gestures, passthrough, downloads, sessions, and an About page with the
  last playback report and a redacted app log.

Not built yet: Chromecast, a lock screen media session, and season
downloads.

## Android TV

`MatineeRoot` checks `LocalTv` once and shows either the phone screens or
the TV ones. TV screens are in `ui/tv/`, and the TV player controls are in
`ui/player/tv/`.

- `ui/tv/auth/` covers everything before sign-in: LAN discovery, typing an
  address, code and QR sign-in, and the saved servers panel.
- `TvApp.kt` is the signed-in app, with a left drawer, a clock, and its own
  `NavHost` mapping phone routes to TV pages.
- The player keeps the phone's video, subtitles, and controller with TV
  controls on top. With controls hidden, Left and Right skip, Select shows
  the controls, and Back steps out one layer at a time. It matches the
  display's refresh rate to the video.

Shared TV pieces:

- `TvType.kt` has text styles and `Overscan` margins.
- `Focus.kt` has the focus rule. Pictures grow and get a ring
  (`tvPicture`). Controls fill with the text color (`tvControl`,
  `tvContent`). `TvFocusMemory` remembers focus per row and page.
- `Buttons.kt` has `TvButton`, `TvIconButton`, `TvRoundButton`, and
  `TvChip`. `TvListItem.kt` has the list row.
- `TvSidePanel.kt` is the right-edge panel for card actions, filters,
  settings choices, and player menus.
- `Cards.kt`, `PosterGrid.kt`, `People.kt`, and `Backdrop.kt` have the rest.

TV and phone share the API, page data loaders like `HomeData` and
`TitleData`, `Navigator`, `Actions`, the player controller, and image
loading. TVs leave out downloads, offline mode, admin pages, the image
editor, camera linking, and picture-in-picture. The Watch Next row is
TV-only, in `launcher/`.

## Develop

The flake has no emulator. Use your own SDK, Android Studio, or
`emulator -avd`. For a TV, use an `android-tv` system image such as
`system-images;android-36;android-tv;x86_64` with the `tv_1080p` device.

To reach the dev server, run `just android reverse` and connect to
`http://localhost:5173`.

### The API client

`api/ContractModels.kt` and `api/ContractApi.kt` are generated from the
server's OpenAPI document. Calls mirror the web, so `api.titles.get(id)` is
`orpc.titles.get`. After a contract change, run `pnpm api:android` from the
repo root. `pnpm verify` fails while they're stale.

Don't edit the generated files. Hand-written code goes beside them in
`api/`. `ApiTransport.kt` sends requests, `Extensions.kt` has extra names
and constants, and `Saved.kt` reads data older versions saved. Enums stay
strings, tagged unions become sealed interfaces, and optional nullable
fields use `Explicit`. A schema the generator can't map fails the run, so
handle new shapes in `apps/server/scripts/kotlin-client.ts`.

### Strings and icons

Strings go in `res/values/strings.xml` and `res/values-de/strings.xml`.

Icons come from lucide. Run `scripts/lucide.py <name>`, or
`<name>:filled`, after `pnpm install`, then add it to `Lucide` in
`ui/components/Picture.kt`.

### Local network access

Android 17 blocks local network access without `ACCESS_LOCAL_NETWORK`. The
docs say that starts at target SDK 37, but a Pixel on Android 17 enforced
it at target 36, so the app asks on every Android 17 device.
`localNetworkPermission` in `auth/ServerDiscovery.kt` decides whether to
ask, and `rememberLocalNetworkAccess` in `ui/signin/LocalNetwork.kt` asks.
Connecting and Retry both go through it.

### Server discovery

`auth/discoverServers` returns a cold flow of names and URLs with a
three-second timeout. Collect it in a cancellable scope after checking
`localNetworkPermission`. Replies are unicast, so no multicast lock. Pass
the chosen URL to `Session.connect`. Only the TV connect screen uses it so
far. The protocol is in
[Local server discovery](../server/README.md#local-server-discovery).

## Layout

```
app/src/main/java/io/github/zekurio/matinee/
  api/        Generated REST client and the routes from paths.ts
  auth/       Servers, sessions, tokens, browser sign-in
  downloads/  Download list, WorkManager job, offline progress
  launcher/   TV Watch Next publishing
  ui/         Compose screens
  ui/tv/      TV screens and shared TV pieces
  ui/player/  Decoders, playback, download tracks, WebVTT, player
scripts/
  lucide.py       lucide icons to vector drawables
  themes.mjs      Writes ui/theme/ThemePresets.kt from the web palettes
  web_strings.py  Copies web admin strings into res/values*/strings_web_*.xml
```

## Status

Tested on an emulator: connecting, code sign-in, Home, title pages,
streaming with converted audio, seeking, subtitles, and the TV player.
Downloads, offline mode, and the latest phone player fixes haven't been
tried on a device yet. Account limits pass the unit tests but haven't been
tried on a device either.

## License

GPL-3.0, see [LICENSE](LICENSE). The rest of the repo is MIT. The app is
GPL because it bundles Jellyfin's Media3 FFmpeg decoder and libmpv, both
GPL builds. `MpvPlayer` is based on Findroid's, also GPL-3.0.
