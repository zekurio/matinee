# Matinee for iOS: build plan

A working document for the agents building the app. It gets replaced by
`README.md` when the app is done. Read `AGENTS.md` at the repository root
and `apps/android/README.md` first.

## Goal

A native iPhone and iPad app that does everything the Android phone app
does, looks like it, and behaves like it. The Android app under
`apps/android` is the specification: port each screen and each piece of
logic from its Kotlin, and keep its file and type names where Swift allows,
so the two apps can be read side by side.

Out of scope for now: tvOS. Nothing under `ui/tv/`, `ui/player/tv/`, or
`launcher/` is ported. Keep TV out of the shared code's way, but don't
build for it.

## Decisions

- Swift 6 language mode, SwiftUI, iOS 18.0 minimum, iPhone and iPad.
  Observation (`@Observable`) for state, structured concurrency, no Combine
  unless an Apple API forces it.
- Bundle id `io.github.zekurio.matinee`. URL scheme `matinee`, so browser
  sign-in returns to `matinee://auth/callback` as on Android.
- The Xcode project is generated: `apps/ios/project.yml` is an XcodeGen
  spec, `Matinee.xcodeproj` is git-ignored. Run XcodeGen with
  `nix run nixpkgs#xcodegen -- generate` in `apps/ios`. Sources are picked
  up by folder, so adding a file never edits the spec.
- The version comes from the root `package.json`, as everywhere else.
- Two layers:
  - `apps/ios/Packages/MatineeCore`: a Swift package with everything that
    isn't a view. It builds and tests on macOS too (`swift build`,
    `swift test` in that folder), so most logic is checked without a
    simulator. Platforms: iOS 18, macOS 15.
  - `apps/ios/Matinee`: the app target. SwiftUI views, the app's entry
    point, assets, and the few things that need UIKit.
- Third-party code stays small. Allowed where they earn it: an image
  pipeline (Nuke) and, in a later step, MPVKit for the mpv engine. Ask in
  your report before adding anything else.
- Player: AVPlayer first, with our own SwiftUI controls and our own
  WebVTT subtitle rendering, as Android does. The mpv engine follows as a
  second engine behind the same controller interface.
- The server decides (see Boundaries in `AGENTS.md`). The iOS app sends a
  `PlaybackDevice` that says what AVPlayer plays and shows what
  `playback.start` answers. Don't port a rule into Swift that the server
  already answers.

## Layout

```
apps/ios/
  project.yml
  Matinee/
    MatineeApp.swift
    Resources/          Assets.xcassets (lucide icons, logo, app icon),
                        the Red Hat Text font, Localizable.xcstrings
    UI/                 mirrors apps/android/.../ui/
      Root.swift Shell.swift Nav.swift State.swift Bars.swift Motion.swift
      Format.swift Navigator.swift Strings.gen.swift
      theme/ components/ signin/ home/ browse/ search/ media/ title/
      metadata/ player/ downloads/ profile/ settings/ settings/admin/
      gallery/          debug builds only: every component on the theme
  Packages/MatineeCore/
    Sources/MatineeCore/
      Api/              ContractModels.swift, ContractApi.swift (generated),
                        ApiTransport, Paths, Extensions, PlaybackDevice, Saved
      Auth/             Session, SessionStore, BrowserSignIn, DeviceCodes,
                        ServerDiscovery
      Downloads/        Downloads, the background fetcher, Offline,
                        PendingProgress
      Player/           Playback, Capabilities, Cues, DownloadTracks, Seek,
                        PlayerPrefs, SubtitleStyle, PlaybackDiagnostics
      State/            Load, Loader, Marks, ViewerState
      Format/           Format, WatchedAt, AppLog redaction
      Images/           ImageSource, the API's art URLs, BlurHash
    Tests/MatineeCoreTests/   the Android unit tests, ported
  scripts/
    strings.py          Android's strings.xml files -> Localizable.xcstrings
                        and UI/Strings.gen.swift
    lucide.py           lucide icons -> Assets.xcassets
    themes.mjs          the web's palettes -> UI/theme/ThemePresets.swift
    version.sh, appicon.sh   run by XcodeGen before it generates
```

## What Android does and what iOS uses for it

| Android                           | iOS                                                           |
| --------------------------------- | ------------------------------------------------------------- |
| OkHttp, kotlinx.serialization     | URLSession, Codable                                           |
| Generated `ContractModels/Api.kt` | Generated `ContractModels/Api.swift`, `pnpm api:ios`          |
| Keystore-encrypted preferences    | Keychain for tokens, UserDefaults for the rest                |
| Custom Tab + `matinee://` intent  | `ASWebAuthenticationSession`                                  |
| `ACCESS_LOCAL_NETWORK`            | `NSLocalNetworkUsageDescription`, `NSBonjourServices` if used |
| Compose Navigation, `Navigator`   | `NavigationStack` with a typed route enum                     |
| Coil                              | Nuke, with the session's auth header                          |
| ExoPlayer / Media3                | AVPlayer, AVKit for picture in picture                        |
| `PlaybackService`, media session  | `MPNowPlayingInfoCenter`, `MPRemoteCommandCenter`             |
| WorkManager downloads             | A background `URLSession`                                     |
| System caption style              | MediaAccessibility (`MACaptionAppearance`)                    |
| CameraX + ZXing                   | AVFoundation capture or VisionKit; CoreImage draws QR codes   |
| Per-app language                  | iOS's per-app language setting, from the string catalog       |
| logcat for the app log            | `OSLogStore` for this process                                 |
| `strings.xml`, `values-de`        | `Localizable.xcstrings`, generated from Android's files       |
| Vector drawables from lucide      | SVG template images in the asset catalog                      |

Where iOS has a platform convention that differs from Android's (the back
swipe, sheets with detents, context menus on a long press, the share
sheet, Dynamic Type, safe areas), follow iOS, and keep the content, the
order, and the words the same.

## Rules for every agent

- Stay inside the folders your task names. Shared files (`project.yml`,
  `Nav.swift`, `Strings.gen.swift`, the plan) change only when your task
  says so. Report what else you'd have changed.
- Never edit generated files. Change the generator and run it.
- Text the user reads comes from the string catalog through the generated
  accessors, in English and German, with Android's keys.
- Comments say why, in plain sentences, as the Kotlin's do. No banner
  comments, no restating the code.
- Core code gets unit tests (Swift Testing). Port the Android test that
  covers the Kotlin you port.
- The flake's dev shell is Linux-only. On this Mac, Node and pnpm come
  from `nix shell nixpkgs#nodejs_24 nixpkgs#pnpm_11 -c <cmd>`.
- Build before you report: `swift build && swift test` for the package,
  `xcodebuild` for the app. UI work is checked on a simulator, with
  screenshots, against the dev server in `DEV.md`.
- Commit on your own branch with conventional commit messages
  (`feat(ios): ...`). Don't push and don't open a pull request. End your
  report with the branch, the commits, what you verified and how, and
  what's left or doubtful.

## Conventions

What the skeleton and the shell set up, and how every screen uses it. The
gallery (`Matinee/UI/gallery/`, in debug builds with `-gallery YES`) shows
each piece on the theme; open it with `just ios gallery`.

### Building and checking

- `just ios generate` writes `Matinee.xcodeproj` (git-ignored) and, before
  that, `Config/Version.xcconfig` from the root `package.json` and
  `Resources/AppIcon.xcassets` from `brand/ios`, both git-ignored.
- `just ios build` (simulator in `MATINEE_SIMULATOR`, default `iPhone 17`)
  builds into `apps/ios/build/`. Keep `-derivedDataPath` under your own
  checkout when you call `xcodebuild` yourself. No warnings from our code.
- `just ios test` runs MatineeCore's tests on the Mac and checks that the
  strings, icons, and palettes are current.
- `just ios dev [ios-admin|ios-viewer] [launch arguments]` builds, installs,
  and opens the app signed in to the dev server (DEV.md) as that account,
  for instance `just ios dev ios-viewer -dev.route title/<id>`.

### Launch arguments

Debug builds only; `DevLaunch.swift` reads them and release builds don't
compile it. Pass them after `just ios run`, `just ios dev`, or
`xcrun simctl launch <udid> io.github.zekurio.matinee`.

| Argument                                                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-dev.server URL -dev.token TOKEN`                                          | Signed in to URL with TOKEN, without the flow (`scripts/dev/token ios-admin` prints one). The token goes where a sign-in puts it, the server's Keychain item, before the session starts, and the session checks it with the server as at every launch, so it stays signed in after a launch without the arguments.                                                                                                                                                                                                                                        |
| `-dev.route PATH`                                                           | Opens a page at launch: a tab (`home`, `media`, `downloads`, `profile`, `search`) or a page on one (`title/<id>`, `season/<titleId>/<n>`, `episode/<id>`, `person/<name>`, `genre/<name>`, `studio/<name>`, `library/<id>?sort=<sort>`, `favorites`, `recent`, `settings`, `settings/<page key>`, `link-device`, `downloads/<titleId>`, `identify/<titleId>`, `images/<titleId>[/<season>[/<episode>]]`, `library-editor[/<id>]`, `folder-picker?start=<path>&added=<a,b>`), or the player (`player/<itemId>?start=<seconds>`). `RoutePath` in Nav.swift. |
| `-dev.offline YES`                                                          | Offline mode on, as Settings' switch, once the account is known; `NO` turns it off. It holds across launches, as the switch does.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `-theme.mode dark`                                                          | `system`, `light`, or `dark` (ThemeStore's own key).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `-AppleLanguages "(de)"`                                                    | The app in German, iOS's own argument.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityL` | A Dynamic Type size, iOS's own argument.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `-gallery YES`                                                              | The gallery instead of the app, with its own `-gallery.*` arguments (Gallery.swift).                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

A saved page comes back at launch only after the app went to the
background first, as iOS keeps scene state; `simctl launch
--terminate-running-process` alone starts afresh.

- The app target is Swift 6 with the main actor as default isolation.
  Views and their state need no annotations; pure helpers that run
  anywhere are `nonisolated`, as in `Format.swift`.

### Adding a screen

1. Put it in the folder Android has it in: `HomeScreen.kt` is
   `Matinee/UI/home/HomeScreen.swift`, with the same type and function
   names. The folder is picked up by the spec; don't edit `project.yml`.
2. Read what it needs from the environment, never globals:
   `@Environment(\.palette)`, `@Environment(\.api)` (nil until signed in),
   `@Environment(ViewerState.self) private var viewer: ViewerState?`,
   `@Environment(\.navigator)` to open other pages, `@Environment(\.offline)`,
   `@Environment(\.snackbar)`, `@Environment(\.user)` (the signed-in
   `User`, Android's `LocalUser`), `@Environment(MatineeSession.self)` where
   Android passes the `Session` (settings, profile), `@Environment(Downloads.self)`
   for the downloads (`Packages/MatineeCore/DOWNLOADS.md`), and
   `@Environment(\.imagePipeline)`, which the root keeps signed in.
   The page's type and parameters are its stub's (see Screens below);
   replace the stub's body, and don't edit `Nav.swift`, `Shell.swift`, or
   `Root.swift`.
3. Load with a `Loader` in `@State` and `.loads(loader) { api in … }`
   (`UI/State.swift` has the pattern). It fetches on first showing, again
   when the viewer's marks change and when the page comes back after 30 s,
   and keeps what showed while it refreshes. Switch on `loader.state` and
   show `LoadingBox`, `ErrorBox`, `Notice`, `RailSkeleton`, or the content.
   Pure logic goes in MatineeCore with a test, ported from Android's.
4. Lay out with `Gutter` (16) and the components below; text with
   `.textStyle(.titleLarge)` (Android's `MaterialTheme.typography` names),
   never `.font(.title)` or a system font; colors from `palette`, never
   `Color.gray` or `.secondary`. A page opened from a tab sets its bar with
   `.topBar(title) { actions }`; a page over art uses `.itemTopBar(...)`
   and `.statusBarScrim()` on its scroll view. Sheets get `.matineeSheet()`.
5. Animate with `Motion`'s timings through `.motion(_:value:)` or
   `withMotion`, which honor Reduce Motion.
6. Add it to the gallery if it's a component others will use.

### Adding a string

- A word Android has: use it. `stringResource(R.string.home_continue_watching)`
  is `Str.homeContinueWatching`; one with arguments is a function typed by
  its format (`Str.browseRecentlyAdded(name)`, `Str.mediaTimeLeft(12)`), and
  a plural takes its count first (`Str.mediaEpisodeCount(count)`).
- A word both apps need that Android lacks: it belongs in Android's
  `res/values*/strings*.xml`; if your task doesn't cover the Android app,
  put it in `iOS.xcstrings` for now and say so in your report. A word only
  iOS needs: add it to
  `Matinee/Resources/iOS.xcstrings` (English and German, iOS specifiers
  such as `%@` and `%lld`, key prefixed `ios_`), then `just ios strings`.
  Commit the regenerated `Localizable.xcstrings` and `Strings.gen.swift`.
- Words for Info.plist keys are in `Resources/InfoPlist.xcstrings`.
- Dates, numbers, sizes, and durations go through `UI/Format.swift`
  (`formatRuntime`, `formatDay`, `formatBytes`, `formatCount`, …), which use
  `Locale.app`, the app's language.

### Adding an icon

- Add it to the Android app first (`apps/android/scripts/lucide.py` and its
  `Lucide` object in `Picture.kt`), then `just ios icons`. Kotlin's
  `Lucide.ArrowLeft` is `Lucide.arrowLeft`.
- Draw it with `LucideIcon(.arrowLeft, size: 20)`: the foreground color,
  or `tint:`, growing with Dynamic Type; give it `label:` when it's the only
  thing saying what a control does. In a `Label`, a `Menu`, or a toolbar
  button, use `Image(Lucide.arrowLeft)`.
- The logo is `Logo(height:)` and the mark `LogoMark(size:)`, from `brand/`
  through the same script.

### Components

`UI/components/` (Android's file in brackets):

- Pictures [Picture.kt]: `Picture([ImageSource])`, the first that loads over
  its blur hash, fading in, nothing when all fail; `api.art(_:size:)`,
  `api.frame(_:)`, `api.landscape(_:)` (MatineeCore); `Tone(key)` for missing
  art; `LucideIcon`; `Logo`, `LogoMark`. Images load through
  `\.imagePipeline`; the root sets `ImagePipeline.matinee(headers:)` with
  the session's `Authorization` once it has one.
- Cards [Cards.kt]: `EpisodeCard(item, showName:)`, `PosterCard(title,
  detail:, poster:, onTap:)`, `PosterArt(name:, poster:, watched:)`,
  `ShelfCard(entry)` and `shelfCardModel(entry)`, `PersonCard(name, role:,
  photo:)`, `EpisodeRow(item)`, `ArtFrame`, `CardText`, `PlayGlyph`;
  `Rail(title, onTitleTap:) { RailItem(.poster) { … } }`, `RailArt.width(in:)`,
  `CardGrid { … }` (adaptive columns, two on a phone, more on an iPad).
  Cards open pages through the environment's `Navigator` and offer a
  context menu on a long press through `.cardMenu(ActionTarget)`.
- Context menus [Actions.kt's hook]: `ActionTarget` and the root's
  `\.actionMenu = ActionMenu { target in AnyView(…) }`. The Actions task
  fills it in `Actions.swift`; until then cards offer no menu.
- Controls [Controls.kt]: `.buttonStyle(.matinee(.primary))` or
  `MatineeButton(.outline) { … }`, `RoundIconButton(icon, label:, background:, border:)`,
  `Chip(label, selected:)`, `WatchedBadge`, `ProgressBar(progress:)`,
  `SectionTitle(title, action:)`, `Avatar(name, url:)`, `Badge(text)`,
  `SegmentedControl(options, selection:)`, `.toggleStyle(.matinee)`,
  `MatineeSlider(label, value:, in:)`; `ControlShape`, `CardShape`,
  `Gutter`, `MinTouch`.
- States [Controls.kt, HomeSections.kt]: `LoadingBox`, `ErrorBox(title,
  message, disconnected:, onRetry:)`, `Disconnected`, `DisconnectedAction`,
  `Notice`, `RailFailure`, `RailSkeleton(title:, art:)`, `EmptyState(icon,
  title, message)`, `RetryButton`.
- Fields: `MatineeTextField($text, placeholder:, leadingIcon:, isError:,
  secure:)` [TextField.kt], `SearchField($query)` and `SearchBarFrame`
  [SearchBar.kt], `QrCode(text, label:, size:)` [QrCode.kt].
- Sheets: `.matineeSheet(detents)`, `SheetHeader`, `SheetItem`
  [Actions.kt], `WatchedAtSheet(WatchedAsk)` [WatchedAt.kt].
- Rows [settings/SettingsRows.kt]: `SettingsSection`, `Panel`, `RowDivider`,
  `PickerRow`, `SwitchRow`, `ValueRow`, `LinkRow`.
- Elsewhere in `UI/`: `Bars.swift` (`.topBar`, `.itemTopBar`, `AppHeader`,
  `.statusBarScrim`, the tabs' names and icons), `Motion.swift` (`Motion`,
  `.motion`, `withMotion`, `Reveal`), `Format.swift`, `State.swift`,
  `Navigator.swift`, and `theme/` (`Palette`, `Typography`, `ThemeStore`,
  `.matineeTheme`).
- Navigation [Nav.kt]: `@Environment(\.navigator)` has every way Android's
  `Navigator` opens a page: `title`, `titleUp` (back to it when it came
  before), `season`, `seasonUp`, `episode`, `item`, `person`, `genre`,
  `studio`, `library(id, sort)`, `favorites`, `recent`, `settings`,
  `settingsPage(key)`, `linkDevice`, `libraryEditor`, `folderPicker`,
  `identify`, `images`, `downloadsShow`, `play(itemId, start)`, `home`,
  `tab`, `back`, and `backWith(key, value)`, whose value the page under
  takes from `NavResults` (the library editor's `results`). A page opens on
  the stack of the tab it's in; the player opens over everything.
- The shell [Shell.kt]: on a tab's first page, `.scrollsToTopOnReselect()`
  on the `ScrollView` brings it to the top when the tab is picked again
  (picked on a page above, it goes back to the first page first); a page
  with a `ScrollPosition` of its own watches `\.tabReselected` instead.
  `Stub` is the placeholder every unbuilt page shows.

### Where iOS differs on purpose

- A long press opens a context menu over the card, not a bottom sheet.
- Top bars are the navigation bar, with the system's back button and edge
  swipe; the tab bar is the shell's to choose. A page over art keeps the
  bar too, cleared, with Home and the page above as its glass buttons
  (`.itemTopBar`): from iOS 26 a page whose bar is hidden loses both back
  swipes, and an empty bar counts as hidden. Before iOS 26 it floats
  Android's circles over the art instead.
- Sheets are the system's, with a grabber and detents.
- Round icon buttons keep their size at large text sizes and show in the
  large content viewer; text and other icons grow with Dynamic Type.
- Each tab keeps a navigation stack of its own, and the tab bar stays on
  pages opened from a tab, as iOS apps have it; Android has one stack with
  the bar on the tabs' first pages only. On an iPad the bar is at the top
  and opens into a sidebar. Search is the system's search tab, which iOS 27
  draws inside the bar rather than in a circle beside it.
- The profile tab shows the person's picture, drawn into the tab's image.
- Browser sign-in is the system's web sign-in sheet, which asks first
  whether the app may use the server's site to sign in.
- iOS has no run-time local network permission to ask for: when a server on
  the local network doesn't answer, the error says where to turn Local
  Network on, with a button to the app's settings.

## Order of work

1. API client generator and the package's `Api/` layer. A dev server with
   a seeded library for testing.
2. The app's skeleton: project, theme, font, icons, strings, components,
   navigation shell. In parallel, `Auth/` in the package.
3. Feature screens in parallel: sign-in and servers, home, browse and
   search, title pages and actions, player, downloads, profile, settings,
   admin and metadata pages. In parallel, the package's `Downloads/` and
   `Player/` logic.
4. Integration, a screen-by-screen comparison with the Android app,
   README, `just ios`, CI, and the notes in `AGENTS.md`.

## Screens

Every page exists, as a stub with its final type name and parameters,
wired into `Nav.swift`. A page's task replaces the stub's body in its file
and leaves the routes alone. Routes are `Route` cases in `Nav.swift`; the
tabs' first pages are `ShellTab`s.

| File                                            | Type                                                                                                | Route                                     | Filled in by |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------ |
| `home/HomeScreen.swift`                         | `HomeScreen()`                                                                                      | tab `home`                                |              |
| `home/OfflineHome.swift`                        | `OfflineHomeScreen()`                                                                               | tab `home`, offline (HomeScreen shows it) |              |
| `media/MediaScreen.swift`                       | `MediaScreen()`                                                                                     | tab `media`                               |              |
| `media/FavoritesScreen.swift`                   | `FavoritesScreen()`                                                                                 | `.favorites`                              |              |
| `browse/LibraryScreen.swift`                    | `LibraryScreen(id:sort:)`                                                                           | `.library(id:sort:)`                      |              |
| `browse/BrowseScreen.swift`                     | `BrowseScreen(genre:studio:)`                                                                       | `.browse(genre:studio:)`                  |              |
| `browse/BrowseScreen.swift`                     | `PersonScreen(name:)`                                                                               | `.person(name:)`                          |              |
| `search/SearchScreen.swift`                     | `SearchScreen()`                                                                                    | tab `search`                              |              |
| `title/TitleScreens.swift`                      | `TitleScreen(id:)`                                                                                  | `.title(id:)`                             |              |
| `title/TitleScreens.swift`                      | `SeasonScreen(titleId:season:)`                                                                     | `.season(titleId:season:)`                |              |
| `title/TitleScreens.swift`                      | `EpisodeScreen(itemId:)`                                                                            | `.episode(itemId:)`                       |              |
| `metadata/MetadataScreens.swift`                | `IdentifyScreen(titleId:)`                                                                          | `.identify(titleId:)`                     |              |
| `metadata/MetadataScreens.swift`                | `ImagesScreen(target:)`                                                                             | `.images(titleId:season:episode:)`        |              |
| `player/PlayerScreen.swift`                     | `PlayerScreen(itemId:start:)`                                                                       | `nav.play`, over everything               |              |
| `downloads/DownloadsScreen.swift`               | `DownloadsScreen()`                                                                                 | tab `downloads`                           |              |
| `downloads/DownloadsScreen.swift`               | `DownloadsShowScreen(titleId:)`                                                                     | `.downloadsShow(titleId:)`                |              |
| `profile/ProfileScreen.swift`                   | `ProfileScreen()`                                                                                   | tab `profile`                             |              |
| `profile/RecentScreen.swift`                    | `RecentScreen()`                                                                                    | `.recent`                                 |              |
| `settings/SettingsScreen.swift`                 | `SettingsScreen()`                                                                                  | `.settings`                               |              |
| `settings/SettingsScreen.swift`                 | `SettingsPageScreen(key:)`, `AccountPage`, `PlaybackPage`, `SubtitlesPage`, `DownloadsSettingsPage` | `.settingsPage(key)`                      |              |
| `settings/AppearanceSettings.swift`             | `AppearancePage()`                                                                                  | `.settingsPage("appearance")`             |              |
| `settings/AboutSettings.swift`                  | `AboutPage()`                                                                                       | `.settingsPage("about")`                  |              |
| `settings/LinkDevice.swift`                     | `LinkDeviceScreen()`                                                                                | `.linkDevice`                             |              |
| `settings/admin/LibrariesSettings.swift`        | `LibrariesSettings()`                                                                               | `.settingsPage("libraries")`              |              |
| `settings/admin/LibrariesSettings.swift`        | `LibraryEditorScreen(id:results:)`                                                                  | `.libraryEditor(id:)`                     |              |
| `settings/admin/LibrariesSettings.swift`        | `FolderPickerScreen(start:added:)`                                                                  | `.folderPicker(start:added:)`             |              |
| `settings/admin/UsersSettings.swift`            | `UsersSettings()`                                                                                   | `.settingsPage("users")`                  |              |
| `settings/admin/AuthenticationSettings.swift`   | `AuthenticationSettings()`                                                                          | `.settingsPage("authentication")`         |              |
| `settings/admin/TranscodingSettings.swift`      | `TranscodingSettings()`                                                                             | `.settingsPage("transcoding")`            |              |
| `settings/admin/TrickplaySettings.swift`        | `TrickplaySettings()`                                                                               | `.settingsPage("trickplay")`              |              |
| `settings/admin/JobsSettings.swift`             | `JobsSettings()`                                                                                    | `.settingsPage("jobs")`                   |              |
| `settings/admin/ServerAppearanceSettings.swift` | `ServerAppearanceSettings()`                                                                        | `.settingsPage("server-appearance")`      |              |

Notes for the tasks that fill them in:

- `SettingsPage` (keys, icons, titles, admin) and `SettingsPageScreen`'s
  dispatch are ported already. `SettingsScreen`'s stub carries Android's
  offline switch and server section (`SettingsServerSection`, with
  `ChangeServerRow` and Sign out), which the shell needs meanwhile; keep
  them when the page is built.
- `ProfileScreen`'s stub has a row to Settings, standing in for the
  header's settings button.
- `PersonScreen` is in `BrowseScreen.swift` because Android keeps it in
  `BrowseScreen.kt`.
- The library editor takes the folder picker's answer from `results`
  under `PICKED_FOLDER`; the picker hands it back with
  `nav.backWith(PICKED_FOLDER, folder)`.
- The player leaves with `@Environment(\.dismiss)`; the shell turns the
  phone's screen to landscape and back (`Orientation` in MatineeApp.swift);
  an iPad's player follows the device, and its controls lay out both ways.
- Signing in and the server list are built: `signin/` (ConnectScreen,
  SignInScreen, ServerSwitcherSheet, ChangeServerRow, ChangeServerButton,
  UnreachableScreen, LocalNetworkHint).
