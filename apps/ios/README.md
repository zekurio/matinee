# Matinee for iOS

A native SwiftUI app for iPhone and iPad, on iOS 18.0 or later, written in
Swift 6. It follows the Android phone app's screens, with Matinee's palettes,
Red Hat Text, and lucide icons. Text comes in English and German.
There is no tvOS app.

## Build

Use a Mac with Xcode 26 or later and its command-line tools selected.
The app uses Swift 6.2's default main-actor isolation. The repository's
flake dev shell is Linux-only. The recipes use Nixpkgs for XcodeGen and
Node 24 on macOS; install `just` too. Run these from the repository root:

| Recipe              | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `just ios generate` | Writes the ignored Xcode project, version config, and app icon catalog           |
| `just ios build`    | Builds the unsigned debug app for the simulator in `apps/ios/build/DerivedData/` |
| `just ios test`     | Runs MatineeCore's Mac tests and checks generated strings, icons, and palettes   |
| `just ios api`      | Generates the API client after a contract change                                 |
| `just ios strings`  | Generates the string catalog and Swift accessors                                 |
| `just ios icons`    | Generates icons and palettes                                                     |

In `apps/ios`, leave out `ios`: `just build`. The same build by hand:

```sh
cd apps/ios
nix run nixpkgs#xcodegen -- generate --quiet
xcodebuild -project Matinee.xcodeproj -scheme Matinee \
  -derivedDataPath build/DerivedData -configuration Debug \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
cd Packages/MatineeCore
swift test
```

XcodeGen reads `project.yml`; don't commit `Matinee.xcodeproj`.
It also runs `scripts/version.sh` to read the root `package.json`, and
`scripts/appicon.sh` to copy the icon from `brand/ios`.
Keep derived data inside your checkout so concurrent builds don't share it.
With tools already installed, `XCODEGEN=xcodegen` and `NODE=node` let the
recipes use those instead of Nix. The CI runner uses this option.

## What it does

- Connects by server address, trying https then http without a scheme.
  Keeps several servers with separate sessions. Switching leaves the other
  sessions intact; removing a server deletes its token and downloads.
  Tokens live in the Keychain.
- Signs in with a device code approved at `/link`, or the system browser
  sign-in sheet through `ASWebAuthenticationSession`, PKCE, and
  `matinee://auth/callback`. The browser page offers passkeys and OIDC.
  See [Signing in apps](../server/README.md#signing-in-apps).
- Home has the featured banner, Continue watching, Next up, and recently
  added titles. Libraries have sorting, genre filters, and search. Browse
  genres, studios, and people, or search across the server.
- Title, season, and episode pages show watched marks and favorites.
  A long press opens a card's context menu. Profile shows watch statistics
  and Recently watched. Admin pages manage libraries, users, authentication,
  transcoding, trickplay, jobs, and the server's accent. Fix match and the
  image editor change metadata and artwork.
- The player sends a `PlaybackDevice` and plays the server's
  `playback.start` answer. AVPlayer opens MP4, M4V, and MOV and plays HLS.
  It doesn't open MKV. The server's copied stream is fragmented MP4 without
  byte ranges, which AVPlayer refuses, as Safari does. A non-MP4/MOV file
  that gets a copied stream first fails and then plays the encode the
  server selects on fallback. There is no mpv engine.
  The app draws its own controls and WebVTT subtitles, offers audio,
  subtitle, quality, and speed choices, shows trickplay while seeking,
  reports progress, and offers the next episode. Picture subtitles the
  device doesn't support require server burn-in. Picture in picture,
  lock-screen controls, and AirPlay are wired, but see Status for testing.
- Downloads save an original or a version the server resolves for this
  device, plus selected subtitles. A background `URLSession` fetches them,
  with Wi-Fi-only policy unless Settings allows other networks. A version
  fetches one segment at a time because the server deletes earlier segments
  when a later one is requested. In the background iOS wakes the app after
  each segment to queue the next, so versions download at full speed only
  while the app is open. An original is one transfer and isn't affected.
  Downloads, offline Home, and queued watch progress belong to their server.
  Progress flushes when it answers again. An account forbidden to download
  keeps existing files but gets no Download action.
- Settings cover language preferences, subtitle appearance, playback and
  download choices, themes, sessions, servers, and linking another device
  by code or camera. About shows the latest playback report and a redacted
  process log, shared only when requested.

Local server discovery exists in MatineeCore but no screen uses it. It
needs Apple's multicast entitlement. Android's phone app doesn't use
discovery either. Android TV screens, display frame-rate switching, and the
Watch Next launcher row have no iOS port.

## Develop

### The API client

`pnpm api:ios` at the repository root generates
`Packages/MatineeCore/Sources/MatineeCore/Api/ContractModels.swift` and
`ContractApi.swift` from the server's OpenAPI document.
`pnpm verify` fails while they are out of date. Don't edit them. Change the
contract first, or the generator in `apps/server/scripts/swift-client.ts`
when a new schema needs a Swift representation. Transport, plain routes,
and saved-data handling live beside the generated files.
On this Mac, run pnpm through
`nix shell nixpkgs#nodejs_24 nixpkgs#pnpm_11 -c pnpm api:ios`.

### Conventions

Keep Android's file and type names where Swift allows, so the apps can be
read side by side. Put a screen under `Matinee/UI/` in the matching folder,
add its route in `Nav.swift`, and use the environment's API, navigator,
palette, session, viewer, and downloads rather than globals. Load through
`Loader` and `.loads`, using `UI/State.swift` as the pattern. Logic that
isn't a view belongs in MatineeCore with Swift Testing tests.

Use `UI/components/`, `.textStyle`, and the palette, not system font sizes
or fixed colors. Set bars with `.topBar` or `.itemTopBar`, sheets with
`.matineeSheet()`, and animations with `Motion` so Reduce Motion applies.
Views default to the main actor; pure app-target helpers use `nonisolated`.
Shared components belong in the debug gallery in `UI/gallery/` too.

Strings come from Android's `res/values*/strings*.xml` through
`scripts/strings.py`. Use `Str` accessors, including their typed arguments
and plural counts. Add iOS-only text in `Matinee/Resources/iOS.xcstrings`,
with an `ios_` key and English and German values, then run `just ios strings`.
Info.plist text lives in `Matinee/Resources/InfoPlist.xcstrings`.
Format dates, numbers, sizes, and durations through `UI/Format.swift` in
the app's language. Commit regenerated catalogs and accessors.

Add lucide icons to Android's drawables and its `Lucide` object first,
then run `just ios icons`. `LucideIcon(.arrowLeft, size: 20)` grows with
Dynamic Type; give icon-only controls a label. `Logo` and `LogoMark` use
brand assets. `scripts/themes.mjs` reads the web's palettes and writes
`UI/theme/ThemePresets.swift`; `just ios icons` regenerates that too.

### The dev server and launch arguments

[DEV.md](DEV.md) describes the shared Mac fixture at
`http://localhost:18420`, its synthetic library, code approval, and private
token helper. Coordinate before restarting or reseeding it. It has no
passkeys or OIDC identities, so it cannot verify browser authentication.
The fixture scripts are local development tools, not a production setup.

For simulator UI work, the recipes `run`, `dev`, and `gallery` build,
install, and launch on `MATINEE_SIMULATOR`, default `iPhone 17`. `dev` accepts
an account, default `ios-admin`, then launch arguments; `gallery` opens the
component gallery. They boot a simulator if needed. These interactive
recipes are separate from the headless build and test checks.

Debug builds read these arguments; release builds don't compile `DevLaunch`:

| Argument                                                                    | What it does                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `-dev.server URL -dev.token TOKEN`                                          | Saves a server and token before the normal session check                |
| `-dev.route PATH`                                                           | Opens a tab or route, parsed by `RoutePath` in `UI/Nav.swift`           |
| `-dev.offline YES`                                                          | Saves offline mode; `NO` clears it                                      |
| `-theme.mode dark`                                                          | Selects `system`, `light`, or `dark`                                    |
| `-AppleLanguages "(de)"`                                                    | Selects German through iOS                                              |
| `-UIPreferredContentSizeCategoryName UICTContentSizeCategoryAccessibilityL` | Selects an accessibility text size                                      |
| `-gallery YES`                                                              | Opens the component gallery, with options in `UI/gallery/Gallery.swift` |

Routes include `title/<id>`, `season/<titleId>/<n>`, `episode/<id>`,
`settings/<page>`, and `player/<itemId>?start=<seconds>`. `Nav.swift` is the
complete list. Scene state restores a page only after the app has gone to
the background; terminating and launching alone doesn't save it.

## Layout

```text
apps/ios/
  project.yml                  XcodeGen spec, including Info.plist settings
  justfile                     Build, generation, and simulator recipes
  Matinee/
    MatineeApp.swift           Entry point, app delegate, background handoff
    DevLaunch.swift            Debug-only server, token, and route injection
    Resources/                 Catalogs, generated icons, and brand assets
    UI/                        SwiftUI screens, navigation, and shared components
    UI/theme/                  Palette, typography, and theme state
    UI/gallery/                Debug component gallery
  Packages/MatineeCore/
    Sources/MatineeCore/Api/    Generated client, transport, routes, saved data
    Sources/MatineeCore/Auth/   Sessions, Keychain, browser sign-in, discovery
    Sources/MatineeCore/Player/ Controller, device profile, cues, diagnostics
    Sources/MatineeCore/Downloads/ Background transfers and offline progress
    Sources/MatineeCore/State/  Loaders, watched marks, and viewer state
    Sources/MatineeCore/Format/ Formatting and redacted logging
    Sources/MatineeCore/Images/ Authenticated image sources and blur hashes
    Sources/MatineeCore/        Home, browse, title, profile, admin, metadata logic
    Tests/MatineeCoreTests/     Swift Testing suites and opt-in live tests
  scripts/                     Resource generators and the dev fixture
```

Maintainer details live in [downloads integration](Packages/MatineeCore/DOWNLOADS.md)
and [player core](Packages/MatineeCore/Sources/MatineeCore/Player/README.md).

## Status

The app has run on simulators only, never a physical device. There is no
release build process, signing, or TestFlight setup. The release scripts and
workflow publish the server and Android APKs only; they need no iOS job
until signing and distribution exist.

The commit history records layout fixes across the phone screens,
iPad layouts, and large text sizes, not a complete end-to-end acceptance pass.
MatineeCore has automated tests for the
ported logic, fake-engine playback, downloads, and offline track selection.
The opt-in Mac live tests played direct MP4 and HLS from the dev fixture,
checked audio picks, WebVTT loading, PGS burn-in selection, seeking and
fallback after the copied-stream error. Live download tests fetched copied
and encoded versions, paused and resumed, opened them in AVPlayer, queued
and flushed offline progress, and deleted their media. Those tests use a
plain URLSession, not a suspended app's background session.

Still unverified: picture in picture and restoration, physical lock-screen
controls and background audio, AirPlay, HDR and Dolby Vision output, a
hardware keyboard, VoiceOver, a real camera's QR scan, cellular/Wi-Fi
transitions, suspended and locked-device downloads, force-quit/relaunch
handoff, OS retry scheduling, and browser passkey or OIDC sign-in beyond
loading the page. Large real-world fragmented downloads also need seeking
checks. Synthetic HDR tags and advancing playback clocks do not prove color
accuracy or audible output. The player core docs record device-profile
limits that still need hardware measurements.

## License

GPL-3.0, see [LICENSE](LICENSE). The rest of the repo, including
MatineeCore, remains MIT. The app links MPVUI's GPL builds of libmpv and
FFmpeg. MatineeMPV is GPL-3.0; MPVUI's Swift wrapper is MIT. Red Hat Text,
lucide, and Nuke retain their own licenses.
