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
- Simulator playback was exercised on `matinee-player-iphone`, iOS 27.2,
  against the shared fixture at revision `3b7ff41`. Interstellar's HEVC/AC-3
  MKV displayed its timecode and English embedded SRT. Its copied playback
  report contains one attempt, `direct reason=start at=0s -> playing`, with
  HEVC and AC-3 tracks. No remux or encode was requested in that sitting.
- The Matrix's MP4 displayed advancing timecodes. Pausing held at 1:52;
  forward/back buttons moved to 2:02 and back to 1:52. Resuming advanced
  again. Selecting 1.25x changed the finish estimate. The audio menu changed
  from English to German, and the report selected audio #2. This was not a
  listening test or a measured rate-accuracy test.
- Selecting `360p, 1 Mbit/s` produced an HLS `quality_change` attempt with
  `video_to=h264 -> playing`. Screenshots showed 2:09.9 before loading and
  2:28.5 afterward. The final report had no failed attempts.
- Closing that sitting left server watch progress at 151.7 seconds with
  `completed=false`; Home showed a partly watched Matrix entry.
- AVPlayer was selected in Settings and the Matrix MP4 displayed advancing
  timecode at 1:07. This is a basic regression smoke test, not coverage of
  every AVPlayer path.
- Subtitle coverage is incomplete. Embedded English text was visible in the
  MKV. Toy Story's sidecar was not captured during an active cue. Jurassic
  Park's PGS selection reached the adapter as ordinal 2 and mpv listed the
  PGS track, but screenshots did not establish bitmap rendering. PGS and ASS
  are not certified by this pass. No profile claims were changed on that
  inconclusive evidence.
- Early runs reached freeze-triggered fallback through direct, stream and
  HLS to an unplayable message. Later clean-build runs played normally.
  The cause of the earlier failures remains unresolved. A deliberately broken
  source and recovery were not tested, so fallback is not certified.
- Screenshots were taken with `xcrun simctl io ... screenshot` and inspected.
  Local evidence is in `apps/ios/build/MPVVerification/`, not tracked in Git.
  The diagnostic report still hardcodes an AVPlayer heading and empty AVPlayer
  statistics even for mpv. Use its `engine` and `attempts` fields instead.
- The unsigned simulator build could not retain authentication. Testing used
  an ad-hoc signed simulator build with `CODE_SIGNING_ALLOWED=YES
  CODE_SIGN_IDENTITY=-`, after `clean build`, in `apps/ios/build/DerivedData`.
  The first Core test run failed the existing search cancellation timing test;
  an unchanged rerun passed all 257 tests. Root `pnpm verify` passed.
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
| Plain embedded subtitle styling            | English SRT displayed on the simulator; accessibility preference variations not tested.         |
| Diagnostics                                | Track selection and native sample-frame counters implemented; AVPlayer access logs unavailable. |

The observations above cover only these synthetic fixtures on this simulator.
Policy ceilings and untested format lists remain source-based assumptions.
