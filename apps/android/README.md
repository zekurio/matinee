# Matinee for Android

A native app for Android phones and tablets, written in Kotlin with Jetpack
Compose and Media3. The same APK installs on Android TV, where every
screen is one of its own, drawn for the remote (see Android TV below).

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
  doesn't have, as the README's Downloads section describes. Subtitles in
  the languages you read or hear save beside the video. A downloaded file
  plays from the phone. When the server doesn't answer, the app offers the
  downloads, and where you got to in them goes to the server once it's back.
  An account that may not download, as `playback.options` says, gets no
  Download in any menu and keeps what's on the phone; a download the server
  refuses stops with words that say so, without retrying.
- Settings: the account's language preferences; how subtitles look, in the
  system's caption style or the app's own size, color, background, and edge;
  this device's quality, of those the account may use and with its bit
  rate limit, codecs for encodes, decoders, skip length, autoplay
  of the next episode, picture in picture, and audio passthrough; downloads'
  network, version, and subtitles; the app's language through Android's
  per-app setting; sessions; and the server.

Not built yet: Chromecast, a media session for the lock screen, and
downloads of a whole season.

## Android TV

On a TV, nothing of the phone's layout shows. `MatineeRoot` picks once, on
`LocalTv` (true on a leanback device): the phone's screens, or the TV's
own. Those live in `ui/tv/`, and the player's in `ui/player/tv/`.

- `ui/tv/auth/` is what a TV shows before and around the account: the
  servers found on the local network, searched for while it shows, the
  server used before, typing an address, signing in with the code and QR
  code, and a server that doesn't answer.
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
and identify, linking a device by camera, appearance, picture in picture,
and the playback report. Nothing on a TV leads to them. The launcher's
Watch Next row is TV-only, in `launcher/`.

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

The flake has no emulator. Run the app on one from your own Android SDK,
started from T3 Code's Device panel, Android Studio, or `emulator -avd`. A TV
needs an AVD on an `android-tv` system image, such as
`system-images;android-36;android-tv;x86_64` with the `tv_1080p` device. To
reach a dev server on the host from an emulator, forward the port, so the
app connects to the same `PUBLIC_URL` the browser uses:

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
