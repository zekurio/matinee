# MatineeMPV

GPL-3.0, see ../../LICENSE. MatineeCore remains dependency-free and MIT.
MPVUI is pinned to 0.10.0. Its wrapper is MIT; its Libmpv artifact contains
GPL mpv and FFmpeg.

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
the pinned FFmpeg recipe does not enable the `sup` demuxer. mpv draws its
own subtitles in its default font, not the app's Red Hat Text.

## Profiles

`MPVCapabilities.swift` lists a subset of the demuxers and decoders enabled by
MPVUI's `Build/Sources/MPVBuildCore/Recipes/FFmpegFlags.swift`. These are build
capability claims, not empirical certification of every file or profile.
AV1 keeps VideoToolbox's hardware gate because software AV1 is expensive.
The 3840-pixel and 8/10-bit ceilings are conservative policy, not discovered
software-decoder maxima. HDR remains filtered by the existing device probe.
Dolby Vision is deliberately omitted: MPVUI native DV cannot composite ASS and
bitmap subtitles, and the contract cannot describe that combination.

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

## What works

Seen on iOS and tvOS simulators, with software decoding, against the dev
server's test patterns (../../DEV.md):

- MKV with HEVC and AC-3 plays as the file, with no copied stream or encode.
- Embedded PGS, embedded styled ASS, an ASS sidecar, and an SRT sidecar all
  draw during a cue. The ASS keeps its own color and position.
- Switching audio changes mpv's active track, by the engine's own report.
- A first source that fails falls back to the server's next one
  ([MPV-INVESTIGATION.md](MPV-INVESTIGATION.md)).

| Feature                                   | Status                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| AirPlay video                             | Not wired. MPVUI's experimental local conversion is off       |
| Picture in picture                        | No. The AVKit surface is AVPlayer's alone                     |
| Lock-screen commands, audio interruptions | The controller's own, not tested with mpv                     |
| tvOS display matching                     | MPVUI's surface gives the hints, not tested on hardware       |
| Offline playback                          | File URLs and embedded tracks, not tested with mpv            |
| HDR, hardware decoding, audio output      | Not tested: simulators decode in software and nobody listened |
| Fill                                      | mpv's panscan, not tested                                     |
| A stall in the middle of playing          | Not tested                                                    |

## The playback report

`PlaybackEngine.mpvStatistics` hands the controller a snapshot on its tick,
and the report prints mpv's counters in place of AVPlayer's access log:

```text
player: mpv
engine: mpv, decoders: hardware
mpv: decoder=h264 decode=software video_output=sample-buffer decoder_dropped_frames=0 output_dropped_frames=0 samples=141 active_audio=2 audio_codec=aac
```

`decoders` is the saved preference and `decode` what the session did.
`decoder` names the codec, not FFmpeg's decoder. `active_audio` counts from
one within mpv's audio tracks, not the file's streams. What mpv didn't say
reads `unknown`.
