# Matinee for phones, tablets, and TVs

One Flutter app for Android, Android tablets, Android TV, iPhone, iPad,
and Apple TV. It replaces the Kotlin app in `apps/android` and the SwiftUI
apps in `apps/ios`, which keep shipping until it reaches them. Video plays
in each platform's native player, behind the Flutter view.

So far it has the toolchain, the kit, the API client, the strings, the
sessions, the screens that connect and sign in, the tabs, Home, Shows,
Movies, the genre and studio pages, the title, season, and episode
pages, search, the profile, settings, and the Android phone and tablet
player. Every other screen behind the tabs is a placeholder that shows
its route.

## Build

The recipes enter the flake's Flutter shell for you. Entering it accepts
the Android SDK license.

| Recipe                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `just flutter build`   | Debug APK in `build/app/outputs/flutter-apk/` |
| `just flutter install` | Builds and installs the debug app             |
| `just flutter run`     | Installs the debug app and opens it           |
| `just flutter check`   | What CI runs: analyzer, format check, tests   |
| `just flutter format`  | Formats the Dart code                         |
| `just flutter api`     | Regenerates the API client                    |
| `just flutter pigeon`  | Regenerates the platform channels             |
| `just flutter reverse` | Forwards `localhost:5173` to the device       |
| `just flutter logcat`  | Follows the debug app's log                   |

By hand:

```sh
cd apps/flutter
nix develop ../..#flutter -c flutter build apk --debug
```

The version comes from the root `package.json`, like every other part of
the repository, so `pubspec.yaml` has none.

## Run on an emulator

The Flutter shell has no emulator. Use one from your own Android SDK or
Android Studio: a Pixel phone, the Pixel Tablet, and a Television AVD
cover the three layouts. `just flutter run` installs on whichever device
adb sees, or on `ANDROID_SERIAL`.

Use one adb for everything. A second adb of another version restarts the
server, and the running emulators drop off it. If your emulator comes
from your own SDK, put that SDK's `platform-tools` first on the PATH.

The debug app is `io.github.zekurio.matinee.debug`, the same ID as the
Kotlin app's debug build, so installing one replaces the other.

Debug builds render with Vulkan (`src/debug/AndroidManifest.xml`). On an
emulator Impeller would pick OpenGL ES, and the emulator's software GPU,
which `-gpu auto` picks when there's no display, crashes in its GLES
decoder as soon as the app draws.

## Layout

| Folder            | What's in it                                             |
| ----------------- | -------------------------------------------------------- |
| `lib/api`         | The generated API client, from the contract              |
| `lib/core`        | What the screens share: the device, width classes        |
| `lib/query`       | How screens read the server: queries, live streams       |
| `lib/kit`         | The UI kit and theme, see below                          |
| `lib/l10n`        | The strings, as ARB files                                |
| `lib/media`       | Widgets that show the server's media: artwork, cards     |
| `lib/platform`    | Generated platform channels, from `pigeons/`             |
| `lib/player`      | The player interface, `VideoView`, and the player lab    |
| `lib/screens`     | One folder per screen; `shell` holds the tabs            |
| `lib/router.dart` | Every route, and `Routes`, which builds their paths      |
| `pigeons`         | Pigeon definitions for what Dart asks the platform       |
| `android`         | The Android project, with the native half of each bridge |

State is Riverpod, without code generation. Routing is go_router. Screens
open a page with `context.push(Routes.title(id))`, never with a path
typed out. Phones and tablets share one frame (`lib/screens/shell`): the
header on top, with the logo, settings, and search, and the tabs along the
bottom, Home, Shows, Movies, Downloads, and the profile. Both stay while a
tab scrolls. Each tab keeps its own stack, and every other page opens over
them without either. When a tab's label doesn't fit, as on a small phone
or with large text, the tabs show only their icons. Search opens Explore,
which an admin's waiting requests head. A TV gets its own routes.

A platform channel starts as a Pigeon file in `pigeons/`. Run
`just flutter pigeon`, then implement the generated interface on the
native side, as `MainActivity.kt` does for `DeviceApi`.

## Sessions and sign-in

`lib/core/session.dart` holds the saved servers, the one in use, and the
session on it; the Kotlin app's `Session` is its model. Screens read
`authStateProvider`, `savedServersProvider`, and `apiProvider`, and call
the methods on `sessionProvider.notifier`. `sign_in_state.dart` has what
the sign-in screens do apart from how they look.

- Tokens live in flutter_secure_storage, one per server. The server list,
  the server in use, and offline mode live in shared_preferences.
- Every HTTP client adds the User-Agent, and the bearer token only to its
  server's origin. A client made for one sign-in refuses to send once the
  sign-in changes, so use `apiProvider` again after one.
- Browser sign-in is RFC 8252 with PKCE through flutter_web_auth_2, back
  to `matinee://auth/callback`. A TV signs in with a code instead.
- On Android 17, reaching or finding a server on the local network needs
  `ACCESS_LOCAL_NETWORK`, asked through the platform bridge before
  connecting, retrying, and searching.
- The session's state picks the screen. `authRedirect` in `lib/router.dart`
  maps it to a route, and the router asks again whenever `authStateProvider`
  changes (its `refreshListenable`), so nothing navigates by hand:
  `NoServer` is `/connect`, `Connecting` is `/connecting`, `Unreachable` is
  `/unreachable`, `SignedOut` is `/sign-in`, and `SignedIn` or `Offline` is
  the tabs, wherever the person already is. The screens are in
  `lib/screens/sign_in`, with the TV's, which sign in by code and show a
  QR code, in `tv/`. Neither keeps what it shows in the route, only the
  session.
- This APK installs over the Kotlin app, and existing installs start
  fresh: on the first launch the platform deletes what the Kotlin app
  kept (its preferences, folders, session key, and Watch Next programs)
  before anything reads storage (`freshStart` in `main`).

## Video on Android

`lib/player/` is the Dart side: an abstract `Player`, a `VideoView` that
leaves a transparent hole, and Riverpod providers for the state. The Kotlin
side is in `android/app/src/main/kotlin/.../player/`, reached over the
Pigeon channels declared in `pigeons/player.dart` (`just flutter pigeon`
writes both ends).

Video never goes through a Flutter texture. `PlayerSurfaceHost` puts a
`SurfaceView` in a container beneath the Flutter view, and the Flutter view
is a transparent `TextureView` above it, so MediaCodec output goes straight
to the compositor. Two engines sit behind the interface: libmpv (default)
and Media3.

libmpv is the `mpv-android` AAR from
[edde746/mpv-build](https://github.com/edde746/mpv-build). Its version and
SHA-256 are pinned in `android/app/build.gradle.kts` and
`android/gradle/verification-metadata.xml`; Gradle refuses an AAR that
doesn't match. To move to a newer build, change both from the pinned
`mpv-build.lock.json` of the Plezy revision named in `NOTICE.md`, or from
the release you chose.

Debug builds have a player lab at `/debug/player`, behind a button at the
end of Home. It plays an HLS stream and an MKV with two audio tracks
and two subtitle tracks on either engine, with seek, track, fit, and rate
controls and the live state. The engine picker is saved and also applies
to server playback. To play a server file from the lab, sign in and enter
its media item UUID in the Media item ID field.

`Routes.play(itemId)` opens the same player from a phone or tablet screen.
It sends the engine's decoder profile to `playback.start` and loads the
returned source. It uses the server's track picks, resume position, skip
segments, and next episode. The controls send track and quality changes
back to the server, and progress stays on the file's timeline even when
`playback.seek` returns a stream that starts partway through the file.

## Server data

Screens read the server through providers made in `lib/query/server_data.dart`,
declared next to the screen that shows them:

```dart
final featuredProvider = serverQuery((api) => api.home.featured());
final shelfProvider = serverQueryFamily(
  (api, String library) => api.media.shelf(library, limit: 12),
);
final liveProvider = serverStreamFamily(
  (api, Titles titles) => api.requests.live(titles: titles.inputs),
);
```

A screen watches one and gets an `AsyncValue`. `.value` is the last
answer, kept while `ref.invalidate(provider)` fetches again; an error goes
to `FailureState` (`lib/query/failure_view.dart`), which words it through
`describeFailure` and shows only the cloud and Try again when the server
can't be reached. Each provider follows `apiProvider`, so a sign-in or a
server switch fetches again; goes away once nothing watches it; and never
retries on its own, unlike Riverpod's default. A live stream from
`transport.events` goes through `reconnecting` (`lib/query/reconnecting.dart`):
it opens again at once when the server ends it, after a backoff from one
second up to thirty when it drops, and keeps its last value meanwhile.
Follow only what the server sends whole on each connect, as its
`follow(...)` streams and the request snapshots do. `ReturnWatcher`
(`lib/query/refresh.dart`) tells a screen the person came back to it, from
another page or tab or from the background, and the screen picks what's
old enough to fetch again.

`lib/media` shows what comes back. `Picture` loads artwork from the
server's paths through the session's artwork client, which sends each
saved server its own token, picks the smallest of the server's sizes that
is sharp in its box at the screen's density, keeps every picture in the
app's cache folder (`DiskArtworkCache`, at most 256 MB), shows the
artwork's BlurHash while it loads, and falls back through its sources,
leaving the title's tone when none loads. `TitleCard`, `ShelfCard`, and
`EpisodeCard` are the kit's cards filled from the API, and `layout.dart`
has the rails' card widths and the grids' column counts by width class.

## Home

`lib/screens/home` is the Kotlin app's Home for phones and tablets. A
phone opens with the featured cards under the header, which swipe one at
a time and move on every five seconds; from 600 wide, Home opens with the
web's banner, its slides crossfading every eight seconds, with Play and
Details. Under them come Continue watching, Next up, the recommendation
rows, "My requests", whose cards follow `requests.live`, and each
library's newest titles. A row that's loading, empty, or failed is left
out (a shelf shows its heading over blank cards while it loads), and Home
is one error page only when the libraries failed and nothing else came.
Back on Home after half a minute, what's in progress and the shelves are
fetched again; the recommendations after ten minutes; the featured titles
only when they failed, since the server picks them at random. The rules
for the carousel's and the banner's sizes and paging are in
`home_layout.dart`. Offline, Home says so until the downloads exist.

## Title pages

`lib/screens/title` holds a movie's or show's page (`Routes.title`), a
season's (`Routes.season`, with -1 for the files without a season
number), and an episode's (`Routes.episode`), the Kotlin app's
`TitleScreens.kt` over the web's title page. Each has the backdrop and
heading with the facts the server sends, the overview and crew, Play or
Resume for the file the server names (`Title.next`; on a season page that
episode when it's in the season, else the one in progress or the first
unwatched), the tick, the heart, and the trailer. A movie with more than
one file gets a picker, each file in the words of its probe. A show leads
with the episode up next, then its seasons, or with one season its
episodes; a season lists its episodes; an episode shows the rest of its
season. The cast opens `Routes.person`, the genres and studios
`Routes.browse`. A title the server matched has its related rows from
`catalog.related`: the titles here are the library's cards, and the rest
open nothing until the catalog's pages exist. A page fetches again when
the person comes back to it, and whenever a change lands.

The tick and the heart show their new state at once and go back if the
server refuses, with a toast (`toastProvider`, shown over every screen).
Marking watched asks when, as the web does (`lib/media/watched_at.dart`).
A long press on a card, here or on Home, opens its menu
(`lib/media/actions.dart`): Play, Play from the start, the tick and heart,
the pages it belongs to, and "Not interested" on a recommendation. Every
change bumps `mediaChangesProvider`, which the pages and Home listen to.

## Shows, Movies, and Browse

`lib/screens/library` replaces the Kotlin app's Media tab and its library
pages. Shows lists every show the viewer can see and Movies every movie,
across the libraries, from `titles.browse` with the kind; with more than
one library of the kind, a menu under the tab's name narrows it to one, as
on the web. `Routes.browse(genre:, studio:)` opens the same grid as a page
for a genre or a studio, with a choice of movies or shows once there are
both. Posters fill as many columns as `posterColumns` gives the width, and
the next page of 60 loads as the end of the grid comes near.

The sort menu offers each sort the server has values for
(`titles.filterOptions`), both ways; the Filter button opens the filters
in a sheet, no wider than 640 on a tablet, with only the choices the
server offers for the list. Each change applies at once and shows as a
chip under the heading that takes it off. The server does the sorting and
filtering. The tabs keep what was picked for the sitting, until a sign-in
or a switch to another server; a genre's or a studio's page keeps it while
it's open. Other choices keep the last titles on screen, dimmed, until
the new ones come. A tap on the open tab scrolls its grid to the top
(`tabReselectProvider` in the shell). Back on a list after half a minute,
the titles loaded so far are fetched again in place, and the filters'
counts with them. The language filter waits for a way to name languages
in the app's language.

## Search

`lib/screens/search` is the Kotlin app's search. The field searches the
library 250 ms after typing pauses (`search.query`, 40 matches), and the
last answer stays on screen, with "Searching…" under it, while the next
is out. Matches come as the server ranked them: titles by library, then
cast and crew, then genres and studios as chips that open Browse. Like
the Kotlin app it keeps no recent searches. The empty field shows
nothing yet; it's where Explore's rails go.

## Profile

`lib/screens/profile` is the fifth tab, the Kotlin app's profile: the
account's picture (`Avatar` in `lib/media`, which the tab bar shows too),
name, and since when it's here; favorites, whose heading opens
`Routes.favorites`; the statistics for a range, with watch time per day,
week, or month as bars that read out under a finger, the totals, the most
watched titles, the genres, where the person stands on the leaderboard,
and when in the week they watch; what they watched last, opening
`Routes.recent`; and the account, to switch server or account through
the server list or to sign out. The statistics count days and hours in
the device's time zone, which `DeviceFacts.timeZone` reads. The last
range's figures stay while the next range loads. Offline it's the person
and the account rows.

## Settings

`lib/screens/settings` is the Kotlin app's Settings for phones and
tablets: offline mode on top, then Appearance, Playback, and About, then
the server in use and the app's version. Each category opens
`Routes.settingsPage(key)`, and a key it doesn't know opens the first
page. Appearance picks light, dark, or the system's scheme and the theme
preset (`themeStoreProvider`); Playback, on Android only, picks the
engine, mpv or Media3 (`playerEngineProvider`); About shows the version,
the system, and the device, and the licenses page lays out `NOTICE.md`,
which the app bundles as an asset. The rows (`Panel`, `LinkRow`,
`SwitchRow`, `ValueRow`, `PickerRow`) are in `settings_rows.dart`. Signing
out and switching server or account are on the profile. The Kotlin app's
account and sessions, linking a device, subtitles, downloads, the app
log, playback diagnostics, and the admin pages aren't here yet.

## Strings

The ARB files in `lib/l10n` hold every string, English in `app_en.arb`
and German in `app_de.arb`. Add a message to the English file first,
with its placeholders declared, then translate it. `flutter pub get`
writes the `AppLocalizations` class from them. `test/l10n_test.dart`
fails when a German message has a key the English lacks or uses a
placeholder the English doesn't declare.

`scripts/android_strings.mjs` moved the strings over from the Kotlin app.
It overwrites both files, so don't run it again once this app has strings
of its own.

## The kit

Screens build from `lib/kit`, the port of `packages/ui` and its theme. It
keeps the web's and the Android kit's names: `MatineeButton` (looks, sizes,
`shape`, `dimmed`, and the `glass` and `frosted` looks for buttons over a
picture), `Checkbox`, `ChoiceChip`, `ToggleChip`, `Dialog`, `ConfirmDialog`,
`Menu`, `PageDots`, `ProgressRing`, `SearchPill`, `Sheet`, `Slider`,
`QrCodeCard`, `RangeSlider`, `Spinner`, `Switch`, `TabBar` with `TabBarState`,
`MatineeTextField`, `Toast` with `ToastState`, `Calendar`, and
`PressIndication`, which stands in for Material's ripple and takes a long
press, `RoundIconButton`, `Badge`, and the sheet's `SheetItem` and
`SheetSeparator`. Words come in as parameters.

For media pages it has the Kotlin app's cards and their layout, none of
which knows the API: `PosterCard` and `WideCard` (a still with watch
progress) over an `ArtFrame` on the title's `Tone`, `Rail` and
`RailSkeleton`, `PersonCard`, the sliver `CardGrid`, which takes its column count from
the screen, `PageFrame` for a page opened over the tabs (Back, a title,
the body), and `SkeletonBox`, `LoadingState`, `EmptyState`, and
`ErrorState`. `CardMetrics` holds the gutter, the gaps, and a card's
height for its width and the text size, which rails and grids need
because they lay out cards they haven't built. `KitIcon` draws the lucide icons in `Lucide` and follows the
text color around it.

Only `lib/kit` and `lib/app.dart` import Material or Cupertino, and only
for behavior (dragging, menus, the text field's editing) that the kit then
draws as the web does; `test/kit_boundary_test.dart` fails on anything
else. If a screen needs a widget the kit doesn't have, add it to the kit.

`MatineeTheme` carries the web's color roles, `KitText` its font sizes and
line heights, and `KitRadius` its radii; Red Hat Text is the default
family. `themeStoreProvider` keeps the preset and light, dark, or system
in shared preferences. Presets, icons, and the logo are generated, so a
change to the web's palettes, a new icon, or a new logo needs:

```sh
pnpm themes:dart   # lib/kit/theme_presets.g.dart, from packages/ui
pnpm icons:dart    # lib/kit/lucide.g.dart, from lucide-react
pnpm logo:dart     # lib/kit/logo.g.dart, from brand/logo-*.svg
```

Add an icon to the list in `scripts/lucide.mjs` first. `pnpm verify` fails
while any of them is out of date.

`lib/kit/gallery.dart` shows every component. `test/kit` renders it, and
each group, at 412 by 915 in dark and light with the real font, and
compares them with `test/kit/goldens`. After changing a component, run
`just flutter test --update-goldens` and look at the images that changed.

## License

GPL-3.0, like the native apps it replaces, since it bundles libmpv.
