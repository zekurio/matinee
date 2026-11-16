# Matinee for Apple TV

The Apple TV app, on tvOS 18 or later: the `MatineeTV` target in
`apps/ios/project.yml`, beside the iPhone and iPad app. It follows Android
TV's screens (`apps/android/.../ui/tv/`, and `apps/android/README.md`,
"Android TV"), drawn with MatineeKit's TV components
(`Packages/MatineeKit/README.md`, "TV"), over the same MatineeCore as the
iPhone app. Read the kit's TV section first; this builds on it.

It has the shell (drawer, clock, navigation, Menu, toasts, the actions
panel), everything before sign-in, and every page Android TV has; "What's
left" lists what remains.

## What's where

| Path                   | What it is                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `MatineeTVApp.swift`   | Entry point: the session, the theme, the toasts; `-gallery YES` opens the kit's TV gallery |
| `TVDevLaunch.swift`    | Debug-only `-dev.server`, `-dev.token`, `-dev.route`                                       |
| `Info.plist`           | Written by hand (not by XcodeGen), with `UIUserInterfaceStyle` Automatic                   |
| `Resources/`           | Info.plist words in English and German; `TVAppIcon.xcassets` from `scripts/tvicon.sh`      |
| `UI/TVRoot.swift`      | `TvRoot.kt`: connect, connecting, unreachable, sign-in, or the app; the one toast host     |
| `UI/TVShell.swift`     | `TvApp.kt`: the signed-in app, drawer, clock, pages, player cover, `\.user`                |
| `UI/TVNav.swift`       | The routes, `TVNav`, the `Navigator` for a TV, `TVRouteScreen`, `TVRoutePath`              |
| `UI/TVActions.swift`   | `ActionsPanel.kt`: a card's actions panel, the watched question, Play/Pause                |
| `UI/TVPageFocus.swift` | `.tvPageFocus`: first focus on every page                                                  |
| `UI/TVArt.swift`       | `TVLogo` and `TVAvatar`, over the shared `Picture`                                         |
| `UI/auth/`             | `ui/tv/auth/`: the frame, connect and discovery, address, sign-in by code, servers panel   |
| `UI/home/`             | `ui/tv/home/`: Home, its rows, and what the header says                                    |
| `UI/detail/`           | `ui/tv/detail/`: the title, season, episode, and person pages, their header and rows       |
| `Remote/remote.sh`     | Drives the app with the Siri Remote and takes screenshots                                  |

## What it shares with the iPhone app

All logic is MatineeCore's and all look is MatineeKit's, as for the iPhone
app. The app-level pieces that aren't in a package are compiled into both
targets from where they are: `project.yml` lists them one by one under
`MatineeTV`'s sources. Nothing is copied, so the generated words, the
loading helpers, and the artwork pipeline can't drift apart between the
apps.

| Shared file                                                | What the TV takes from it                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Matinee/UI/Strings.gen.swift`                             | `Str`, every word, from Android's strings (TV strings included)                |
| `Matinee/Resources/Localizable.xcstrings`, `iOS.xcstrings` | The catalogs `Str` reads                                                       |
| `Matinee/Resources/Assets.xcassets`                        | The logo and mark, and the launch color                                        |
| `Matinee/UI/State.swift`                                   | `.loads`, `describeFailure`, `\.api`                                           |
| `Matinee/UI/Format.swift`                                  | Names, numbers, and dates in the app's language                                |
| `Matinee/UI/ThemeStore.swift`                              | The mode and the server's accents                                              |
| `Matinee/UI/Navigator.swift`                               | `Navigator`, which `TVNav.navigator` fills in                                  |
| `Matinee/UI/components/Toasts.swift`                       | `Snackbar`, `launchShowing`                                                    |
| `Matinee/UI/components/Picture.swift`                      | `Picture` over Nuke with the blur hash, the image pipeline, `Logo`, `LogoMark` |
| `Matinee/UI/components/QrCode.swift`                       | `QrCode`, the sign-in QR                                                       |
| `Matinee/UI/signin/SignInState.swift`                      | `ServerConnect`, `DeviceCodeState`, `unreachableMessage`                       |
| `Matinee/UI/signin/LoginBackdrop.swift`                    | The server's login backdrop behind sign-in                                     |
| `Matinee/UI/home/HomeDevData.swift`                        | `-dev.art` and `-dev.recommendations`                                          |
| `Matinee/UI/title/TitleData.swift`                         | The detail pages' facts, file info, season loads, and `-title.fixture`         |
| `Matinee/UI/player/PlayerWords.swift`                      | Refusal, notice, and skip-button wording                                       |
| `Matinee/UI/player/PlayerSubtitles.swift`                  | Subtitle lines, also used by Settings                                          |
| `Matinee/UI/player/PlayerTrickplay.swift`                  | Trickplay frame and tile cache, sized by each player                           |
| `Matinee/UI/player/PlayerLayer.swift`                      | AVPlayer layer and surface, without picture in picture or AirPlay              |
| `Matinee/UI/player/PlayerMenuEntries.swift`                | Menu choices and track, quality, and speed labels                              |
| `Matinee/UI/browse/BrowseFixtures.swift`                   | `-dev.browseFixtures`, the fixture people the cast cards open                  |

Why sharing by file and not a package: these depend on the app's
generated strings and on each other, and moving them into a package would
move files the iPhone screens are being rebuilt around. Listing them keeps
them where they are.

What that asks of everyone:

- A shared file builds for both. A change to one is checked with
  `just build` and `just tv-build`. Something in it only one platform has
  goes under `#if os(iOS)` or `#if os(tvOS)`, as narrowly as it can.
- Sharing another file is one line in `project.yml`. Share a file only
  when everything it uses is already shared or in a package; a phone file
  that reaches for a phone component (`ShellTab`'s pages, `Downloads`,
  sheets) stays phone-only.
- Two names are defined once per target, on purpose, so shared code reads
  them the same way: `ShellTab` (the phone's tabs; on a TV only
  `Navigator` uses it, see `TVNav.swift`) and `EnvironmentValues.user`
  (`Shell.swift` on the phone, `TVShell.swift` here).
- `TVDevLaunch.swift` repeats the iPhone's `DevLaunch.prepare`, which
  can't be shared because its route opener is the phone's.

## A TV page

```swift
/// TvKind.kt: every movie or every show, in a grid.
struct TVKindScreen: View {
  let kind: String
  @State private var titles = Loader<BrowsedTitles>()
  @State private var memory = TVFocusMemory()
  @FocusState private var retryFocused: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions

  var body: some View {
    Group {
      switch titles.state {
      case .loading: TVLoadingRow().frame(maxHeight: .infinity)
      case .failed(let message, _):
        TVMessage(Str.tvGridFailed, message: message,
          action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: titles.reload),
          actionFocus: $retryFocused)
        .tvPageFocus($retryFocused)
      case .ready(let page):
        TVPosterGrid(page.items, itemKey: \.id, memory: memory) { title in
          TVPosterCard(title.name, width: nil, action: { nav.title(title) },
            onLongPress: { actions?.open(.title(title)) }) { Picture(api?.art(title.images.poster)) }
        } header: { … }
        .tvPageFocus(memory) { page.items.first.map { (TVGrid.row, $0.id) } }
      }
    }
    .ignoresSafeArea()
    .loads(titles) { [kind] api in try await api.titles.browse(kind: kind, limit: 60) }
  }
}
```

1. **One file per Android file**, in the folder Android uses (`UI/detail/`,
   `UI/browse/`, ...), named as the type `TVRouteScreen` already calls.
   Start it with a comment naming the Kotlin it ports.
2. **Its layout** runs from the screen's edges: `.ignoresSafeArea()` on
   the root, content from `TVPage.start` (clear of the drawer's rail) to
   `TVPage.end`, rows running off the right edge. A page title is
   `.textStyle(.headline)`; there is no top bar, Menu is Back.
3. **Its data** is a MatineeCore `Loader` per load with `.loads`, as on
   the iPhone (`Matinee/UI/README.md`, "A screen, start to finish").
   Decisions go to MatineeCore with tests.
4. **Loading and failing**: `TVLoadingRow` while a page or row has nothing
   yet; `TVRowNotice` in a row's place (its heading, why, Try again), with
   `TVRowNotice.posterHeight` for a row of posters so nothing under it
   moves; `TVMessage` when the page has nothing else, its action bound to
   first focus; a toast through `@Environment(\.snackbar)` or
   `launchShowing(snackbar, failure) { … }` for an action that failed.
5. **Artwork** is the shared `Picture(sources)` inside the kit's cards,
   never the kit's `TVPicture`; `TVLogo` for a title's logo with its
   name as the fallback; `TVBackdrop(sources) { Picture($0, alignment:
   .topTrailing) }` behind a page.
6. **Its actions**: open pages with `@Environment(\.navigator)`; a card
   gets `onLongPress: { actions?.open(target) }` and `onPlayPause`, for
   which `actions?.play(target, …)` resolves a title's next file.

## Focus, Menu, long press

- **First focus.** The focus engine starts at the top left, the drawer,
  and a page pushed while focus is in the drawer doesn't take it. Every
  page says where focus starts with `.tvPageFocus(memory) { fallback }`
  (rows and grids) or `.tvPageFocus($focused)` / `.tvPageFocus($focused,
  on: value)` (anything else). It runs as the page appears and whenever
  the drawer hands focus back (`\.tvPageReturn`). Only the page on screen
  takes it: a page under another on the stack is still alive, and one
  asking for focus from there sends it into the drawer, which hands it
  back again in a loop. A page whose rows load
  waits for them, as Home does, so focus doesn't land in a row that's then
  pushed down.
- **Rows and grids** take a `TVFocusMemory`, so a row remembers its card;
  `TVPinnedRows` scrolls the focused row up under a fixed header.
- **Menu** steps out one layer at a time: a kit panel or dialog closes
  itself; a page's own layer uses `.onTVBack(isActive:)` or
  `.tvBackLayers`; otherwise the stack pops, back to Home. On Home, Menu
  opens the drawer; in the drawer over Home it leaves the app; in the
  drawer over any other page it goes back to the page. Pages from the
  drawer sit on Home, so Menu from Search goes to Home, as on Android TV.
- **Long press of Select** on a card opens its actions panel (Android TV
  uses Menu, which Apple TV keeps for Back). The entries are MatineeCore's
  `cardActions`, so a TV never offers downloads or the admin's items.
- **Play/Pause** on a focused card plays it.
- Focus a page's control programmatically only on appear and on return;
  never move focus while the person is moving it.

## Running it

From `apps/ios`, with `just` (or `nix shell nixpkgs#just -c just …`):

| Recipe                                | What it does                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `just tv-build`                       | Builds the TV app for any tvOS simulator into `build/TVDerivedData/`            |
| `just tv-run`                         | Builds signed ad hoc, installs, and opens it on `MATINEE_TV_SIMULATOR`          |
| `just tv-dev [account] [args]`        | The same, signed in to the dev server (`DEV.md`) as `ios-admin` or `ios-viewer` |
| `just tv-shot <name>`                 | Saves the simulator's screen as `build/tv-screenshots/<name>.png`               |
| `just tv-remote-dev [account] [args]` | Starts a remote session signed in to the dev server                             |
| `just tv-remote send "<steps>"`       | Presses the remote in that session; `install`, `stop`, `run` too                |
| `just tv-boundary`                    | The kit's TV boundary test over `MatineeTV/`, also part of `just test`          |
| `just tv-icons`                       | Draws the icon and Top Shelf image again from `brand/`                          |

`MATINEE_TV_SIMULATOR` defaults to "Apple TV 4K (4th generation)";
`MATINEE_TV_DERIVED_DATA` to `build/TVDerivedData`. Use one Apple TV
simulator at a time and shut it down when you're done
(`xcrun simctl shutdown "Apple TV 4K (4th generation)"`).

Launch arguments (debug builds): `-dev.server URL -dev.token TOKEN`,
`-dev.route PATH` (`title/<id>`, `season/<id>/<n>`, `episode/<id>`,
`person/<name>`, `genre/<name>`, `studio/<name>`, `search`, `favorites`,
`movies`, `shows`, `profile`, `recent`, `settings`, `settings/<key>`,
`player/<id>?start=30`; `TVRoutePath` in `UI/TVNav.swift`),
`-dev.art YES`, `-dev.recommendations YES`, `-theme.mode light|dark`,
`-AppleLanguages "(de)"`, and `-gallery YES` with the kit gallery's
`-page`, `-scheme`, `-open`.

### Driving the remote and taking screenshots

`xcrun simctl` can't press the Siri Remote, so a UI test does:
`MatineeTVRemote` runs the kit gallery's `RemoteScript.swift` against this
app, through `XCUIRemote` and the real focus engine.

```sh
just tv-remote-dev ios-admin -AppleLanguages "(en)" -dev.recommendations YES -dev.art YES
just tv-remote send "down right shot:home-row2 hold:select:1.2 shot:actions menu menu shot:drawer"
just tv-remote install          # rebuild the app; the session stays
just tv-remote send "relaunch:-dev.recommendations+YES+-theme.mode+light shot:light"
just tv-remote stop
```

Steps: `up down left right select menu playpause home`, `*n` to repeat,
`hold:<button>:<seconds>`, `wait:<seconds>`, `shot:<name>` (saved in
`build/tv-screenshots/`), `type:<text>` into the system keyboard while
it's up, and `relaunch:<arguments, + for spaces>`. The simulator is slow
under load: give a step that opens something a `wait:` before its shot.
To sign in by code for real, launch with `-dev.server
http://localhost:18420` and no token, read the code from a shot, and run
`scripts/dev/approve <CODE> ios-admin`. The touch surface's swipes can
only be tried by hand, in the Simulator's Apple TV Remote window.

## Local server discovery

The connect screen lists the servers that answer MatineeCore's
`scanForServers` (`Auth/ServerDiscovery.swift`, the protocol in
`apps/server/README.md`, "Local server discovery"): three three-second
scans, BSD sockets broadcasting to every interface and
`255.255.255.255`. Network.framework can't send to a broadcast address,
and Apple's TN3179 points broadcasts at BSD sockets.

tvOS has no local network privacy (TN3179's table) and no multicast
entitlement (Apple lists `com.apple.developer.networking.multicast` for
iOS, iPadOS, and visionOS only), so a TV broadcasts without asking and
there is nothing to request from Apple for it. `NSLocalNetworkUsageDescription`
is in `Info.plist` for the day tvOS adds the prompt. If a scan can't send
at all (`DiscoveryEvent.unavailable`), the screen drops the "On this
network" section and offers typing the address. The simulator sends
through the Mac, and the dev server advertises nothing (its `PUBLIC_URL`
is loopback), so discovery finding a server has only been tested by
MatineeCore's loopback test, never on a real network.

## Icon and Top Shelf image

`scripts/tvicon.sh` draws `Resources/TVAppIcon.xcassets` from the mark's
paths and colors in `brand/`: a three-layer image stack (dusk sky at the
back, the sun's dome in the middle, the horizon bands in front, so the sun
moves behind the horizon as the icon tilts) at 400×240 @1x/@2x and
1280×768 for the App Store, and the Top Shelf images (1920×720 and the
wide 2320×720, @1x/@2x), which are the logo on the same sky. It's a
placeholder by the brand's rules: `brand/` has no tvOS artwork, so these
should move to `brand/tvos/` and `brand/render.sh` once someone owning the
brand signs off on the layering.

## Top Shelf content

Android TV's Watch Next row has an Apple TV counterpart: a Top Shelf
extension (`TVTopShelfContentProvider`) that shows Continue watching and
Next up when Matinee sits in the top row. It would need a `tv-app-extension`
target in `project.yml` embedded in `MatineeTV`, an App Group shared by the
app and the extension so the extension can read the server and the
session (the token is in the Keychain, so a shared Keychain access group
too), MatineeCore's API client in the extension, artwork URLs it can load
without the app's pipeline (signed with the token, or a short-lived URL
from the server), and deep links (`matinee://title/<id>`, a URL scheme the
TV app handles by opening `TVRoutePath`). None of it exists yet.

## What's left

Every route has its page: Home, the detail pages (`UI/detail/`), the grids,
favourites, and search (`UI/browse/`), the profile (`UI/profile/`), Settings
(`UI/settings/`), and the player (`UI/player/`). Still to do:

- Top Shelf content (below).
- Nothing has run on an Apple TV: remote swipes, display matching, the
  screen saver, and local discovery have only been built, not tried.

## Off limits

- Stock controls and phone components in a TV screen: `just tv-boundary`
  fails on them. If the kit lacks something, add it to the kit's `TV`
  folder, with its gallery page and README.
- The kit's `TVPicture` for server artwork; it doesn't sign requests or cache.
- Downloads, offline mode, browser sign-in, camera linking, admin pages,
  the image editor, picture in picture: `ClientCapabilities` leaves them
  out of a TV, and nothing here should lead to them.
- Deciding what the server decides (AGENTS.md, "Boundaries").
- Editing the iPhone app's files to suit the TV beyond the narrowest
  `#if os(...)`, or the generated strings and catalogs by hand. A string
  the TV needs that Android lacks: the nearest `Str` accessor with
  `// TODO(strings): <android key or proposed text>`.
