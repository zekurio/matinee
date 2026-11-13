# Player core

`PlayerController` is `@Observable` and `@MainActor`. Construct one per file
with a `MatineeApi`, `playbackDevice(prefs)`, `PlayerPrefs`, the account's
`PlaybackPreferences`, and an async token provider. No dependency on Session.
Call `await stop()` before discarding it. The token provider must belong to
the same server as the API. Downloads and queued reports likewise belong to
that server; the `PlayerDownloads` implementation must enforce that boundary.

## View contract

- Attach `player` to an `AVPlayerLayer`. Set `surfaceShown` when video is
  visible. Set `pictureInPictureActive` from the AVKit delegate. The view
  owns AVKit presentation and restoration, not the media session.
- `start(itemId:at:sessionId:)` asks the server; `startLocal(itemId:)` asks
  the injected downloads implementation. `item` is nil until opening ends.
- Observe `position`, `duration`, `buffered`, `playing`, `loading`, `ended`,
  `speed`, `videoAspect`, `source`, `error`, `refusal`, and `notice`.
- `play`, `pause`, `togglePlay`, `pickSpeed`, async `seekTo` and `skip`.
- Observe `audio`, `subtitle`, `quality`, `audioTracks`, `subtitles`,
  `qualities`, `offersOriginal`, and `options`. Call async `pickAudio`,
  `pickSubtitle`, or `pickQuality`. `burnsIn` describes a subtitle's rendering.
- Render `cues?.at(position)` using each cue's styled spans and
  `subtitleLook(prefs)`. `subtitleError` allows a load-error affordance.
  Re-read the system look when returning from Accessibility settings.
- `beginScrub`, `scrub(to:)`, async `endScrub(commit:)`; observe
  `scrubPosition`. `trickplayFrame(at:)` gives a tile URL and pixel crop.
  Use `mediaRequest(url:)` for authenticated artwork and tile requests.
- Observe `next` and `nextCountdown`; call `cancelNext` or `playNext`.
  Set `onNext` to stop/dispose this sitting and open the next item. Like
  Android, the ten-second countdown starts after the file ends.
- `retry`, `dismissNotice`, async `report` and `stop`.
- Lock-screen controls start automatically. `enableNowPlaying(title:subtitle:)`
  replaces their title with the view's localized label. Artwork is fetched
  with the same bearer token. Skip commands use the account's configured steps.
- About can observe `PlaybackDiagnostics.shared.report`; `formatReport`
  serializes it and `PlaybackDiagnostics.clear()` discards it.

## Capability sources, historical

The Device description section below supersedes this earlier snapshot.

Video codecs come from VideoToolbox hardware-decode queries, including AV1.
Audio codecs come from AudioToolbox's installed decode-format IDs. The
containers are MP4, M4V and MOV; HLS uses AVPlayer's native fMP4/TS path.
WebVTT is drawn by the view; no picture or ASS subtitle support is claimed,
so the server chooses burn-in when needed. Audio selection in a direct file
maps the server's picked audio to the AVFoundation media-selection group.

The conservative maximum rectangle is 3840x2160 or its portrait equivalent.
VideoToolbox has no MediaCodec-style maximum-dimensions query. HDR10/HLG/Dolby
Vision on iOS come from AVPlayer's available HDR modes. Native Dolby Vision
is restricted to HEVC single-layer profiles 5 and 8. macOS has no equivalent
per-format API, so this implementation conservatively advertises no HDR on
Mac, rather than claim the capabilities of an iPhone. Route channel count
is read on iOS and exposed in the capability snapshot.

The current wire contract has no max-bitrate, channel-count or passthrough
field. These cannot be sent without a contract change. `convertAudio` removes
formats the user wants converted; quality and account limits stay server
choices. Codec preferences reorder only supported codecs. Preferences are
device-wide, matching Android's `player` preferences, not account settings.

## Verification

From the package directory:

```sh
swift build
swift test
xcodebuild -scheme MatineeCore -destination 'generic/platform=iOS Simulator' build
```

The live test is disabled by default. Give it a token file from
`apps/ios/scripts/dev/token ios-admin`, and a JSON fixture manifest containing
`[{"id":"media-item-uuid","path":"fixture-relative-path"}]`. A local manifest
can be produced using the dev fixture's `dev.sql` helper and this query:

```sql
SELECT json_agg(json_build_object('id',id,'path',relative_path)) FROM media_item;
```

Run under the dev scripts' PostgreSQL environment, or `nix shell
nixpkgs#postgresql_17`, to make `psql` available. Never commit the token file.

```sh
MATINEE_PLAYER_LIVE=1 \
MATINEE_PLAYER_TOKEN_FILE=/path/to/private-token \
MATINEE_PLAYER_ITEMS_FILE=/path/to/manifest.json \
swift test --filter fixturePlayback
```

The test asserts advancing playback, the direct-file audio selection, text
cue loading, long-file HLS seeks at 120 and 30 seconds, PGS burn-in selection,
and accumulated failed methods after an injected source failure. It reports
progress and closes each session. It skips show episodes and the extra MP4
because those repeat the direct-play fixture.

The shared server was checked with the actual Mac profile. Direct MP4 and
HLS play, including authenticated playlists and segments. Remux answers fail
with AVFoundation code -11850 and fall back through a fresh `playback.start`
with `remux` in `failed`. The server README documents the missing byte-range
support on copied streams. No client rule bypasses that decision.

Not yet verified on physical hardware: HDR color output, Dolby Vision, AirPlay,
PiP restoration, lock-screen artwork, headphone removal, audio interruptions,
and freeze detection on a visible layer. The Mac live test checks clocks and
server-selected subtitle delivery, not subtitle pixels or HDR color accuracy.
The report now includes bounded attempts and outcomes, named failure notes,
allowlisted settings, file formats and capability codec lists, format descriptions,
access-log rates, stalls and dropped frames. It also records elapsed time from
`start` to the first decoded frame observed by the video output. This is not a
measurement of a frame reaching a physical display.

## Second-pass audit, incomplete

This pass is **not the completed parity audit**. Only the members below have
been compared directly. Unreviewed members are not classified as platform
exclusions. The remaining audit must cover all the other Kotlin members,
especially diagnostics privacy and error chains, in-flight request replacement,
subtitle engine modes, device profiles, preferences, service/activity lifecycle,
and the screen's callers. The remaining PlaybackDevice, Playback and
PlaybackDiagnostics Kotlin test cases still need to be ported.

| Kotlin member                                                                                                                | Swift member                             | Comparison                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Picks.plus`                                                                                                                 | `Picks.merging`                          | Same. Absent changes keep the sitting's picks.                                                                                                                                                                                 |
| `Asking.pick`, `fail`, `forgetFailures`, `input`, `settle`                                                                   | Same names                               | Same arithmetic and branch structure in `Playback.swift`; exhaustive fixture tests of settle remain outstanding.                                                                                                               |
| `refusal`                                                                                                                    | `refusal`                                | Same codes. Both controller refusal paths now have URLProtocol tests.                                                                                                                                                          |
| `Source.mode`, `kind`, `position`, `startMs`, `seeksItself`, `holdsTracks`, `seek`, `fileSeconds`, `sourceMs`, `of`, `local` | `Source`                                 | Same file/source timeline model. Controller tests exercise direct, remux and HLS seeks.                                                                                                                                        |
| `sameSource`, `burnedIn`                                                                                                     | `sameSource`                             | Same source comparison. More controller-level pick tests are still needed.                                                                                                                                                     |
| `CueTrack.at`, `parse`, `seconds`, `unescape`, `styled`                                                                      | `CueTrack`                               | Same bounded 16-cue backward search, timing parser and tag/entity handling. Cue positions are ignored by Kotlin too; not newly implemented here.                                                                               |
| `seekable`, `seekClamp`, `seekFraction`, `seekAt`, `seekSteps`, `seekStepped`                                                | Same names                               | Same. All six Kotlin SeekTest cases ported separately.                                                                                                                                                                         |
| `FreezeWatch.frame`, `check`, `reset`                                                                                        | Same names                               | Same. All five Kotlin FreezeWatchTest cases ported separately.                                                                                                                                                                 |
| `PlayerController.fallBack`                                                                                                  | `sourceFailed`                           | Same server-directed failed-method chain; direct to remux to transcode tested.                                                                                                                                                 |
| `PlayerController.retry`                                                                                                     | `retry`                                  | Same reset of failed methods; fake-engine test confirms direct is offered again.                                                                                                                                               |
| `PlayerController.seekStream`                                                                                                | `seekTo`, `.newStream`                   | Same use of server offset and nearest snapping. Stub verifies returned stream replaces current source.                                                                                                                         |
| `PlayerController.tick` played-time accumulation                                                                             | `tick`                                   | Corrected: no one-second cap. Counts elapsed playback time times speed, as Kotlin does. Wall clock is injectable for tests; freeze still uses uptime.                                                                          |
| `PlayerController.report`                                                                                                    | `report`                                 | Same 10-second playing / 30-second paused cadence, transition reports and queued failure path tested. Offline aggregate-play upload is not audited.                                                                            |
| `PlayerController.release`                                                                                                   | `stop`                                   | Differs because Swift has explicit async disposal. Stop now sends only one close report even if called twice.                                                                                                                  |
| `DiagnosticsNote`                                                                                                            | `DiagnosticsNote`, `PlaybackReport.note` | Same six named notes, counted without retaining server messages.                                                                                                                                                               |
| `AttemptOutcome` replacement and closure                                                                                     | `PlaybackReport.attempt`, `close`        | Corrected replacement of playing attempts and closure of the final attempt.                                                                                                                                                    |
| ExoPlayer renderers and decoder listeners                                                                                    | `AVPlayerEngine`, `DiagnosticsProbe`     | Differs because AVPlayer owns decoder selection. Format descriptions and access/error logs replace Media3 callbacks. Renderer factory and MediaCodec decoder initialization callbacks have no AVPlayer API and are not ported. |
| mpv subtitle overlay                                                                                                         | No AVPlayer overlay                      | Not ported because it belongs to mpv, which is outside the AVPlayer engine. The device description does not claim PGS/ASS rendering.                                                                                           |

### Verification of this increment

- macOS `swift build` and `swift test` passed, 44 enabled tests versus 30
  before this increment. No compiler warnings were emitted for these changes.
- iOS Simulator package build passed with the requested `xcodebuild` command.
- Root `pnpm verify` passed under Node 24 / pnpm 11.
- Before and after live tests passed for all seven movie fixtures. Audio,
  WebVTT, PGS burn-in and long-file encode seeks remained working.
- Start to first decoded frame after the remux -11850 fallback: Interstellar
  0.353 s, Blade Runner 0.304 s, Dune 0.326 s. These results use the shared
  server's warm transcode cache. Remux remains honestly advertised and remains
  in the sitting's failed list. A cold encode and physical display latency
  have not been measured.

## Supporting pieces and offline join, partial audit

This increment does not complete the supporting-piece audit. Capabilities,
PlaybackDevice's member-by-member implementation audit, NowPlaying/PlaybackService, the download
worker's Kotlin parity and off-main file IO remain unreviewed. The fixed decoder
rectangle has not been experimentally checked. The four applicable Kotlin
PlaybackDevice test cases are ported in CapabilitiesTests, with AVPlayer's
container/audio/subtitle expectations instead of ExoPlayer's. The two mpv tests
are not ported because that engine is deferred.

### Compared members

| Kotlin member                                                                                 | Swift member                                               | Comparison                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerPrefs.ORIGINAL_QUALITY`, `AUTOMATIC`                                                   | Same constants in the API layer                            | Same contract values.                                                                                                                                                                                            |
| `Decoders`                                                                                    | `Decoders.hardware`, `PlayerPrefs.decoders`                | Differs because AVPlayer owns decoder selection; no software preference API.                                                                                                                                     |
| `PlayerEngine`                                                                                | `PlayerEngine.avPlayer`, `PlayerPrefs.engine`              | Differs because ExoPlayer is Android-only and mpv is deferred by the iOS plan.                                                                                                                                   |
| `SubtitleColor`                                                                               | `SubtitleColor`                                            | Same choices and exact sRGB colors after removing rounded components.                                                                                                                                            |
| `SubtitleBackground`                                                                          | `SubtitleBackground`                                       | Same none, shaded and black choices.                                                                                                                                                                             |
| `SubtitleEdge`, `OWN_SUBTITLE_EDGES`                                                          | Same names                                                 | Same five system edges and three own-style choices.                                                                                                                                                              |
| `SUBTITLE_SCALES`                                                                             | Same name                                                  | Same five sizes.                                                                                                                                                                                                 |
| `PlayerPrefs.quality`                                                                         | Same name                                                  | Same default, global device scope and storage key. Account limits do not overwrite it.                                                                                                                           |
| `videoCodec`, `audioCodec`, `convertAudio`                                                    | Same names                                                 | Same defaults, device scope and snake_case keys.                                                                                                                                                                 |
| `autoplayNext`, `fillScreen`, `pictureInPicture`                                              | Same names                                                 | Same defaults, device scope and snake_case keys.                                                                                                                                                                 |
| `matchFrameRate`                                                                              | None                                                       | Not ported because this is Android TV display-mode switching; TV is out of scope.                                                                                                                                |
| `subtitleSystemStyle`, `subtitleScale`, `subtitleColor`, `subtitleBackground`, `subtitleEdge` | Same names                                                 | Same defaults, device scope and snake_case keys.                                                                                                                                                                 |
| `Stored.getValue`, `Stored.setValue`                                                          | Observable properties and `save`                           | Differs because Swift Observation and UserDefaults replace Compose state and SharedPreferences.                                                                                                                  |
| `string`, `strings`, `boolean`, `float`, `enum` storage helpers                               | `PlayerPrefs.init`, `save`                                 | Differs because UserDefaults stores a typed dictionary under `player`, rather than a separate SharedPreferences file. Invalid enum values fall back to defaults.                                                 |
| `SubtitleLook`                                                                                | `SubtitleLook`                                             | Same style fields; a CoreText font name replaces Android FontFamily.                                                                                                                                             |
| `COLORS`, `SubtitleColor.color`                                                               | `subtitleLook` color switch                                | Same exact byte colors.                                                                                                                                                                                          |
| `rememberSubtitleLook`, `systemLook`                                                          | `subtitleLook`, `SystemCaptionStyle`                       | Differs because MediaAccessibility supplies platform caption defaults. A process-lifetime CF notification observer increments an observable revision, so renders reading `subtitleLook` follow Settings changes. |
| `SubtitleLine` and PlayerScreen drawing                                                       | No view in this increment                                  | Not ported because this task excludes views. Edge rendering, padding and line height still need a view audit.                                                                                                    |
| `Cue.start`, `end`, `text`                                                                    | `Cue.start`, `end`, `spans`, `text`                        | Same timeline; styled spans replace AnnotatedString.                                                                                                                                                             |
| `CueTrack.at`                                                                                 | Same name                                                  | Same sorted binary search and bounded 16-cue backward lookup, with exclusive end time.                                                                                                                           |
| `TIMING`, `seconds`                                                                           | Local timing regex and `seconds` in `parse`                | Same hours, decimal comma and cue settings handling.                                                                                                                                                             |
| `TAG`, `unescape`, `styled`                                                                   | `styled` and its entity loop                               | Same bold/italic/underline nesting and six entities. Other tags are removed, preserving their text, including ruby annotation text.                                                                              |
| `CueTrack.parse`                                                                              | Same name                                                  | Differs because NOTE, STYLE and REGION blocks are explicitly skipped even if they contain timing arrows. Identifiers, BOM header, CRLF, multiline and overlapping cues are tested.                               |
| `baseLanguage`, `sameLanguage`, `deviceLanguage`, `isCommentary`                              | `sameLanguage`, `profileLanguage`, inline commentary check | Same base-tag comparison for tested ordinary language tags; malformed Locale tag fallback has not been audited.                                                                                                  |
| `downloadAudio`                                                                               | Same name                                                  | Same primary, preferred/original language, channel ranking and decodable same-language stand-in rules on inspection; dedicated tests remain outstanding.                                                         |
| `drawable`, `bestInLanguage`, `forcedTrack`, `downloadSubtitle`                               | `downloadSubtitle` filter and local `best`                 | Same mode branches and score on inspection; dedicated tests remain outstanding.                                                                                                                                  |
| `downloadSubtitleShow`                                                                        | None                                                       | Not ported in this increment. AVPlayer cannot claim embedded PGS/ASS support; saved WebVTT uses the controller's existing screen-cue path.                                                                       |
| `PlayerController` local open and pending reports                                             | `DownloadPlayerAdapter.playback`, `queueReport`            | Same saved video, audio list, subtitle URLs, pending-or-server position, last-position report and cumulative sitting report. Adapter binds one server independently of the selected-server UI.                   |
| `PlayerScreen.downloadNext`                                                                   | `DownloadPlayerAdapter.next`                               | Differs because it selects the next completed, existing local episode without a network request. Android asks the offline API's title-item list. Specials and duplicate episode editions still need comparison.  |

### Integration and remaining protocol gap

Construct `DownloadPlayerAdapter(downloads: downloads, server: origin)` per
server and pass it to `PlayerController`'s `downloads` argument. Keep that origin
the same as the controller's API. No controller or diagnostics owner files changed.

For exact sitting timestamps, `PlayerDownloads.queueReport` needs an additional
`startedAt: Date` argument carrying the controller's sitting start. It currently
supplies only played time. The adapter estimates the first start as now minus
played time and keeps it stable. This loses paused/buffering time before the
first report. No protocol change was made here. Its nonthrowing report method
also cannot tell the controller about a local persistence failure; that is logged.

The worker still assembles files and writes the index on the main actor. No
large-append actor test was added. This remains a required follow-up, not a
platform exclusion.

### Verification of this partial increment

- macOS build and 69 enabled tests in 17 suites passed, with no compiler warnings.
  Fourteen new tests cover capability profile assembly, cues, preference defaults/persistence, caption style and
  notifications, server-bound offline playback, queued reports and next episodes.
- iOS Simulator package build and root `pnpm verify` passed.
- Live downloads passed for The Matrix original and Jurassic Park encoded version.
  Both played through PlayerController, loaded saved subtitles, sought beyond ten
  seconds and queued reports using an unreachable API. Pending reports then
  flushed through the real API, and local downloads were removed.
- The existing seven-movie live player test passed, including two-language direct
  MP4 selection, long HLS seeks and PGS burn-in. Remux still fails with -11850 and
  falls back through the server.

### Earlier capability report and audio experiment, historical

The current probe reports MP4/M4V/MOV; H.264 8-bit, HEVC and AV1 10-bit;
3840x2160 and 2160x3840 rectangles for each; no HDR; AAC, MP3, Opus, FLAC,
ALAC, AC-3, E-AC-3 and PCM in files; Opus, AAC, MP3, FLAC, ALAC, AC-3 and
E-AC-3 in HLS; H.264/HEVC/AV1 encodes; audio selection enabled; WebVTT
screen subtitles with no sidecar/embedded engine subtitle formats. Language
is `de` on this Mac. Profiles and maxLevel are nil. Dolby Vision fallback
profiles are currently 0,1,2,3,4,6,7,8,9,10. That inherited fallback still needs
the requested per-codec audit, especially for non-HEVC decoders.

A manual AVPlayer experiment generated six-second, mono 48 kHz 440 Hz sine
files using ffmpeg 9.0.2, one each with libopus, flac, ac3 and eac3 encoders.
MP4 used `-strict -2`; HLS copied each audio stream using
`-hls_segment_type fmp4 -hls_time 2 -hls_playlist_type vod`, with distinct
init filenames. MP4 was opened as a local file and fMP4 HLS over loopback HTTP.
All eight reached readyToPlay, advanced approximately three seconds and
reported no error. These are audio-only synthetic files, not an exhaustive
codec/profile/channel test or a physical-device listening check.

| Audio  | Local MP4 time after 3 s | fMP4 HLS time after 3 s |
| ------ | ------------------------ | ----------------------- |
| Opus   | 2.828 s                  | 3.084 s                 |
| FLAC   | 3.008 s                  | 2.910 s                 |
| AC-3   | 3.077 s                  | 2.899 s                 |
| E-AC-3 | 3.063 s                  | 2.896 s                 |

An initial HTTP MP4 attempt through Python's non-range server failed for all
four with -11850. Local files removed that transport confound. No capability
was removed based on that failure. The two-language live MP4 fixtures selected
German audio successfully, confirming direct-file AVMediaSelectionGroup use.

- `PlayerDownloads` is unchanged. `PlaybackEngine` gained internal state and
  transport methods for fake engines; the view's public construction API is
  unchanged. An internal initializer accepts a fake engine and a report clock.

## Device description

This pass narrows unsafe claims but does not finish the hardware-limit audit.
The table describes the implemented wire values, not a physical-device certification.

| Contract field                  | iOS value and source                                                                           | Why, and limits of the claim                                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containers`                    | `mp4`, `m4v`, `mov`, AVFoundation file readers                                                 | MP4 HTTP tests below; M4V/MOV remain reader-family claims, not separately tested here. No MKV claim.                                                                                                            |
| `video`                         | Hardware-supported H.264, HEVC, AV1 from `VTIsHardwareDecodeSupported`                         | No software AV1 claim. Each codec produces landscape and portrait entries.                                                                                                                                      |
| decoder `codec`                 | ffmpeg names mapped from CoreMedia codec constants                                             | Matches the server's codec comparison.                                                                                                                                                                          |
| decoder `maxWidth`, `maxHeight` | 3840x2160 and 2160x3840                                                                        | Conservative delivery envelope from Apple's HLS authoring 1.25, not a system-discovered maximum. This is still a policy ceiling, not proof that every older hardware decoder takes 4K.                          |
| decoder `maxBitDepth`           | H.264 8; HEVC and AV1 10                                                                       | AVC High 10 excluded. HEVC Main and Main 10 only. No 12-bit or 4:2:2 claim.                                                                                                                                     |
| decoder `profiles`              | AVC Constrained Baseline/Baseline/Main/High; HEVC Main/Main 10; AV1 Main                       | Explicit profile names as ffprobe reports them, not unlimited profiles.                                                                                                                                         |
| decoder `maxLevel`              | AVC 52; HEVC 153; AV1 18                                                                       | Apple HLS authoring 1.3b, 1.6b, 1.37: AVC 5.2, HEVC 5.1, AV1 6.2, in ffprobe units. These are authoring ceilings, not discovered per-device limits.                                                             |
| decoder `hdr`                   | iOS `AVPlayer.availableHDRModes`, filtered to 10-bit decoders; Dolby Vision only on HEVC       | HDR10 and HLG remain separate. macOS requires `eligibleForHDRPlayback` and main-screen potential EDR headroom above 1, then permits HDR10/HLG, not Dolby Vision. No headless HDR claim.                         |
| decoder `dolbyVisionProfiles`   | HEVC 10-bit with Dolby Vision mode: `[5,8]`; otherwise `[]`                                    | Single-layer delivery only. Profile 7 and the inherited Android 0...10 fallback list are removed. Profile 8 subprofiles remain a contract limitation described below.                                           |
| `audio`                         | Installed AudioToolbox decoders intersected with AAC, Opus, FLAC, ALAC, AC-3, E-AC-3; plus PCM | HTTP MP4 results below. User conversion settings remove optional codecs. PCM remains the native MOV/file reader claim. MP3 removed after the ffmpeg MP4 failed to advance. DTS, TrueHD, MP2 are not advertised. |
| `streamAudio`                   | Opus, AAC, FLAC, ALAC, AC-3, E-AC-3, supported and not converted; AAC always available         | fMP4 HLS results below. A supported preference moves to the front; unsupported preferences cannot add a codec.                                                                                                  |
| `encodeVideo`                   | H.264, then hardware-supported HEVC/AV1                                                        | A supported preference reorders the list. The server chooses the encode and quality.                                                                                                                            |
| `hls`                           | `true`                                                                                         | AVPlayer's native HLS loader; live fixture test covers server encodes.                                                                                                                                          |
| `selectAudio`                   | `true`                                                                                         | AVMediaSelectionGroup selection; live two-language MP4 fixture.                                                                                                                                                 |
| `subtitles`                     | `[webvtt]`                                                                                     | App cue renderer draws `subtitlePath()` output independently of AVPlayer.                                                                                                                                       |
| `sidecarSubtitles`              | `[]`                                                                                           | No extra engine sidecar renderer.                                                                                                                                                                               |
| `embeddedSubtitles`             | `[]`                                                                                           | No engine subtitle claim, even if AVPlayer could display some formats itself.                                                                                                                                   |
| `language`                      | `Locale.language.languageCode`, fallback `en`                                                  | Base BCP 47 language, matching Android and server base-language matching. Region/extensions intentionally discarded.                                                                                            |

Apple's [HLS authoring specification](https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html)
is the source of the delivery ceilings above. The contract has no frame-rate
field. Apple's 60 fps authoring ceiling therefore cannot be sent. It also has
no bitrate, channel-count or spatial-video field. `VTIsStereoMVHEVCDecodeSupported`
would describe a different capability, not prove an ordinary HEVC rectangle.
The examined VT decompression/specification keys configure an existing session
or require hardware; they do not publish a codec-wide rectangle/profile/level
matrix. A complete `VTCopyVideoDecoderList` and `AVAssetVariant` investigation
and empirical High 10 rejection are still outstanding.

The server's `decodesVideo` ANDs `hdr` and `dolbyVisionProfiles`. Its probe labels
any Dolby Vision stream `dolby-vision`, even when its base layer is HDR10 or HLG.
The device schema cannot express “profile 8 with compatibility ID 1 on HDR10”
versus “profile 8 with compatibility ID 4 on HLG”. Claiming all profile 8 fallback
would therefore overclaim. Non-Dolby-Vision devices now conservatively reject
these streams. Completing fallback needs a server/contract change outside this
task's scope. Native profile 5/8 MP4 and HLS remain published-format claims,
not experimentally verified Dolby Vision samples in this pass.

### HTTP audio measurements

Six-second mono 48 kHz sine files, ffmpeg encoders `aac`, `libmp3lame`, `libopus`,
`flac`, `alac`, `ac3`, `eac3`, `dca`, `truehd`, `mp2`, MP4 `-strict -2`.
HLS copied each track into fMP4 with distinct init segments and two-second targets.
Both containers were fetched over loopback HTTP with byte ranges, confirmed as
206 responses for MP4. The simulator used a temporary SwiftUI AVPlayer host on
iPhone 18 Pro, iOS 27.2. Values are clock seconds after three seconds, not a
listening test or proof of every channel/profile combination.

| Audio  | Mac HTTP MP4        | Mac fMP4 HLS     | Simulator HTTP MP4  | Simulator fMP4 HLS |
| ------ | ------------------- | ---------------- | ------------------- | ------------------ |
| AAC    | 2.730               | 2.885            | 2.101               | 3.047              |
| MP3    | stalled             | error -16170     | stalled             | error -16170       |
| Opus   | 3.000               | 2.921            | 3.098               | 2.999              |
| FLAC   | 2.896               | 3.041            | 2.964               | 2.963              |
| ALAC   | 2.903               | 2.923            | 2.970               | 3.068              |
| AC-3   | 2.941               | 3.073            | 3.031               | 2.951              |
| E-AC-3 | 2.942               | 3.081            | 2.927               | 2.967              |
| DTS    | stalled             | error -16170     | stalled             | error -16170       |
| TrueHD | 2.992, inconclusive | error 1718449215 | 3.070, inconclusive | error 1718449215   |
| MP2    | stalled             | error -16170     | stalled             | error -16170       |

TrueHD MP4 is not a confirmed negative: the clock advances, so a decoded-audio
check is needed before calling that a rejection or adding support. MP3/MP2
produced ESDS parse errors. These results apply to these ffmpeg outputs, not
to every possible sample description. MOV/M4V have not been remeasured.

### Now Playing changes

`PlayerNowPlaying` retains its controller-facing initializer and methods.
Small internal player, info-center, command-center, artwork-loader and audio-session
protocols make the behavior testable without a real media session. It publishes
title, show name plus episode code for shows or year for movies, duration, file-timeline elapsed time, effective rate
and default speed. Source replacement keeps the file clock. An item ID change
replaces labels and clears artwork. Authenticated artwork is downsampled to at
most 600 pixels, cleared before replacement, and guarded against stale completion.

Play, pause, toggle, configured-step skips, scrub and next have availability gates
checked again in their handlers. Skip intervals are published to MediaPlayer.
The audio session uses playback/moviePlayback, activates only on playing, and
notifies other audio on disposal. Interruptions remember whether playback was
running, pause, and resume only with `shouldResume`. Headphone removal pauses.
Observers and command targets are removed on idempotent stop. Android's service
`onTaskRemoved` has no direct iOS equivalent; the controller still owns explicit
session disposal. Physical lock-screen, interruption and unplug behavior have
not been exercised on a phone.

### Verification of this pass

- Before: 105 tests in 21 suites. After: 112 tests in 22 suites. Six new Now
  Playing tests and one new per-codec HDR/profile test. The existing four
  applicable Android profile cases remain covered with native-player differences.
- macOS `swift build`, `swift test`, and the generic iOS Simulator package build
  pass without compiler warnings in the changed code.
- `swift format format` leaves the edited Swift files unchanged. Strict format
  lint additionally flags the pre-existing public `OPTIONAL_PASSTHROUGH` name;
  it was not renamed because callers must remain source-compatible.
- Root `pnpm verify` passes under Node 24 and pnpm 11.
- The opt-in seven-movie player fixture test passes after the profile changes,
  including authenticated direct playback, HLS seeks, WebVTT and PGS burn-in.
- Capability completion is still blocked on the profile-8 fallback contract
  limitation and remaining hardware-limit/sample validation noted above. The
  TrueHD MP4 experiment is expressly inconclusive, not a negative result.
