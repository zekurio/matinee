# Android player notices

The following files adapt code from Plezy at revision
`54f135fe46f1aed4edc36a04241152fc9cac7bf5`. Copyright © edde746 and Plezy
contributors. Licensed under GPL-3.0. The Matinee copy of the license is in
[LICENSE](LICENSE).

All paths below are relative to
`android/app/src/main/kotlin/io/github/zekurio/matinee/`.

| Matinee file                  | Plezy source                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MainActivity.kt`             | `PlezyActivity.kt`, Flutter's texture render mode and transparent background                                                                                                                  |
| `player/PlayerSurfaceHost.kt` | `shared/PlayerSurfaceHost.kt` and `shared/FlutterOverlayHelper.kt`, the view stack under Flutter, z-order, the OSD plane, and the video rectangle                                             |
| `player/MpvEngine.kt`         | `mpv/MpvPlayerCore.kt`, the mpv options (`vo`, `hwdec`, `vd-lavc-o`, decoder queue, film grain, unused scripts), the placeholder surface, surface handoff, and the software renderer fallback |

`player/Media3Engine.kt`, the Pigeon bridge, and everything in `lib/player/`
are Matinee's own.

[Plezy revision](https://github.com/edde746/plezy/tree/54f135fe46f1aed4edc36a04241152fc9cac7bf5)

The Android build uses the GPL-3.0 libmpv AAR from
[edde746/mpv-build at `6dbda06021b128b7adc30161bf7870977e575135`](https://github.com/edde746/mpv-build/tree/6dbda06021b128b7adc30161bf7870977e575135).
The AAR includes notices for its bundled libraries.

# Home hero notice

`lib/screens/home/home_hero.dart` adapts the crossfade-and-drift backdrop
from Plezy's `lib/widgets/hero_carousel_backdrop.dart` at revision
`54f135fe46f1aed4edc36a04241152fc9cac7bf5`, rewritten in Matinee's style.
Copyright © edde746 and Plezy contributors. Licensed under GPL-3.0. The
Matinee copy of the license is in [LICENSE](LICENSE).

# iOS player notices

The following files adapt code from the same Plezy revision. All paths
below are relative to `ios/Runner/`, in Matinee and in Plezy.

| Matinee file                | Plezy source                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Player/VideoHost.swift`    | `MpvPlayer/MpvPlayerCore.swift` and `MpvPlayer/MpvPipController.swift`, the sample buffer layer under the Flutter view, its frame, and picture in picture from that layer      |
| `Player/MpvEngine.swift`    | `shared/apple/MpvPlayer/MpvPlayerCoreBase.swift` (from the repository root), the avfoundation output and its options, the event loop, and the audio flush after a speed change |
| `Player/PlayerSystem.swift` | `AppDelegate.swift`, the hidden volume slider and the brightness kept and restored per screen                                                                                  |

The rest of `ios/Runner/` is Matinee's own.

The iOS build links the `MPVKit` Swift package from the same mpv-build
revision, libmpv and FFmpeg built for iOS under GPL-3.0.
