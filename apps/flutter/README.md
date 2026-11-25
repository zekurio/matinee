# Matinee for phones, tablets, and TVs

One Flutter app for Android phones, tablets, and TVs, for iPhone and iPad,
and for Apple TV. Screens are Flutter. Video plays in each platform's
native player, which sits behind the Flutter view.

Android phones and tablets have every screen, downloads, and offline mode.
Android TV has its own routes and player. iPhone and iPad have the same
screens as Android phones and tablets, with the native side in
`ios/Runner`. CI compiles it, and it has run on iPhone and iPad
simulators, but not yet on a device. Apple TV has Android TV's screens,
with the native side in `tvos/Runner`. CI compiles that too, and nobody
has run it yet, on a simulator or a device (see [Apple TV](#apple-tv)).

Left out on purpose:

- There's no 32-bit x86 APK, since Flutter builds no release engine for
  it.
- Fulfilment's routing rules are set on the web. Their ordered rules and
  conditions want a wide screen.

## Build, run, check

The recipes enter the flake's Flutter shell for you. Entering it accepts
the Android SDK license. The flake's shells are Linux-only, so on a Mac
install Flutter 3.47.4 yourself and set `MATINEE_FLUTTER_SHELL=1`, and the
recipes use the `flutter` on the PATH. An Android build there also needs a
JDK and the Android SDK.

| Recipe                      | What it does                                  |
| --------------------------- | --------------------------------------------- |
| `just flutter build`        | Debug APK in `build/app/outputs/flutter-apk/` |
| `just flutter install`      | Builds and installs the debug app             |
| `just flutter run`          | Installs the debug app and opens it           |
| `just flutter check`        | What CI runs: analyzer, format check, tests   |
| `just flutter format`       | Formats the Dart code, except generated files |
| `just flutter android-test` | Runs the Kotlin unit tests on the JVM         |
| `just flutter api`          | Regenerates the API client                    |
| `just flutter pigeon`       | Regenerates the platform channels             |
| `just flutter tvos`         | Fetches the tvOS engine, for Xcode to build   |
| `just flutter reverse`      | Forwards `localhost:5173` to the device       |
| `just flutter logcat`       | Follows the debug app's log                   |

The version comes from the root `package.json`, so `pubspec.yaml` has none.

### Emulators

The Flutter shell has no emulator. Use one from your own Android SDK or
Android Studio. A Pixel phone, the Pixel Tablet, and a Television AVD cover
the three layouts. `just flutter run` installs on whichever device adb
sees, or on `ANDROID_SERIAL`.

Use one adb for everything. A second adb of another version restarts the
server and the running emulators drop off it. If your emulator comes from
your own SDK, put that SDK's `platform-tools` first on the PATH.

Debug builds render with Vulkan, set in `src/debug/AndroidManifest.xml`.
An emulator on the software GPU, which `-gpu auto` picks without a display,
crashes in its GLES decoder as soon as the app draws. An emulator on the
host's GPU (`-gpu host`) is the reverse: Vulkan crashes on the first
artwork it decodes, and OpenGL ES works. Build for that one with
`MATINEE_IMPELLER_BACKEND=opengles flutter build apk --debug`.

### iOS

The flake's Flutter shell is Linux-only, so the iOS build needs a Mac with
Xcode and the same Flutter version, 3.47.4. From `apps/flutter`:

```sh
flutter build ios --debug --no-codesign   # what CI builds
flutter run                               # on a simulator or a device
```

The Runner targets iOS 16 on iPhone and iPad, with the bundle id
`io.github.zekurio.matinee`. Running on a device needs your own team set
in Xcode. Don't commit it. `just flutter pigeon` writes the Swift side of
the platform channels into `ios/Runner/Pigeon`.

The version comes from the root `package.json`, as on Android, since
`pubspec.yaml` has none. Flutter warns that the build name and number are
missing and leaves them empty. The Runner's last build phase, Version, then
runs `ios/version.sh`, which writes the version into the built app's
`Info.plist` as `CFBundleShortVersionString` and the Android version code
as `CFBundleVersion`, 9 for 0.0.9. It runs however the build starts,
`flutter build`, `flutter run`, or Xcode, and fails it when the version
isn't `major.minor.patch`. CI reads both back with
`ios/version.sh --check`.

### Apple TV

Flutter has no tvOS engine, so the Apple TV app runs on Flutter's with
Plezy's tvOS patches,
[edde746/flutter-plezy](https://github.com/edde746/flutter-plezy), a
prebuilt download. `tvos/engine.version` and `tvos/engine.sha256` pin it,
and nothing unpacks before the checksum matches. It is engine 3.47.1 under
the framework of Flutter 3.47.4. That works because the engine's own
frontend server compiles the Dart code against its own SDK. A framework
release that calls into `dart:ui` where 3.47.1 has nothing fails in that
compile, and then the engine needs a newer build first.

On a Mac with Apple silicon, Xcode, and Flutter 3.47.4, from
`apps/flutter`:

```sh
flutter pub get
tvos/scripts/fetch_engine.sh        # once, and after engine.version changes
open tvos/Runner.xcodeproj          # then build and run the Runner scheme
```

`fetch_engine.sh` keeps the engine in `~/.cache/matinee` and writes
`tvos/Flutter/Generated.xcconfig`, which isn't checked in. The Flutter
tool can't build for tvOS, so the Runner's build phases call
`tvos/scripts/build.sh`. It makes `App.framework` from the Dart code and
embeds it with the engine's `Flutter.framework`. A simulator gets a debug
app. A device gets a release app whatever the configuration, since tvOS
lets no app run code it compiled itself and the debug engine needs to.
There's no hot reload and no `flutter run`.

The bundle id is `io.github.zekurio.matinee`, the iPhone app's, and the
version comes from the root `package.json` through `ios/version.sh`.
`tvos/Runner.xcodeproj` is checked in, and `tvos/scripts/project.rb`
writes it. To add a Swift file, add it to the list in that script and
run it, rather than through Xcode.

No plugin has a tvOS side, and no plugin registrant runs there. The
target compiles the iPhone app's player and bridges from `ios/Runner`,
which hold the few `#if os(tvOS)` branches, and its own files in
`tvos/Runner`. `lib/core/apple_tv.dart` stands in for the plugins. Settings
go to the system's defaults and tokens to the Keychain through
`AppleTvApi`, and artwork to the caches folder.

The engine sends the Siri Remote's ring, Select, and Menu as arrow keys,
Select, and Escape. Escape is Back. tvOS gives an app no way to leave, so
on the screen where Back would leave, Home with its drawer open, the app
tells the engine to let the next Menu through to the system. Where the app
didn't see it coming, as on the sign-in screens, the Menu after a Back
that closed nothing leaves. A swipe on the touch surface comes as finger
positions, which `AppleTvRemote` turns into arrow keys. Play/Pause comes
from `tvos/Runner/MatineeViewController.swift` as a media command.

Not there yet: matching the TV's frame rate and dynamic range to the
video, picture in picture, and the Top Shelf.

### Tests

The tests guard logic that breaks without anyone seeing it: the API
client's encoding, the session and its storage, token scoping,
permissions, the sign-in protocols, the playback session's rules, download
track picking, and the TV focus rules. Screens are checked by eye on an
emulator, so there are no widget snapshots or goldens. Add a test when a
rule is easy to break and hard to notice, and name the bug it pins.

## Layout

| Folder            | What's in it                                              |
| ----------------- | --------------------------------------------------------- |
| `lib/api`         | The generated API client                                  |
| `lib/core`        | Session, device, permissions, and what screens share      |
| `lib/query`       | Server reads: queries, live streams, reconnecting         |
| `lib/kit`         | The UI kit and theme                                      |
| `lib/launcher`    | Android TV's Watch Next row                               |
| `lib/l10n`        | The strings, as ARB files                                 |
| `lib/media`       | Artwork, cards filled from the API, media actions         |
| `lib/player`      | The player, its sessions, and the TV player in `tv/`      |
| `lib/downloads`   | The Dart side of downloads                                |
| `lib/screens`     | One folder per screen, with the TV's in `tv/`             |
| `lib/router.dart` | Every route, and `Routes`, which builds their paths       |
| `pigeons`         | Pigeon definitions for what Dart asks the platform        |
| `android`         | The Android project, with the native side of each channel |
| `ios`             | The iOS project, with the native side of each channel     |
| `tvos`            | The Apple TV project, its own sources, and its scripts    |

State is Riverpod without code generation, and routing is go_router.
Screens open a page with `context.push(Routes.title(id))`, never with a
typed-out path. The session's state picks the screen: `authRedirect` in
`router.dart` maps each `AuthState` to a route, so nothing navigates to
sign-in or back by hand. A TV gets its own route table, `_tvRoutes()`.

### The kit boundary

Screens build from `lib/kit`, the port of `packages/ui` and its theme,
with the web's component names. Only `lib/kit` and `lib/app.dart` import
Material or Cupertino, and only for behaviour like dragging, menus, and
text editing that the kit then draws itself. `test/kit_boundary_test.dart`
fails on any other import. If a screen needs a widget the kit lacks, add
it to the kit.

### Generated code

Never edit or format these by hand. `pnpm verify` fails while any is out
of date.

| Command               | Writes                                                | From                                         |
| --------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `pnpm api:dart`       | `lib/api/contract_*.dart`                             | the OpenAPI document                         |
| `pnpm themes:dart`    | `lib/kit/theme_presets.g.dart`                        | `packages/ui`                                |
| `pnpm icons:dart`     | `lib/kit/lucide.g.dart`                               | lucide-react, listed in `scripts/lucide.mjs` |
| `pnpm logo:dart`      | `lib/kit/logo.g.dart`                                 | `brand/logo-*.svg`                           |
| `pnpm strings:dart`   | shared ARB entries, `lib/l10n/server_messages.g.dart` | the web's catalogs                           |
| `just flutter pigeon` | `lib/platform/*.g.dart`, the Kotlin and Swift sides   | `pigeons/*.dart`                             |

### Strings

The ARB files in `lib/l10n` hold every string, English in `app_en.arb` and
German in `app_de.arb`. Add a message to the English file first with its
placeholders declared, then translate it. `flutter pub get` writes
`AppLocalizations` from them. `test/l10n_test.dart` fails when a German
message has a key or placeholder the English lacks, and
`test/font_coverage_test.dart` when the bundled font can't draw a
character in any of them.

Messages the web shares live in `apps/web/src/i18n/locales`. Edit them
there and run `pnpm strings:dart`, which updates the shared ARB entries
and the lookup that turns a server message into the app's words.

### Permissions

What a screen offers follows the account's permissions, never its role:
`can(user, permission)` in `lib/core/permissions.dart`, or
`canProvider(permission)` for the account signed in, which is false
offline. The names are `Permission`'s in the API client, where
`Permission.allValue` is the permission `all` and `Permission.all` lists
every one. The server sends everything the account holds in
`User.permissions`, the ones every account has included, and `all` alone
for an admin, so `can` only looks a name up. A user saved before the
server sent permissions reads with none until the session saves the
server's answer.

## Sessions

`lib/core/session.dart` holds the saved servers, the one in use, and its
session. Screens read `authStateProvider`, `savedServersProvider`, and
`apiProvider`, and call methods on `sessionProvider.notifier`.

- Tokens live in flutter_secure_storage, one per server. Everything else
  lives in shared_preferences.
- A token the keystore can't decrypt is never deleted for that.
  `resetOnError`, which wipes every secret when one fails, is off, and the
  app shows the unreachable screen with `unreadableSession`, where Try
  again reads the keystore once more and downloads still play. Only a
  token the server refuses is dropped on its own.
- Every HTTP client sends the bearer token only to its own server's
  origin. A client made for one sign-in refuses to send once the sign-in
  changes, so read `apiProvider` again after one.
- After signing in, the app names itself to the server with
  `Device.clientName`, like "Matinee Android TV". The server shows that
  name as it is, so it isn't translated.
- Browser sign-in is RFC 8252 with PKCE through flutter_web_auth_2, back to
  `matinee://auth/callback`. A TV signs in with a device code and a QR
  code that a phone approves.
- The debug and release IDs are the ones the earlier native Android app
  used, so this APK installs over it. On the first launch `freshStart`
  deletes what that app kept before anything reads storage.

## Server data

Screens read the server through `serverQuery`, `serverQueryFamily`, and
`serverStreamFamily` from `lib/query/server_data.dart`, declared next to
the screen that shows them. Each follows `apiProvider`, so a sign-in or a
server switch fetches again. None retries on its own, unlike Riverpod's
default. Errors go to `FailureState`, which shows only the cloud and Try
again when the server can't be reached. A live stream goes through
`reconnecting`: it opens again at once when the server ends it, backs off
from one second to thirty when it drops, and keeps its last value
meanwhile. `ReturnWatcher` tells a screen the person came back to it, and
the screen decides what is old enough to fetch again.

## The player

`lib/player` has an abstract `Player`, a `VideoView` that leaves a
transparent hole where the video goes, and the sessions that drive it.
On Android the video never goes through a Flutter texture.
`PlayerSurfaceHost` puts a `SurfaceView` beneath a transparent Flutter
view, so MediaCodec output goes straight to the compositor. Two engines sit
behind the interface: libmpv, the default, and Media3. `PlaybackSession`
asks `playback.start` with the engine's decoder profile, opens what the
server returns, and keeps progress on the file's timeline even when a seek
returns a stream that starts partway in. When a source fails it asks again
without the methods that failed. mpv gets its media through a loopback
relay, `playback_relay.dart`, so no credentials or signed URLs reach it.
The TV player uses the same session with its own controls and one key
handler. With Match frame rate on, it switches the screen to a refresh
rate that plays the video's frame rate evenly.

A downloaded file plays through `OfflinePlaybackSession`, which has no
server to ask: its skip segments and the point to offer the next episode
come from what `downloads.resolve` sent with the download, and the
episodes either side from the other downloads of the same show.

libmpv is the `mpv-android` AAR from
[edde746/mpv-build](https://github.com/edde746/mpv-build), pinned by
version and SHA-256 in `android/app/build.gradle.kts` and
`android/gradle/verification-metadata.xml`. Gradle refuses an AAR that
doesn't match. To update it, change both. `test/licenses_test.dart` fails
when the Gradle build bundles a library whose license
`lib/core/licenses.dart` doesn't carry.

On iOS there is one engine, libmpv, in `ios/Runner/Player`. It is the
MPVKit Swift package from the same repository, pinned by revision in the
Xcode project. mpv's avfoundation output draws into a layer beneath the
Flutter view, at the rectangle `VideoView` leaves transparent, and the
same layer feeds picture in picture.

iOS's picture in picture shows that layer and nothing of the Flutter view
over it. Subtitles mpv draws go into the frames while the small window is
open (`avfoundation-pip-composite-osd`). The text subtitles the app draws
itself would be missing, so while the window is open the session hands mpv
the same WebVTT as an external subtitle (`drawCaptionsInPlayer`), and the
app leaves them out. They then have mpv's look, not the one Settings
gives the app's. Android's small window is the whole app, so nothing
changes there.

## Watch Next

On an Android TV, Continue watching and Next up also go to the launcher's
Watch Next row. The server's two lists decide what goes in and in what
order, and the launcher how the row looks.

`lib/launcher/watch_next.dart` fetches the lists and syncs when the session
changes, when the app comes to the front, and when what's watched changes,
which includes the player's last report. Nothing syncs while the app is
closed. A failed fetch leaves the row as it was. The Kotlin side,
`launcher/WatchNext.kt`, writes the rows through the framework's
`TvContract.WatchNextPrograms`, so there's no tvprovider dependency. Rows
keep their ids, and a row whose columns are the same isn't written.

- Continue watching rows are dated by `progress.updatedAt`. Next up rows
  are dated by `NextUpEntry.lastWatchedAt`, when the episode before was
  finished, and carry no position. A time that doesn't parse stays empty
  and the device's clock never stands in.
- Artwork needs a session, which the launcher doesn't have. Dart fetches
  each picture once and Kotlin keeps it in private files. A FileProvider,
  off in the manifest and turned on on a TV, grants each picture to the
  launchers and the TV provider. Grants end with a restart, so a boot
  receiver makes them again. No token or server address goes into the
  launcher's table.
- A card opens `matinee://watch-next/<hash>/<file>`, where the hash is of
  the server and the account. Dart plays the file as Resume does, and only
  for the account whose row it was. A stale card opens the app and
  nothing else.
- When the person removes a card, the launcher hides the row or deletes
  it. The app never writes that flag. It remembers when the card was last
  watched, and the file comes back only with playback after that.
  `WatchNextPlanTest.kt` pins these rules.
- Signing out, or another account or server, empties the row and deletes
  its pictures.

`adb shell content query --uri content://android.media.tv/watch_next_program`
returns nothing on TV images that show a caller only its own rows. Look at
the launcher's row.

## Downloads

Downloads are native. `lib/downloads` follows the platform's list and tells
it what to do, and keeps `DownloadMeta` with each entry. The Kotlin side
keeps the list as JSON in `filesDir/offline` and runs one WorkManager job
per download, so a download carries on with the app closed and resumes
after the network drops or the device restarts. The file as it is comes
by byte ranges. A version made for the device comes in segments appended
to one mp4, and a version still waiting its turn on the server waits
rather than failing. Media3 can't seek in that mp4 by itself, so
`FragmentIndex.kt` reads the fragments' headers for it. The tokens the jobs
send are sealed with a key in the Android Keystore.

The Swift side, `ios/Runner/Downloads`, follows the same rules on a
background URLSession, which carries on with the app suspended or closed.

Each download belongs to the server it came from and shows, plays, and
syncs only with that one. The server decides what a download holds, and
what it offers with no server to ask: `downloads.resolve` sends the skip
segments, where to start offering the next episode, and the show's files
in order, and `DownloadMeta` keeps them with the download. Previous and
Next go to the nearest of those files that is on the device too. The app
picks tracks itself only for a download playing without a server
(`download_tracks.dart`). A download made before the server sent those
plays without skips and finds its neighbours by season and episode
number. Progress made offline waits in `PendingProgress` and goes to the
server once it answers. Offline Home builds Continue watching and Next up
from what online Home last saved, then from what was played offline since.

## Decisions to keep

These differ from what someone might expect, on purpose.

- A source that buffers for a minute with neither the picture nor its
  cache moving fails as the server not answering. mpv otherwise waits
  forever on a connection that went quiet. After ten seconds of that, a
  line under the spinner says it's waiting for the server.
- Play and pause follow what the viewer asked for, `wantsPlay`, not
  whether frames move. A press during a stall pauses, and it stays paused
  when data comes back. A stall the viewer paused in doesn't count toward
  the minute.
- Marking a show or a season unwatched asks first, because it forgets
  where every episode stopped and can't be undone. An episode or a movie
  goes at once.
- On a TV, signing out asks first with focus on Cancel, since signing in
  again needs a phone.
- The phone holds a request's Cancel and an admin's answers for the
  toast's Undo. A TV's toast can't take focus, so the TV sends them at
  once (`undo: false`), and asks first for Cancel, Decline, and Give up.
- A TV row's heading can't take focus, so a row that leads somewhere ends
  in a See all card. Discover's Recent requests row is the way to the
  requests overview, so it shows whenever it has a card; with none, there
  is nothing to open.
- An Apple TV takes each Play/Pause press natively and sends it once, as
  a media command. tvOS delivers one press in up to three ways, and two
  toggles would cancel out, so the TV player ignores the play and pause
  keys there and the native side drops a second command within half a
  second.
- The TV's code screen shows only the title, one sentence with the link
  address, the code, and the QR code. Change server sits small at the
  bottom left.
- TV focus moves by geometry. Each row remembers its focused card, and a
  page of rows scrolls only to where the row above is whole or gone, so
  no row is left cut at the top. Rows that fit never scroll. Panels keep
  a focused row out of the overscan.
- On a TV, Back from a page opens the drawer, and Back on Home's drawer
  leaves the app. `BackClaim` keeps Back for the app on a TV whatever the
  navigators say.
- The app log scrubs hosts, account names, ids, paths, and tokens from
  every line, and leaves the device only when the person shares it.

## Release

A `v*` tag builds the release in `.github/workflows/release.yml` through
`tools/release/apk.mjs`: `flutter build apk --release` for the universal
APK and `--split-per-abi` for arm64-v8a, armeabi-v7a, and x86_64, signed
with the key `MATINEE_KEYSTORE_PROPERTIES` names. Every APK of a release
has the version code `major * 10000 + minor * 100 + patch`.
`force-version-code-ignoring-abi` in `android/gradle.properties` stops
Flutter from adding 1000 per ABI, so an ABI's APK and the universal one
update each other. To build them with your own keystore, from the
repository root:

```sh
MATINEE_KEYSTORE_PROPERTIES=… nix develop .#flutter -c node tools/release/apk.mjs <folder>
```

## License

GPL-3.0, in `LICENSE`, since the app bundles libmpv and a GPL build of
FFmpeg.
