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
      theme/ components/ signin/ home/ browse/ search/ media/ title/
      metadata/ player/ downloads/ profile/ settings/ settings/admin/
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
      Format/           Format, WatchedAt, AppLog redaction
    Tests/MatineeCoreTests/   the Android unit tests, ported
  scripts/
    strings.py          Android's strings.xml files -> Localizable.xcstrings
                        and UI/Strings.gen.swift
    lucide.py           lucide icons -> Assets.xcassets
    themes.mjs          the web's palettes -> UI/theme/ThemePresets.swift
```

## What Android does and what iOS uses for it

| Android                              | iOS                                                         |
| ------------------------------------ | ----------------------------------------------------------- |
| OkHttp, kotlinx.serialization        | URLSession, Codable                                         |
| Generated `ContractModels/Api.kt`    | Generated `ContractModels/Api.swift`, `pnpm api:ios`        |
| Keystore-encrypted preferences       | Keychain for tokens, UserDefaults for the rest              |
| Custom Tab + `matinee://` intent     | `ASWebAuthenticationSession`                                |
| `ACCESS_LOCAL_NETWORK`               | `NSLocalNetworkUsageDescription`, `NSBonjourServices` if used |
| Compose Navigation, `Navigator`      | `NavigationStack` with a typed route enum                   |
| Coil                                 | Nuke, with the session's auth header                        |
| ExoPlayer / Media3                   | AVPlayer, AVKit for picture in picture                      |
| `PlaybackService`, media session     | `MPNowPlayingInfoCenter`, `MPRemoteCommandCenter`           |
| WorkManager downloads                | A background `URLSession`                                   |
| System caption style                 | MediaAccessibility (`MACaptionAppearance`)                  |
| CameraX + ZXing                      | AVFoundation capture or VisionKit; CoreImage draws QR codes |
| Per-app language                     | iOS's per-app language setting, from the string catalog     |
| logcat for the app log               | `OSLogStore` for this process                               |
| `strings.xml`, `values-de`           | `Localizable.xcstrings`, generated from Android's files     |
| Vector drawables from lucide         | SVG template images in the asset catalog                    |

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
- Build before you report: `swift build && swift test` for the package,
  `xcodebuild` for the app. UI work is checked on a simulator, with
  screenshots, against the dev server in `DEV.md`.
- Commit on your own branch with conventional commit messages
  (`feat(ios): ...`). Don't push and don't open a pull request. End your
  report with the branch, the commits, what you verified and how, and
  what's left or doubtful.

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
