# Matinee for Android

A native app for Android phones and tablets, written in Kotlin with Jetpack
Compose and Media3. The same APK installs on Android TV, where it signs in
with a code and moves with the D-pad, but phones come first for now.

It looks like the web app on a phone: the same dark theme, Red Hat Text,
lucide icons, the banner on Home, library chips, rails of cards, and title
pages over their backdrop. Text comes in English and German, copied from the
web app's catalogs where the words are the same.

## What it does

- Connects to a server by its address. Without a scheme it tries https, then
  http, since a server on a home network often has no certificate.
- Signs in two ways, both from the contract's `auth.app` and `auth.device`
  (see "Signing in apps" in the repository README):
  - In the browser: a Custom Tab opens `/authorize` with a PKCE challenge,
    the page signs in with a passkey or the OIDC provider, and sends the
    browser back to `matinee://auth/callback`.
  - With a code: the app shows a user code, someone signed in enters it at
    `/link`, and the app polls until it's approved. TVs only offer this.
    The token lives in the app's preferences, encrypted with a key in the
    Android Keystore, and stays out of backups.
- Home: the featured banner, Continue watching, Next up, and what each
  library got last. Libraries with sorting, a genre filter, and search;
  genres, studios, people, search across the server.
- Title, season, and episode pages, with watched marks and favorites. A
  long press on any card offers the rest.
- The player plays the file as it is when the device decodes it, a stream of
  the copied video with converted audio when only the audio doesn't play, and
  an HLS encode otherwise or at a picked quality, falling back in that order
  when something fails. Audio and subtitle tracks start as the account's
  preferences say. The player draws WebVTT subtitles itself, on the file's
  timeline, so they stay in step with every source; picture subtitles burn
  into an encode. It shows trickplay frames while scrubbing, counts down to
  the next episode, reports progress, and keeps playing in picture in
  picture.
- Downloads for watching offline, from a file's menu: a version the
  server makes for this device (the video kept when the phone decodes it,
  else encoded to H.264 at a picked size, and the preferred audio track kept
  or converted to stereo), or the file as it is. WorkManager fetches them,
  on Wi-Fi only unless Settings says otherwise, and picks up after a break:
  the original with a byte range, a version from the first segment it
  doesn't have, as the README's Downloads section describes. Subtitles in
  the languages you read or hear save beside the video. A downloaded file
  plays from the phone. When the server doesn't answer, the app offers the
  downloads, and where you got to in them goes to the server once it's back.
- Settings: the account's language preferences; how subtitles look, in the
  system's caption style or the app's own size, color, background, and edge;
  this device's quality, codecs for encodes, decoders, skip length, autoplay
  of the next episode, picture in picture, and audio passthrough; downloads'
  network, version, and subtitles; the app's language through Android's
  per-app setting; sessions; and the server.

Not built yet: Chromecast, a media session for the lock screen, downloads
of a whole season, and a TV layout of its own. On a TV, the remote plays
and pauses, and left and right skip while the controls are away.

## Status

Written against the server on `main` as of the downloads and image
editor commits, and checked on an emulator up to the player: connecting,
signing in with a code, Home, title, season, and episode pages, playback
as a stream with converted audio, seeking, and subtitles. Downloads, the
offline mode, the remote's keys, and the last player fixes (the thin seek
bar, the banner's swipe hold, light status bar icons) are written but not
built or tried yet.

## Building

The flake has a shell with a JDK and the Android SDK this needs. Entering it
accepts the Android SDK license.

```sh
cd apps/android
nix develop ../..#android -c ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

The debug build isn't debuggable, since Compose runs several times slower
in a debuggable app and its animations stutter. Build with
`-Pmatinee.debuggable` to attach a debugger or the Layout Inspector.

Without Nix, install JDK 17 or later and the Android SDK with platform
`android-37.0` and build tools 36.0.0, point `ANDROID_HOME` at it, and run
`./gradlew assembleDebug`. Android Studio opens the folder as it is.

`nix develop ../..#android-emulator -c matinee-emulator` starts an emulator
with a Pixel 7 profile. To reach a dev server on the host from it, forward
the port, so the app connects to the same `PUBLIC_URL` the browser uses:

```sh
adb reverse tcp:5173 tcp:5173   # then connect to http://localhost:5173
```

Release builds sign with the keystore that `MATINEE_KEYSTORE_PROPERTIES`
names (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`), or the debug
key without one.

## Layout

```
app/src/main/java/io/github/zekurio/matinee/
  api/        The REST API under /api/v1, generated from the contract, and
              the plain routes from paths.ts
  auth/       The server, the session and its token, browser sign-in
  downloads/  The download list, the WorkManager job that fetches them, and
              progress made offline
  ui/         Compose screens: home, browse, title, search, settings, player
  ui/player/  Source choice, track picks, the WebVTT renderer, and the player
scripts/
  lucide.py       Turns lucide icons into vector drawables
  themes.mjs      Writes ui/theme/ThemePresets.kt from the web's palettes
  web_strings.py  Copies the web's messages for the admin pages into
                  res/values*/strings_web_*.xml
```

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

Strings go in `res/values/strings.xml` and `res/values-de/strings.xml`.

Icons are lucide's, as on the web. Add one with
`scripts/lucide.py <name>` (or `<name>:filled`) from a checkout where
`pnpm install` has run, and reference it in `Lucide` in
`ui/components/Picture.kt`.

## License

GPL-3.0, see [LICENSE](LICENSE). The rest of the repository is MIT; the
app is GPL because it includes GPL builds of FFmpeg: Jellyfin's build of
Media3's FFmpeg decoder (`org.jellyfin.media3:media3-ffmpeg-decoder`), and
mpv with its own FFmpeg (`dev.jdtech.mpv:libmpv`), the player settings can
pick instead of ExoPlayer. `MpvPlayer` follows Findroid's (GPL-3.0).
