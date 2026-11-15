# MatineeMPV

GPL-3.0, see ../../LICENSE. MatineeCore remains dependency-free and MIT.
MPVUI is pinned to 0.10.0, the latest GitHub release checked during this change.
Its wrapper is MIT; its Libmpv artifact contains GPL mpv and FFmpeg.
No Swiftfin implementation was copied.

The app injects `MPVPlaybackEngine` into `PlayerController` and hosts
`MPVPlaybackSurface`. Core-only consumers still get AVPlayer unless they inject
an engine. A consumer using the mpv device profile must inject the mpv engine.

The adapter maps the controller's source timeline, readiness, buffering,
failures, rate and file-track ordinals onto MPVUI. Load waits for readiness
before applying the server's track choices. It times out after 20 seconds;
errors reach the existing controller fallback. Headers use mpv's
`http-header-fields`, including bearer authentication. File URLs receive no
headers. Plain embedded subtitles use MPVUI's text interception stream; styled
ASS and bitmaps stay in mpv. Server WebVTT still uses the existing app renderer.
External ASS uses MPVUI's external track loader. External PGS is not advertised:
the pinned FFmpeg recipe does not enable the `sup` demuxer. The app's existing
Red Hat Text font is provided as mpv's fallback when available in the host bundle.

## Profiles

`MPVCapabilities.swift` lists a subset of the demuxers and decoders enabled by
MPVUI's `Build/Sources/MPVBuildCore/Recipes/FFmpegFlags.swift`. These are build
capability claims, not empirical certification of every file or profile.
AV1 keeps VideoToolbox's hardware gate because software AV1 is expensive.
The 3840-pixel and 8/10-bit ceilings are conservative policy, not discovered
software-decoder maxima. HDR remains filtered by the existing device probe.
Dolby Vision is deliberately omitted: MPVUI native DV cannot composite ASS and
bitmap subtitles, and the contract cannot describe that combination. No
server-side or contract changes were made.

| Field                 | AVPlayer                                           | mpv                                                                                                  |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Containers            | MP4, M4V, MOV                                      | Those plus MKV, WebM, AVI, FLV, TS/M2TS/MTS, MPG/MPEG, OGV, WMV, 3GP/3G2                             |
| Video                 | VideoToolbox-supported H.264, HEVC, AV1            | H.264, HEVC, VP8/9, MPEG-1/2/4, VC-1, WMV1/2/3, H.263, MJPEG, ProRes, FFV1, FLV1; hardware-gated AV1 |
| Audio                 | Installed AAC, Opus, FLAC, ALAC, AC-3, E-AC-3; PCM | AAC, AC-3/E-AC-3, ALAC, FLAC, DTS, TrueHD, MP1/2/3, Opus, Vorbis, WMA, AMR, PCM                      |
| Stream audio          | Opus, AAC, FLAC, ALAC, AC-3, E-AC-3 when supported | Same list, decoded by FFmpeg                                                                         |
| Encode video          | H.264; hardware-supported HEVC/AV1                 | Same                                                                                                 |
| HLS / audio selection | Yes / yes                                          | Yes / yes                                                                                            |
| Client subtitles      | WebVTT                                             | WebVTT, ASS                                                                                          |
| Sidecar-only delivery | None                                               | None                                                                                                 |
| Embedded subtitles    | None                                               | ASS, SSA, PGS, VobSub, DVB, SRT, WebVTT, TX3G                                                        |
| Dolby Vision          | Hardware/display-gated profiles 5/8                | Not advertised                                                                                       |

Both profiles apply audio conversion and codec preferences and send the locale's
base language. The server alone chooses playback methods and tracks.

## Verification and gaps

- Core `swift build` and `swift test` passed, 257 tests in 33 suites.
- MatineeMPV built for iOS Simulator and tvOS Simulator with derived data in
  `apps/ios/build/MPVDerivedData`.
- The generated Matinee project built for generic iOS Simulator.
- Root `pnpm verify` passed under Node 24 / pnpm 11 through Nix.
- Real playback is **unverified**. Installed and launched on
  `matinee-player-iphone`. The app showed "Server nicht erreichbar" for
  localhost:18420. The fixture health endpoint was healthy, but its auth config
  response lacks the `loginBackdrop` field required by this checkout's generated
  `AuthConfig`. No fixture or server code was changed to bypass that mismatch.
  No MKV pixels, direct-play method, seeking, audio switch, or subtitle switch
  was observed. Those still require a compatible fixture.
- Debug simulator app size was 106 MiB before linking mpv and 202 MiB after,
  from `du -sh`. This is not a release archive or App Store download measurement.

| Feature in this integration                | Status                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| AirPlay video handoff                      | Does not work: not wired. MPVUI's experimental local conversion is not enabled.                 |
| Picture in picture                         | Does not work: existing AVKit surface is only used for AVPlayer.                                |
| Lock-screen commands / audio interruptions | Existing controller implementation retained; not tested with mpv.                               |
| tvOS display matching                      | MPVUI surface supplies hints by default; not tested on hardware. No tvOS app target yet.        |
| Offline playback                           | File URL and embedded-track paths implemented; not tested with mpv.                             |
| HDR / ASS / bitmap rendering               | Implemented through MPVUI; not tested on hardware.                                              |
| Fill geometry                              | mpv panscan wired; not tested.                                                                  |
| Plain embedded subtitle styling            | Existing app caption renderer and preferences retained; not tested with mpv.                    |
| Diagnostics                                | Track selection and native sample-frame counters implemented; AVPlayer access logs unavailable. |

No runtime claims above should be read as playback evidence. Policy ceilings
and format lists are source-based assumptions pending actual media tests.
