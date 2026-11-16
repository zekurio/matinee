# Building a screen

The app's screens build from [MatineeKit](../../Packages/MatineeKit/README.md)
and the shared components here, take their data from MatineeCore, and follow
the Android phone app's screens (`apps/android/.../ui/`), checked against the
web app, which is where the design comes from. Where Android and the web
disagree, the web wins on look and Android on what suits a touch screen.
`home/` is the worked example: read it before you start, and hold your
screen to it.

Read the kit's README first. Everything below assumes it.

## What's where

| Path                 | What it is                                                              |
| -------------------- | ----------------------------------------------------------------------- |
| `Root.swift`         | Server, sign-in, or the app, by the session's state; the one toast host |
| `Shell.swift`        | The signed-in app: a stack per tab, the actions host, the player cover  |
| `Nav.swift`          | Every route, `ShellNav`, `RoutePath` for `-dev.route`                   |
| `Navigator.swift`    | What a page calls to open another                                       |
| `Bars.swift`         | The tabs, Home's header, `ItemTopBar`, `statusBarScrim`                 |
| `State.swift`        | `.loads`, `describeFailure`, the `api` and `offline` environment        |
| `Format.swift`       | Names, numbers, and dates in the app's language                         |
| `ThemeStore.swift`   | The mode and the server's accents, handed to the kit                    |
| `components/`        | The shared components below                                             |
| `home/`              | Home, rebuilt: the pattern to copy                                      |
| `gallery/`           | Debug gallery of the shared components, and the kit's                   |
| `kit-exclusions.txt` | Folders the boundary test lets through: none, and it stays empty        |

## The shell

On an iPhone the tabs, Home, Media, Downloads, and the profile, float at the
bottom of each tab's first page in the web's capsule, with search in a
circle beside it. On an iPad in a regular width they sit at the top, in the
web's bar from `sm` up: the logo, the tabs by name, then search and the
account. An iPad in a narrow split gets the phone's. A page opened from a
tab covers the tabs, as on Android and the web's phone layout, and has a
top bar with Back; the edge swipe back works on every page.

`\.shellStyle` says which (`.phone` or `.tablet`). A page rarely needs it:
the tabs are attached by the shell, and their room comes off the safe area,
so a page that scrolls under them ends clear of them and a centered
spinner centers in what's visible. Don't add bottom padding for the tabs.

## A screen, start to finish

```swift
/// LibraryScreen.kt: a library's titles, sortable and filtered.
struct LibraryScreen: View {
  let id: String
  @State private var library = Loader<Library>()
  @Environment(\.navigator) private var nav

  var body: some View {
    Group {
      switch library.state {
      case .loading: LoadingBox()
      case .failed(let message, let disconnected):
        ErrorBox(Str.homeLoadFailed, message, disconnected: disconnected, onRetry: library.reload)
      case .ready(let value): content(value)
      }
    }
    .topBar(library.state.value?.name) { DisconnectedAction(library) }
    .loads(library) { [id] api in try await api.libraries.get(id: id) }
  }
}
```

1. **One file per Android file**, in the folder Android uses, with its
   names where Swift allows, so the two read side by side. Start the file
   with a comment naming the Kotlin it ports.
2. **Its top.** A page opened from a tab: `.topBar(title) { actions }`, the
   kit's 64-point bar with Back. A page that draws art to the top:
   `.hidesSystemNavigationBar()` and `ItemTopBar(parent:onParent:)` over the
   art, and `.statusBarScrim()` on its `ScrollView`. A tab's first page
   draws its own top and gets the tabs from the shell. Never the system's
   navigation bar, title, or toolbar.
3. **Its data.** Each load is a MatineeCore `Loader` in `@State`, given its
   fetch with `.loads(loader) { api in … }`, which fetches when the page
   shows, again when the viewer's marks change, and when the page comes
   back after 30 seconds (`maxAge:` changes that). Several loads that
   belong together go in a class of their own, as `HomeLoaders`. What a
   page decides from its data (which rows show, what's empty, what failed
   outright) is a function in MatineeCore with a test, not logic in the
   view. Logic Android has in a screen file goes to MatineeCore too.
4. **Loading and failing**, always one of these:
   - `LoadingBox()` while a page has nothing yet; `RailSkeleton` or the
     kit's `Skeleton` in a section's place.
   - `ErrorBox(title, message, disconnected:, onRetry:)` when a page has
     nothing else to show. Its title starts "Couldn't"; it offers Back to
     Home by itself on a page opened from a tab.
   - `ErrorSection` in a section's place among what loaded, `RailFailed`
     for a rail. Home leaves a failed section out instead, as Android and
     the web do; follow your Android screen.
   - `DisconnectedAction(loaders…)` in the top bar while a page shows what
     loaded before and the server can't be reached.
   - A refresh that fails over an earlier answer keeps the answer on screen.
     `Loader` does that; don't blank a page.
5. **Its actions.** Open pages with `@Environment(\.navigator)`: `nav.title`,
   `nav.episode`, `nav.play`, … A route a page needs that `Navigator` lacks
   goes in `Nav.swift` (the `Route` case, `RouteScreen`, `RoutePath`, and
   the `Navigator` closure). Messages go through `@Environment(\.snackbar)`:
   `snackbar.show(text)`, or `snackbar.post(ToastMessage(…, kind: .error))`;
   a request whose failure the person should hear about runs in
   `launchShowing(snackbar, failure) { … }`.
6. **Offline.** `@Environment(\.offline)`: what's the server's only shows.
   Cards already do nothing then; a page hides what needs the server.

## The shared components

Use these rather than drawing your own. Each has a doc comment with an
example; `gallery/` shows them in every state (`just gallery`).

| Need                                                     | Use                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A titled row of cards                                    | `Rail(title, onTitleTap:) { ForEach … { RailItem(.landscape) { EpisodeCard(item) } } }`; `CardRow` without a title                         |
| A grid of posters                                        | `CardGrid { … }`: two columns on a phone, 176 and up on an iPad                                                                            |
| A file to start or resume                                | `EpisodeCard(item)`, or `EpisodeCard(item, showName: false)` in a season's row; `EpisodeRow(item)` in a list                               |
| A movie or show                                          | `PosterCard(title, detail:)`; `poster:` for a season's art, `recommended:` for a recommendation, `onTap:` for another page                 |
| A season, an episode as a poster, a favorite of any kind | `SeasonPosterCard`, `EpisodePosterCard`, `FavoriteCard`                                                                                    |
| A library's newest                                       | `ShelfCard(entry)`                                                                                                                         |
| A person                                                 | `PersonCard(name, role:, photo:)`; `ProfileAvatar(name, url:, size:)` for an account                                                       |
| A picture from the server                                | `Picture(sources)` in an `ArtFrame(toneKey, aspect:)`; it fades in over its blur hash, and falls back to the next source, then the tone    |
| How far in, watched                                      | `ArtProgressBar(progress:)` and `WatchedBadge()` over art; the kit's `ProgressBar` elsewhere                                               |
| A section's heading                                      | `SectionTitle(title, count:, action:)`; `count` puts how many titles after it                                                              |
| A tab's first page's name                                | `PageHeading(title) { actions }`                                                                                                           |
| A card's long press and a page's "more"                  | Cards have it. `ActionsButton(target)` on a page, `.cardMenu(target)` on anything else: the actions sheet for an `ActionTarget`            |
| When something was watched                               | `actions?.askWatched(name) { at in … }`                                                                                                    |
| Search                                                   | `SearchField($query, focused:)`; `SearchBarButton { … }` where a page leads to search                                                      |
| Filters                                                  | `FilterButton`, `ActiveFilterChips`, `.filterSheet { FilterSection { ChoiceChips / ToggleChips }; RangeField; OptionRow }`, `.optionSheet` |
| A QR code                                                | `QrCode(text, label:, size:)`                                                                                                              |
| Nothing to show                                          | The kit's `EmptyState(icon:title:description:)`                                                                                            |
| Wrapping chips                                           | `FlowRow(spacing:lineSpacing:) { … }`                                                                                                      |

Lay pages out on `@Environment(\.gutter)`, the page's side margin for the
window (16 on a phone, 24 on an iPad, 56 once it's 1024 wide), so headings,
rails, and grids line up; `\.windowSize` for anything sized by the window.

## Text, icons, and look

- Words come from `Str`, generated from Android's `strings.xml`. Use the
  accessor with its typed arguments and plural counts. A string Android
  doesn't have goes in `Resources/iOS.xcstrings` with an `ios_` key, in
  English and German, worded as the web's message where it has one
  (`apps/web/src/i18n/locales`), and `just ios strings` gives it an
  accessor (the app README, Conventions). Dates, numbers, and sizes go
  through `Format.swift`.
- Icons are the kit's: `LucideIcon(.film, label:, size:)`. An icon-only
  control gets a label.
- Sizes, colors, radii, spacing, and timing are the kit's tokens:
  `.textStyle(.sm, weight: .medium)`, `palette.mutedForeground`,
  `Radius.md`, `Space.s3`, `Motion.move`. A number that isn't one is a
  number the web doesn't draw.
- Animate with `.motion(_:value:)` and `withMotion`, which follow Reduce
  Motion. Nothing moves on its own under Reduce Motion.

## What's off limits

- Stock SwiftUI controls and looks: the kit's README lists them, and
  `just ios test` fails on each anywhere under `Matinee/UI`.
  `kit-exclusions.txt` is empty; don't add a folder to it.
- Working around the kit. If it lacks something or draws it wrong, fix it
  in the kit, with its gallery and README.
- Deciding what the server decides (AGENTS.md, Boundaries): which track
  plays, what a file is called, how it plays, what a download holds.
- `Packages/MatineeMPV`, generated files (`Strings.gen.swift`, the API
  client, the kit's icons and palettes), and the string catalogs by hand.

## Checking it

Build into a derived data folder of your own, so builds don't share one:

```sh
cd apps/ios
export MATINEE_DERIVED_DATA=build/MyAreaDerivedData MATINEE_SIMULATOR=matinee-myarea-iphone
just dev                                  # signed in to the dev server as ios-admin
just dev ios-viewer -dev.route title/<id> # as the viewer, on a page
just shot library-dark                    # build/screenshots/library-dark.png
just gallery -gallery.page states         # the shared components
just test                                 # MatineeCore, the boundary test, generated files
```

The recipes sign the simulator build ad hoc, which the Keychain needs to
keep the sign-in. [DEV.md](../../DEV.md) describes the dev server; don't
restart or reseed it. Its library has no artwork: `-dev.art YES` fills
Home's banner, and `-dev.recommendations YES` Home's recommendation rows.

Debug builds read the launch arguments below, which are how a page is
put in a state for a screenshot without a finger on the simulator. Each is
read inside `#if DEBUG`, so a release build has none of them; `-theme.mode`
is the setting's own key and the system's are iOS's, so those work in any
build. Pass them after `just dev` or `just gallery`.

| Area      | Argument                                                                    | What it does                                                                                                                                                                            |
| --------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System    | `-AppleLanguages "(de)"`                                                    | German, through iOS                                                                                                                                                                     |
| System    | `-AppleTextDirection YES -NSForceRightToLeftWritingDirection YES`           | Right to left                                                                                                                                                                           |
| System    | `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityL` | An accessibility text size                                                                                                                                                              |
| Theme     | `-theme.mode dark`                                                          | `system`, `light`, or `dark`. The setting's own saved key, so it works in any build                                                                                                     |
| App       | `-dev.server URL -dev.token TOKEN`                                          | Saves a server and its sign-in before the session checks it (`DevLaunch.swift`); `just dev` passes both                                                                                 |
| App       | `-dev.route PATH`                                                           | Opens a tab or a page, parsed by `RoutePath` in `Nav.swift`: `title/<id>`, `season/<titleId>/<n>`, `episode/<id>`, `library/<id>`, `settings/<page>`, `player/<itemId>?start=<seconds>` |
| App       | `-dev.offline YES`                                                          | Offline mode on, as Settings' switch; `NO` turns it off                                                                                                                                 |
| App       | `-gallery YES`                                                              | The component gallery instead of the app (`gallery/Gallery.swift`)                                                                                                                      |
| Gallery   | `-gallery.page cards`                                                       | Its page: `cards`, `states`, `bars`, `sheets`, `kit`                                                                                                                                    |
| Gallery   | `-gallery.accent rose`                                                      | A server accent: `matinee`, `rose`, `emerald`, `amber`                                                                                                                                  |
| Gallery   | `-gallery.scroll 2`                                                         | Scrolled down that many screens                                                                                                                                                         |
| Gallery   | `-gallery.open actions`                                                     | A sheet open at launch: `actions`, `watched`, `filters`                                                                                                                                 |
| Gallery   | `-gallery.server URL -gallery.token TOKEN`                                  | Pictures from the dev server's library; `just gallery` passes both                                                                                                                      |
| Home      | `-dev.art YES`                                                              | Fills the banner with art the artless dev server lacks                                                                                                                                  |
| Home      | `-dev.recommendations YES`                                                  | Fills the recommendation rows                                                                                                                                                           |
| Title     | `-title.fixture YES`                                                        | A provider's overview, credits, genres, ratings, trailer, and logo where the dev server has none                                                                                        |
| Title     | `-title.scroll cast`                                                        | Scrolls to a section: `nextup`, `episodes`, `seasons`, `files`, `cast`, `related`, `actions`, `more`                                                                                    |
| Title     | `-title.open actions`                                                       | The page's actions sheet, or `watched`, the question of when                                                                                                                            |
| Browse    | `-dev.browseFixtures YES`                                                   | Genres, studios, ratings, languages, scores, runtimes, and people for libraries, browse, and person pages                                                                               |
| Browse    | `-dev.browse.open filters`                                                  | What a page opens with: `filters`, `language`, `search`, `sort`, `more` (a biography in full)                                                                                           |
| Browse    | `-dev.browse.query TEXT`                                                    | What the library's or the search page's field starts with                                                                                                                               |
| Browse    | `-dev.browse.filters "genre=Drama;years=1980-2000"`                         | The filters a list starts with: `genre`, `studio`, `years`, `score`, `runtime`, `watched`, `rating=DE:12`, `language`                                                                   |
| Browse    | `-dev.browse.sort score`                                                    | The order a list starts in                                                                                                                                                              |
| Browse    | `-dev.pageSize 6`, `-dev.pageDelay 1500`                                    | A grid's page size, to see paging, and milliseconds added to each page                                                                                                                  |
| Profile   | `-dev.statsFixtures YES`                                                    | A year of made-up watching and full boards; `quiet` leaves the last 30 days empty, `empty` is an account that never watched                                                             |
| Profile   | `-dev.statsRange 7d`                                                        | The statistics' range                                                                                                                                                                   |
| Profile   | `-dev.profileScroll stats`                                                  | Scrolls to `stats`, `titles`, `standing`, `activity`, or `recent`                                                                                                                       |
| Profile   | `-dev.profileBoard watchTime`                                               | That board's sheet open                                                                                                                                                                 |
| Profile   | `-dev.profileInbox 3`                                                       | The inbox's stand-in, with that many waiting                                                                                                                                            |
| Downloads | `-dev.downloadFixtures YES`                                                 | A made-up download in every state a row can be in, beside the real ones                                                                                                                 |
| Downloads | `-dev.downloadOpen actions:<itemId>`                                        | What the tab opens once: `actions:`, `show:`, `menu`, `remove`, `sheet:`, `files:<titleId>[:<season>]`, or `pause:`, `resume:`, `remove:` a download                                    |
| Downloads | `-dev.downloadAfter pause:<itemId>:5`                                       | The same, that many seconds after the tab shows                                                                                                                                         |
| Downloads | `-dev.downloadStart original`                                               | Presses Download in the download sheet once the server answers: `original`, `device`, or a preset's height                                                                              |
| Actions   | `-dev.noDownloads YES`                                                      | The account as one that may not download                                                                                                                                                |
| Metadata  | `-dev.metadataFixtures YES`                                                 | Matches and images a provider would offer, for fix match and the image editor                                                                                                           |
| Metadata  | `-dev.metadataDo upload`                                                    | Once, in the image editor: `upload`, `remove`, `reset`, or `menu`                                                                                                                       |
| Search    | `-dev.browse.query TEXT`                                                    | The field's text (above)                                                                                                                                                                |
| Sign-in   | `-dev.signin code`                                                          | Opens sign-in with a code at once                                                                                                                                                       |
| Settings  | `-settings.open log`                                                        | Opens a page's dialog, sheet, or menu: `log` (About), `report` (playback report), `avatar`, `signout-others` (Account)                                                                  |
| Settings  | `-settings.scroll 600`                                                      | Starts a page that far down, or at its end with `bottom`                                                                                                                                |
| Settings  | `-dev.report YES`                                                           | A playback report as a failed encode leaves it, before anything played                                                                                                                  |
| Settings  | `-dev.camera YES`, `-dev.scan TEXT`                                         | Link device as with a camera, and a scanned QR code's text                                                                                                                              |
| Admin     | `-admin.act sheet`                                                          | A step on an admin page: `sheet` (the first row's), `edit`, `save`, `invalid`, `remove`, `remove-yes`, `role`                                                                           |
| Admin     | `-admin.target NAME`                                                        | The row `-admin.act` acts on, by name                                                                                                                                                   |
| Admin     | `-admin.scroll bottom`                                                      | Opens an admin page at its end, or `center`                                                                                                                                             |
| Player    | `-player.controls YES`, `-player.hidden YES`                                | Keeps the controls up, or starts with them away                                                                                                                                         |
| Player    | `-player.menu audio`                                                        | Opens a menu: `audio`, `subtitles`, `quality`, `speed`                                                                                                                                  |
| Player    | `-player.paused YES`, `-player.locked YES`                                  | Pauses once the first source plays; locks the controls                                                                                                                                  |
| Player    | `-player.subtitle 2`, `-player.scrub 0.4`                                   | Picks that subtitle track; drags the seek bar that far along                                                                                                                            |
| Player    | `-player.notice burnIn`                                                     | A note: `burnIn`, `quality`, `switch`                                                                                                                                                   |
| Player    | `-player.gesture hold`                                                      | A gesture's note: `brightness`, `volume`, `seek`, `hold`                                                                                                                                |
| Player    | `-player.engine mpv`                                                        | The engine for this launch: `avPlayer` or `mpv`                                                                                                                                         |

Check an iPhone and an iPad (both orientations), light and dark, German,
right to left, a large text size, and VoiceOver's reading of your cards and
controls, and compare with the web app at the same width and with the
Android screen.
