# Matinee for phones, tablets, and TVs

One Flutter app for Android, Android tablets, Android TV, iPhone, iPad,
and Apple TV. It replaces the Kotlin app in `apps/android` and the SwiftUI
apps in `apps/ios`, which keep shipping until it reaches them. Video plays
in each platform's native player, behind the Flutter view.

So far it has the toolchain, the kit, the API client, the strings, the
sessions, the screens that connect and sign in, the tabs, Home, Shows,
Movies, the genre and studio pages, the title, season, and episode
pages, search with Explore, the catalog's pages and requests, the
profile, settings, downloads and offline mode on Android phones and
tablets, and the Android phone and tablet player. Every other screen
behind the tabs is a placeholder that shows its route.

## Build

The recipes enter the flake's Flutter shell for you. Entering it accepts
the Android SDK license.

| Recipe                      | What it does                                  |
| --------------------------- | --------------------------------------------- |
| `just flutter build`        | Debug APK in `build/app/outputs/flutter-apk/` |
| `just flutter install`      | Builds and installs the debug app             |
| `just flutter run`          | Installs the debug app and opens it           |
| `just flutter check`        | What CI runs: analyzer, format check, tests   |
| `just flutter format`       | Formats the Dart code                         |
| `just flutter api`          | Regenerates the API client                    |
| `just flutter pigeon`       | Regenerates the platform channels             |
| `just flutter android-test` | Runs the Kotlin unit tests on the JVM         |
| `just flutter reverse`      | Forwards `localhost:5173` to the device       |
| `just flutter logcat`       | Follows the debug app's log                   |

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
decoder as soon as the app draws. An emulator on the host's GPU (`-gpu
host`) is the other way round: Vulkan crashes in the first artwork it
decodes, since Impeller decodes into memory gfxstream maps, and OpenGL ES
renders. Build for one with `MATINEE_IMPELLER_BACKEND=opengles`, as in
`MATINEE_IMPELLER_BACKEND=opengles flutter build apk --debug`.

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
- A token the keystore won't give back is never deleted for it. The
  plugin's `resetOnError`, which wipes every secret when one doesn't
  decrypt, is off (`PlatformSecretStore`), and `SessionStore` marks such a
  server's token unreadable rather than missing. The app doesn't ask the
  server or show sign-in then: it shows the unreachable screen with
  `Unreachability.unreadableSession`, where Try again reads the keystore
  once more, the downloads still play, and Sign in again
  (`signInAgain`) is the person's choice. The token stays saved until a
  sign-in replaces it or the person signs out, so the next start reads it
  again. Only a token the server refuses is dropped on its own.
- Every HTTP client adds the User-Agent, and the bearer token only to its
  server's origin. A client made for one sign-in refuses to send once the
  sign-in changes, so use `apiProvider` again after one.
- Once a session signs in, or checks out at launch, the app names itself
  through `account.sessions.identify` with `Device.clientName`: Matinee
  Android, Matinee Android TV, Matinee iOS, or Matinee Apple TV, the names
  the native apps send. The server shows it in the sessions list and
  watching now as it is, so it isn't translated. It's sent in the
  background, and a failure, or an older server's 404, is let go.
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

Its controls are the Kotlin phone player's, at the same sizes on a phone
and a tablet: the title and the audio, subtitles, speed, and quality
buttons along the top, the previous episode, the skips, play, and the next
episode in the middle, and the times over a seek bar the full width at the
bottom, each edge on its own shade. They fade after three and a half
seconds of playing, and stay while a screen reader is on. A menu slides in
as a panel from the side, over the video, which keeps playing. Spreading
two fingers fills the screen and pinching fits the video again. The pieces
are in `player_controls.dart`, `seek_bar.dart`, `player_panel.dart`, and
`player_overlays.dart`; `playback_screen.dart` puts them together.

The rest is the Kotlin player's too. A double tap skips, swipes set the
brightness, the volume, and the time (`video_gestures.dart`), and a held
finger plays at double speed. The lock hides the controls until it's
undone. The seek bar shows the server's trickplay frames. Picture in
picture comes on as the app is left while a video plays, or from its
button. A media session (`player_system.dart`, `MediaControls.kt`) puts
the video in the notification shade and on the lock screen and headsets,
and both engines answer it. A remote's, a keyboard's, and a headset's
keys play, skip, and bring up the controls. Subtitles take the look
Settings gives them (`subtitle_look.dart`): mpv takes its size, and
Media3 draws its cues in the whole look. Each sitting keeps a playback
report (`playback_report.dart`) of the sources tried and the engine's
codes, which Settings, About shows.

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
Details. The banner is dark in either scheme, as the web's: in light, its
art isn't washed white, and it meets the header and the page at a dark
edge. Under them come Continue watching, Next up, the recommendation
rows, "My requests", whose cards follow `requests.live` and open the
catalog's page or the library's (see Requests), and each
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
`catalog.related` (`CatalogRelatedRows` in `lib/screens/requests`): the
titles here are the library's cards, and the rest are catalog cards that
follow their state and open the catalog's page. A show the provider knows
more of than the server has gets the missing seasons at the end of its
seasons rail, each with its state and the request sheet, and a season
only partly here says "3 of 10 episodes here" and ends its episodes with
"Request the rest" (`show_gaps.dart`, from `catalog.missingSeasons`). A
page fetches again when the person comes back to it, and whenever a
change lands.

The tick and the heart show their new state at once and go back if the
server refuses, with a toast (`toastProvider`, shown over every screen).
Marking watched asks when, as the web does (`lib/media/watched_at.dart`).
A long press on a card, here or on Home, opens its menu
(`lib/media/actions.dart`): Play, Play from the start, the tick and heart,
the pages it belongs to, and "Not interested" on a recommendation. Every
change bumps `mediaChangesProvider`, which the pages and Home listen to.

## Fix match and images

`lib/screens/metadata` is the Kotlin app's `MetadataScreens.kt`, an
admin's metadata tools as pages. `Routes.identify` searches the
library's provider by hand, opening on the title's name and year, and
picking an entry matches the title to it and goes back with a toast.
`Routes.images` picks a title's poster, backdrop, and logo, a season's
poster, or an episode's still from what the provider has, in the
library's language or all of them, or uploads one through the system's
photo picker (`SystemApi.pickImage` in `pigeons/system.dart`, the
`PickVisualMedia` picker, or the document picker where there's none);
it takes JPEG, PNG, or WebP up to 25 MB, as the contract does, and
removes one or goes back to the provider's. The menus of a card and of
the title, season, and episode pages end with Fix match, Refresh
metadata, and Edit images (`lib/media/metadata_items.dart`) for an
admin, the server's only role that may; fix match and refresh only for a
movie or show whose library's provider has its API key. On a tablet the
image grid keeps a phone's width, as Settings does, where the Kotlin app
stretched its three columns across the screen.

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
counts with them.

The server sends languages and countries as codes, and Dart has no names
for them, so `lib/core/display_names.dart` asks the platform
(`DeviceApi.displayNames`, Java's locale names on Android, as the Kotlin
app's `languageName` and `countryName`) for them in the app's language.
The language filter, a row that opens a sheet with a field to find one,
and its chip name languages that way, and the age ratings their country;
until the answer comes, or for a code the platform doesn't know, the code
shows. Tests override `displayNameSourceProvider`.

## Search

`lib/screens/search` is the Kotlin app's search. The field searches the
library 250 ms after typing pauses (`search.query`, 40 matches), and the
last answer stays on screen, with "Searching…" under it, while the next
is out. Matches come as the server ranked them: titles by library, then
cast and crew, then genres and studios as chips that open Browse, then
the catalog's "Not here yet" (`catalog.search`), which loads on its own,
so the library's matches never wait for it. With nothing in the library
the catalog's titles come first without a heading, and "No match" shows
only once the catalog found nothing either. Titles the viewer can't
request, with requests off, are left out. Like the Kotlin app it keeps no
recent searches. The empty field shows Explore.

## Explore

`lib/screens/requests/discover.dart` is the Kotlin app's `Discover.kt`
under the search field: `discover.rails` says whether Discover is on and
which rows to show, in its order, and each row loads its first 20 cards
from `discover.row` on its own, with blank cards while it loads and a
line with Try again when it fails. Several failed rows say so once; all
of them failing, or `discover.rails` itself, is one message. A row's
heading opens its browse (`Routes.catalogBrowse` with the row's filters
and sort), and a recommendation's long press offers "Not interested",
which `recommendations.dismissed` takes and the rows leave out for the
sitting. Titles here already are the library's cards; the rest follow
`requests.live`. With Discover off, the page under the field stays empty.

`Explore(leading: ...)` takes slivers to put before the rows. The search
page passes an admin's `RequestsLink`, the way to the queue with how many
requests need them. A row of request cards goes in the same place once
the server sends one: add its sliver to `leading`, before or instead of
the link.

`CatalogBrowseScreen` (`catalog_browse.dart`) is `Routes.catalogBrowse`:
`discover.browse` a page at a time as the grid's end comes near, the sort
in a menu and the filters in a sheet, each from `discover.browseOptions`.
The cards say the score or the release date when the server says the
list calls for it. A long list keeps only the blocks of cards near the
screen, as the web's does.

## Requests

`lib/screens/requests` holds the catalog's side, the Kotlin app's
`ui/requests`. `RequestsHub` (`requests_hub.dart`) is the one place a
request changes. It keeps each title's state as `requests.live` streams
it, asks and cancels, holds an admin's answers for the toast's Undo
before sending them, and bumps `requestsVersionProvider`, which every
read that holds a request's state watches, so pages that are covered
fetch again too. A screen follows its titles by wrapping them in
`FollowTitles`. For an admin, the hub also follows
`admin.requests.live`, which the queue, the Add and Decline buttons, and
the count beside "Requests" read.

`Routes.catalog` (`catalog_screen.dart`) is a title the server doesn't
have, laid out like a library title's page, with the state on the
poster. Request asks at once for a movie and opens the request sheet for
a show (`request_sheet.dart`: its seasons, the server's pick ticked, and
"New seasons as they air" on a first request); "Request more" asks for
the seasons left. An admin answering a waiting request gets Add and
Decline in Request's place, and a tap on the badge says who asked. When
the title arrives while the page is open, the library's page replaces
it, and Back goes where the catalog's page would have:
to Explore, Home, the requests page, or for a link, Home. While the
request sheet or another page is over it, it waits until the person is
back on it (`test/screens/arrival_test.dart`). A request the viewer can't make stays dimmed, and a tap says why. A
first request's toast offers Undo for six seconds.

`Routes.requests()` is what the viewer asked for, In progress or All,
with why a declined title isn't coming. `Routes.requests(list)` is an
admin's queue: Waiting, with Add, Add all, and Decline with a reason and
a note; Needs attention, with Retry and Give up; On the way, with
progress; and Done, a page at a time, where a declined request can be
added after all or allowed again. Each row's menu opens the title, the
request in its connection's own app when the server sends a link
(`remoteUrl`), and what the connection reports about it
(`diagnostics`, in the server's words). A waiting request that could go
to more than one library gets "Goes to" in its menu, and on the
catalog's page "Add to Films" with the libraries beside it, as the web
has them: the choice is kept by request (`RequestsState.moves`) and only
sent with Add, and Add all sends a moved one on its own. An account that
isn't an admin gets its own requests on either route.

## People

`lib/screens/person` is the Kotlin app's person page (`Routes.person`),
which the cast and crew on the title pages and the people in search
open: the photo or the initials, the name, and what TMDB says they're
known for and when they were born and died, else what they do here and
in how many titles; the biography; their titles across the libraries in
the poster grid Browse uses, each with the role; then "Not here yet",
their other titles at TMDB, opening the catalog's page, or the library's
once one is here. Those cards follow `requests.live` for the cards built
around the screen, in blocks of twelve and six blocks at most, since the
stream takes a hundred titles at most, as the Kotlin app follows them.
`FollowWindow` (`lib/screens/requests/follow_window.dart`) does that for
every list that can run past a hundred: this page, My requests, and the
catalog's browse.

## Profile

`lib/screens/profile` is the fifth tab, the Kotlin app's profile: the
account's picture (`Avatar` in `lib/media`, which the tab bar shows too),
name, and since when it's here; for an admin, Requests with how many
need them, opening the waiting list, as the Kotlin app's inbox beside
Settings; favorites, whose heading opens
`Routes.favorites`; "My requests", the latest of everything the person
asked for, each card following its title live, whose heading opens
`Routes.requests()` (`AskedRail` in `lib/screens/requests`, which Home
shows too); the statistics for a range, with watch time per day,
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
tablets: offline mode on top, then Account, Appearance, Playback,
Subtitles, Downloads, and About, then the server in use and the app's
version. Each category opens
`Routes.settingsPage(key)`, and a key it doesn't know opens the first
page. Appearance picks light, dark, or the system's scheme and the theme
preset (`themeStoreProvider`); Playback, on Android only, picks the
engine, mpv or Media3 (`playerEngineProvider`), and keeps the rest of the
player's settings (`playerPrefsProvider`); Subtitles, also Android's,
sets their look over a sample, or follows the system's caption style;
About shows the version, the system, the device, the licenses, the
latest playback report, and the app log. The licenses page
(`licenses_page.dart`) opens the project's own license, the `LICENSE`
beside this README, lays out `NOTICE.md`, and lists what the app is built
from, each opening its license text at `Routes.license(package)`: the
Dart and Flutter packages from `LicenseRegistry`, and from
`lib/core/licenses.dart` what Flutter's NOTICES doesn't know, the font,
the icons, and on Android the native libraries the Gradle build bundles
(libmpv, FFmpeg, Media3, CameraX, WorkManager, ZXing, OkHttp, Kotlin),
with their texts in `assets/licenses`. A test fails when
`android/app/build.gradle.kts` adds a library that list doesn't cover.
The rows (`Panel`, `LinkRow`, `SwitchRow`, `ValueRow`, `PickerRow`) are in
`settings_rows.dart`. Signing out and switching server or account are on
the profile. An admin also gets the Administration section, which
[Admin pages](#admin-pages) covers.

### Account

Account (`account_page.dart`) is there while signed in, not offline,
since everything on it asks the server. It opens linking a device, then
lists the account's sessions (`accountSessionsProvider`), each with what
it runs on, its name, and when it signed in, the server's own words for
all three: the device's name or the browser the server read, else the
kind of app (`devices.dart`). This device is marked and can't be signed
out here, which the profile does; any other signs out with
`DELETE /account/sessions/{id}`. Back from linking a device, the list
loads again, and once more after `devicePoll`, a little longer than a
device takes to poll for its session.

### The app log

About ends with the app's log, as the Kotlin app's: Show, Copy, and
Share, each reading it afresh (`app_log_section.dart`). It's this
process's latest lines in logcat (`SystemApi.readLog` in
`pigeons/system.dart`, which runs `logcat --pid` as the Kotlin app did),
so it has what Flutter writes there, under the tag `flutter`, and what the
players and Android log for the app. `lib/core/app_log.dart` is the
Kotlin app's `AppLog.kt` in Dart: it keeps the latest 500 lines within
60,000 characters and scrubs each one of the server's host, the account's
names and id, URLs, hosts, addresses, paths, file names, quoted text,
ids, and tokens, with the Kotlin app's tests in
`test/core/app_log_test.dart`. Nothing is sent anywhere unless the person
shares it.

Flutter's own errors reach logcat already: a widget's error through
`FlutterError`'s default handler, and an uncaught one from the engine.
`logWarning` writes the app's own warnings, as the Kotlin app's `Log.w`
did, and a server answer that doesn't parse is logged from
`serverQuery`, as the Kotlin app logged it.

### Linking a device

`Routes.linkDevice` (`link_device.dart`) signs in a TV or another app as
this account, as the Kotlin app's `LinkDeviceScreen` and the web's /link
page: the camera reads the QR code the device shows, or the person types
its code, then the page shows the device the server names for that code
(`GET /auth/device/{userCode}`) and approves it. A code the server doesn't
know says so, and when the QR code named another server, which one. A
device without a camera, like a TV, only gets the field.

The camera is `pigeons/scanner.dart`, behind `qrScannerProvider`
(`lib/core/qr_scanner.dart`), which tests replace. `ScannerBridge.kt`
binds CameraX to the activity, puts the back camera's picture in a
Flutter texture (`SurfaceProducer`), and reads each frame for a QR code
with ZXing, the same libraries and versions as the Kotlin app. It says
how many quarter turns stand the picture upright, and the page starts it
again when the screen turns. The camera permission is asked when the page
opens and once more from its button; after the second no, Android won't
ask again, so the button opens the app's page in the system settings, and
the page checks again on coming back. The manifest asks for the camera
without requiring one.

## Admin pages

`lib/screens/settings/admin` is the Kotlin app's admin settings for
phones and tablets. The Administration section shows on the first page of
Settings only when the signed-in account is an admin (`canAdminister`),
and each page sits behind `AdminGate`, so a plain account that opens an
admin key gets the first page. Its categories (`AdminCategory`) open at
`Routes.settingsPage(key)`:

- Libraries: each library with its titles and what the server is doing
  to it, asking again every two seconds while a scan or a fetch runs.
  A tap scans it, fetches its metadata again, edits it, or removes it.
  The editor is `Routes.libraryEditor([id])`, and its folders come from
  `Routes.folderPicker`, which takes a `FolderPickerRequest` and pops
  the folder it adds.
- Users: the accounts, with role, sign-out everywhere, and deletion, and
  the invite links. The access page, `Routes.userAccess(id)`, sets an
  account's groups and the limits it overrides. The server has no way to
  create an account directly, so new people come in through an invite.
- Authentication: passkeys and the OpenID Connect provider.
- Transcoding, Trickplay, and Branding: the server's settings for each.
- Jobs: the queues and tasks, asked again every two seconds through
  `serverPoll`, since `admin.jobs.get` isn't a live stream. A queue
  pauses, resumes, or clears; a task runs or stops; and each queue that
  sends a `concurrencyNote` gets a concurrency stepper.

A page whose fields go together is a `SaveBarPage`: the kit's `SaveBar`
shows under the list while there are edits, and Back shakes it instead of
leaving. The page checks nothing the contract checks. On a save the
server's validation issues come back by field (`fieldErrors` in
`lib/core/field_errors.dart`) and show under their fields, and the bar
keeps the failure until the next try. Anything that can't be taken back
asks first: removing a library, deleting an account, stepping down,
ending an account's sessions, revoking an invite, and clearing a queue.

The tests in `test/screens/admin_test.dart` run against the fake server in
`admin_backend.dart`. Try a change by hand only against a throwaway
server, since these pages change the one they're signed in to.

## Downloads

Downloads work on Android phones and tablets, as in the Kotlin app: the
download sheet from a file's menu or page, the files sheet for a show or
a season, the Downloads tab and a show's page of episodes, playback
without the server, offline mode, and Settings, Downloads. A TV has no
downloads.

The fetching is native. `pigeons/downloads.dart` declares the channel
(`just flutter pigeon` writes both ends), and `lib/downloads` is the Dart
side: `Downloads` follows the platform's list and tells it what to do,
`DownloadMeta` is what Dart keeps with each entry (the item, its audio
tracks, the subtitles picked), and the platform hands it back as it was.
The Kotlin side in `android/app/src/main/kotlin/.../downloads/` keeps the
list as JSON in `filesDir/offline`, with each file in a folder of its
own, and runs one WorkManager job per download (`DownloadWorker`). That
keeps a download going with the app closed, picks it up again after the
network drops or the device reboots, and shows its progress as a
notification. A version made for this device comes from the server in
segments, each added to the end of one mp4; the file as it is comes by byte
ranges. The tokens the jobs send are sealed with a key in the Android
Keystore. `just flutter android-test` runs the worker's JVM tests.

Each download belongs to the saved server it came from, by its origin,
and shows, plays, and syncs only with that one. Removing a server
removes its downloads. The server decides what a download holds
(`downloads.resolve`); the app picks the tracks only for a download
playing without a server (`download_tracks.dart`), as the Kotlin app's
`DownloadTracks.kt`.

`Routes.play` plays a finished download from the device
(`offline_playback_screen.dart`, `offline_session.dart`), online or not,
and starts a stream otherwise. Where the person got to goes to the
server, or, while it's out of reach, to `PendingProgress`, which sends
it, with each sitting for the statistics, once the server answers again.

A download plays with the stream's controls (`PlaybackControls` over
`PlayerSitting`, which both sessions implement), so it has the same
gestures and their notes, lock, buttons from Settings, picture in
picture, media session and notification, remote, keyboard, and headset
keys, subtitle look, and playback report, its attempts marked `local`.
The system's controls show the server's artwork only while the
download's server is the one in use. What needs the server stays out: a
download has no quality menu, no trickplay frames on the seek bar or
under a swipe, and no skip segments. The episodes either side and the
next one come from the server while it answers, and the next one only at
the end, without the server's `upNextAt`. As in the Kotlin app, a
download whose picture freezes gets one seek in place before it fails,
which `Media3Engine` makes itself for a file on the device; mpv has no
freeze watch. That mp4 of segments says nothing of where they start,
which Media3 takes as a file it can't seek, so every seek and resume
would start over; `FragmentIndex.kt` reads the fragments' headers for
it. mpv finds them itself.

In offline mode, from Settings or from Watch downloads on the
unreachable screen, the tabs are Home, Downloads, and Profile. Home
(`offline_home.dart`) lays the downloads out in Home's rows: Continue
watching and Next up start from what the server last sent, which online
Home saves (`HomeSnapshot`), then what was started offline since; then
the movies and the shows.

## TV

On a TV (`Device.isTv`, Leanback) the router takes `_tvRoutes()`, ported
from the Kotlin app's `ui/tv` and `ui/player/tv`. A remote drives all of
it: the D-pad moves focus, Select presses, Back goes back. `main.dart`
sets `FocusHighlightStrategy.alwaysTraditional`, so focus shows before the
first key.

- Frame (`lib/screens/tv/tv_shell.dart`): the drawer at the left, the
  clock at the top right, and each page in a `TvPageFrame`. Back from a
  page opens the drawer; from the drawer on Home, it leaves.
- Signing in (`lib/screens/sign_in/tv`): the address is typed in a
  `TvTextField`, a list row's size that Up and Down leave, as the Kotlin
  app's. The code screen differs from the Kotlin app's on purpose: on the
  left only the title, one sentence with the link page's address, and the
  code with its waiting line; the QR code alone on the right; and Change
  server, or Back to the server in use, as a small `TvAuthAction` at the
  bottom left, beside Get a new code or Retry when the code ran out or
  never came. It says nothing of the phone app's Settings.
- Settings (`lib/screens/tv/tv_settings.dart`): also spaced apart from
  the Kotlin app on purpose. The categories' highlight starts at
  `TvPage.start`, where every page's cards and chips do, clear of the
  drawer's focus ring, not a list item's inset further left against the
  cog. The column is 224 wide, room for the German names, and 32 before
  the rows, so the rows start a little earlier than Kotlin's.
- Focus (`lib/kit/tv`): `TvTraversalPolicy` moves by geometry, as Compose
  does. A `TvFocusMemory` remembers each row's card, so entering a row
  lands on it, Back lands where you left, and a list that loads again
  keeps focus. Rows, grids, and lists scroll to follow focus
  (`TvFollowFocus`).
- Panels (`showTvPanel`, `showTvPicker`): choices open at the right
  edge, Back closes them, and focus goes back to the row that opened
  them. The TV's server switcher (`sign_in/tv/tv_servers.dart`) is one
  of these, in place of the phone's sheet.
- Screens (`lib/screens/tv`): Home; Movies, Shows, Browse, Favorites, and
  Search; the title, season, episode, and person pages; Profile with its
  charts and standing, and Recently watched; and Settings, whose
  categories sit at the left and whose rows are on the right. Its
  Playback and Subtitles rows set the same `PlayerPrefs` as the phone's
  pages, and About shows the playback report. Left or
  Back comes out of the rows. `/settings/:page` opens on a category by
  the Kotlin app's key.
- Player (`lib/player/tv`): the phone's `PlaybackSession`, set up the
  same way (`createPlaybackSession`, `PlaybackHost`), with the TV's
  controls. The parts both players use are in `player/player_parts.dart`
  and `player/subtitle_look.dart`: the failure and notice text, the menu
  entries, the next episode's countdown, the speed kept across a new
  source, the media session, and the subtitle layer. With the controls
  away, Left and Right skip by the server's skip lengths and glide while
  held (`KeySeek`), with trickplay frames over the time, and Select, Up,
  or Down bring them back. The TV has one key handler; it never builds
  the phone's controls. Audio, subtitles, and settings (quality, speed,
  Fit or Fill, which is kept) open as panels. Skip intro and the next
  episode wait alone on the picture. Once the file ends, the next episode
  starts unless autoplay is off in Settings or Back stopped it. With Match
  frame rate on, the screen switches to a refresh rate that plays the
  server's frame rate evenly, through `pigeons/display.dart`;
  `TvDisplayMatch` hands the mode to the next episode, so the same rate
  asks nothing of the screen. The controls hide after 3.5 s, as the
  phone's do.

`test/screens/tv` and `test/player/tv_playback_test.dart` send key events
and check where focus lands. Their goldens are taken at 960 by 540, the
size the Kotlin app laid out for, and at 1920 by 1080, with the app's
font.

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
picture), `RoundIconButton`, `Checkbox`, `RadioRow`, `ChoiceChip`, `ToggleChip`, `Dialog`, `ConfirmDialog`,
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

GPL-3.0, in `LICENSE`, like the native apps it replaces, since it
bundles libmpv and a GPL build of FFmpeg.
