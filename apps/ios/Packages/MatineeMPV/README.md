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

## Initial verification and gaps

This section records the first pass. The follow-up below supersedes its
subtitle and diagnostics gaps; other limits still apply.

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

## Follow-up verification

Tested on `matinee-player-iphone`, iOS 27.2, against the existing server at
`http://localhost:18420`. No fixture reset, server restart, contract change,
or server change was made. The app was built ad-hoc signed into
`apps/ios/build/DerivedData`. Evidence is local and git-ignored under
`apps/ios/build/MPVVerification/followup-*`.

### Early all-source failures: not reproduced, not fixed

The follow-up reinstalled the signed build twice and terminated and relaunched
the app. First playback after those launches worked. Jurassic Park, the new
styled MKV, Toy Story and the Matrix played, and repeated Matrix sittings
worked after closing and reopening the player. First-frame reports include
0.54, 0.58, 1.26 and 1.55 seconds. None of these sittings recorded a freeze or
an all-source failure. This does not reproduce the original problem.

A full simulator shutdown and boot reached the signed-in Home screen, saved as
`followup-cold-launch.png`, but agent-device's accessibility bridge then timed
out. Playback after that boot was not established. A fresh uninstall/install,
rapid cross-title stress loop and an AVPlayer-to-mpv settings switch were not
completed in this follow-up. Do not read this as a complete cold-start matrix.

Code inspection narrows the candidates without identifying the original cause:

- `load` requests paused playback and waits up to 20 seconds for readiness.
  The controller starts playback only after load and track selection. The
  freeze watcher requires `playing`, a shown surface, and nonzero video size,
  so it does not count ordinary paused loading against its five-second limit.
  It can still fire before the first frame if mpv reports playing and dimensions
  but produces no sampled native frames for five seconds. There is no explicit
  first-frame grace period after readiness.
- Load checks cancellation and the MPVUI generation while waiting. MPVUI resets
  readiness, frame flags, media information and diagnostics on load and rejects
  old generation emissions. The controller resets FreezeWatch on each source.
  These guard against stale-load state; they do not prove every renderer race
  impossible. Each screen creates its own engine.
- MPVUI constructs its session in MPVPlayer's initializer; the adapter does not
  send its first load to a session created only by attaching the view. The
  adapter waits for file readiness before applying track ordinals.
- A 20-second cold load timeout and delayed native decoder/output initialization
  remain possible. The integration uses sample-buffer output, not Metal, so
  direct Metal-output initialization is not the applicable renderer candidate.
  No timing or watchdog behavior was changed without a failing reproduction.

### Subtitle rendering

All four requested paths were visible during an active cue:

| Path                | Evidence                                               | Observation                                                                                                                            |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Embedded PGS        | `followup-pgs-playing.png`                             | Jurassic Park at video time 6.0 seconds shows the fixture's rectangular bitmap at the bottom.                                          |
| Embedded styled ASS | `followup-embedded-ass.png`                            | Yellow, outlined text at authored position 80,140, not the app's plain-text style. Selected German ASS, the embedded track.            |
| External ASS        | `followup-external-ass.png`, `followup-ass-report.txt` | Selected English ASS sidecar. Yellow authored text visible; report says `ass sidecar ... drawn_by=player`, one direct playing attempt. |
| SRT sidecar         | `followup-sidecar-srt.png`, `followup-srt-report.txt`  | Toy Story at video time 4.7 seconds shows `English test subtitle` in the app's caption box.                                            |

The added movie is `movies/MPV Styled Verification/MPV Styled Verification.mkv`
in the shared fixture. It loops Toy Story's synthetic H.264/AAC pattern to
120 seconds, muxes a German-tagged ASS track and has a matching `.en.ass`
sidecar. The ASS cue runs from 1 to 115 seconds, uses yellow Arial with a black
outline and `\\pos(80,140)`. Only the Movies library was asked to scan.

The adapter uses MPVUI's default sample-buffer output. MPVUI 0.10.0's
`Build/RENDERING.md` explicitly supports subtitle composition for ordinary
sample-buffer video. Its native Dolby Vision exception does not apply to
this MPEG-2 PGS fixture. Dolby Vision remains unadvertised. The earlier PGS
non-observation is not evidence of an unsupported output path. In this pass,
seeking a paused item after EOF left a black surface until playback resumed;
`followup-pgs-active4.png` captures that black surface, not a valid subtitle
failure. The playing capture at 6.0 seconds establishes the bitmap rendering.
No subtitle-engine fix or device-profile change was needed.

### Deliberate failure and fallback

Two corrupt-source experiments used only the newly added verification MKV;
its intact bytes were restored afterward and Movies was scanned again.

1. Replacing it with a short invalid file caused the server to reject start
   before handing out a source. The screen gave an actionable unreadable-file
   message and Retry. See `followup-corrupt-server-rejection.png`.
2. After rescanning the intact file, replacing its bytes with zeros while
   preserving size and mtime retained the probed source decision. mpv failed
   opening the direct source. `followup-corrupt-report.txt` records
   `direct reason=start at=92s -> failed`, `MPVCore.MPVPlayerError (1)`,
   `type=source`, and `start_failed x1`. The controller requested fallback,
   but the server rejected that request with `Can't find a point to start this
   file from.` The user saw an unplayable screen and Retry, captured in
   `followup-corrupt-unplayable.png`. There was no second playable source in
   that report. This establishes error propagation and a clear terminal failure,
   not successful playback of a fallback.

An intentional stream HTTP error, mid-play network stall and successful
mpv-to-next-source recovery were **not established** in the simulator.
Existing Core fake-engine tests cover failed load, mid-sitting failure and
stall fallback, but are not substitutes for those integration tests.

### Audio switching

The Matrix's synthetic AAC tracks are English 440 Hz and German 880 Hz, per
`media.py`. Switching German to English and then English to German in another
sitting changed mpv's observed active audio ordinal, not just the server pick.
`followup-audio-english-report.txt` has `active_audio=1 audio_codec=aac`;
`followup-audio-german-report.txt` has `active_audio=2 audio_codec=aac`.
Both are direct, playing sources. These fields sample MPVUI's selected audio
track and active audio codec during playback. This is engine-property evidence,
not an audio recording or a claim that a human heard the tone change. Speaker
output and route behavior still need a listening or capture test.

### Playback report

Core now accepts an optional typed mpv statistics snapshot through PlaybackEngine.
The controller samples it on its normal tick. The report prints `player: mpv`
and mpv counters instead of an AVPlayer heading, access-log zeros and AVPlayer
buffer booleans. Missing observations remain `unknown`. Decoder reports use
mpv's codec and software/hardware session observation, not the requested decoder
preference; `decoder` here identifies the codec, not a private FFmpeg decoder
implementation name. The output is the adapter's fixed sample-buffer path.
Active audio ordinal is one-based within mpv's audio-track list, not the file's
global stream index.

Example from `followup-audio-german-report.txt`:

```text
player: mpv
engine: mpv, decoders: hardware
mpv: decoder=h264 decode=software video_output=sample-buffer decoder_dropped_frames=0 output_dropped_frames=0 samples=141 active_audio=2 audio_codec=aac
```

`decoders: hardware` is the saved preference, while `decode=software` is the
actual observed simulator session. Three new Core report tests check mpv
formatting, missing-snapshot handling and retention of AVPlayer statistics.

### Final checks and remaining device work

- Core passed 260 tests in 34 suites. A later full run hit the existing
  `BrowseTests.aNewQueryCancelsTheSearchStillOut` timing failure at line 198,
  `server.cancelled == ["dune"]`. An unchanged rerun passed all 260. Logs are
  `followup-core-timing-failure.log` and `followup-core-rerun.log`.
- Ad-hoc signed generic iOS Simulator build passed with derived data at
  `apps/ios/build/DerivedData`.
- Required root `nix shell nixpkgs#nodejs_24 nixpkgs#pnpm_11 -c pnpm verify`
  was run but is blocked at formatting by the other agent's
  `apps/ios/Packages/MatineeKit/README.md`. That file was not changed by this
  pass. Running lint, typecheck and both generated-client checks separately
  passed. Full verify is not a pass until that unrelated formatting issue is
  resolved.
- No mpv device-profile fields changed. ASS and embedded PGS now have positive
  simulator rendering evidence; external PGS and Dolby Vision stay omitted.
- Physical hardware is still needed for VideoToolbox decoder selection,
  acceleration, HDR color and subtitle luminance, output routes and listening,
  and renderer behavior on a device. Simulator software decoding neither
  certifies nor disproves those paths. The original intermittent startup failure
  and the untested network-fallback scenarios remain open on both platforms.

The observations above cover only these synthetic fixtures on this simulator.
Policy ceilings and untested format lists remain source-based assumptions.
