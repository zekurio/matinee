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

## Capability sources

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

### This Mac's capability report and audio experiment

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

## Playback diagnostics parity

This section covers `ui/player/PlaybackDiagnostics.kt` and
`ui/player/DiagnosticsProbe.kt`. It does not claim controller integration:
the existing calls still compile, but the controller owner must adopt the
richer overloads listed below. No views or player engines were changed.

Every named Kotlin declaration is listed below. Stored properties use the
same names unless the table names a replacement. `same` means the same
report semantics, bounds and privacy checks, not the same serialization.
The text report has English keys as Android does; reports stay in memory.

| Kotlin member                                    | Swift member                                            | Comparison                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_ATTEMPTS`                                   | `MAX_ATTEMPTS`                                          | same, 12                                                                                                                                                                                                                                                  |
| `MAX_TRACKS`                                     | `MAX_TRACKS`                                            | same, 4                                                                                                                                                                                                                                                   |
| `MAX_DECODERS`                                   | `MAX_DECODERS`                                          | same, 4                                                                                                                                                                                                                                                   |
| `MAX_CAUSES`                                     | `MAX_CAUSES`                                            | same, 3                                                                                                                                                                                                                                                   |
| `MAX_TOKEN`                                      | `Safe.token` default                                    | same, 48 ASCII bytes                                                                                                                                                                                                                                      |
| `Safe`                                           | `Safe`                                                  | same, private construction                                                                                                                                                                                                                                |
| `Safe.text`                                      | `Safe.text`                                             | same                                                                                                                                                                                                                                                      |
| `Safe.toString`                                  | `Safe.description`                                      | same                                                                                                                                                                                                                                                      |
| `Safe.OTHER`                                     | `Safe.OTHER`                                            | same                                                                                                                                                                                                                                                      |
| `Safe.allowed`                                   | `Safe.token` local allowed set                          | same, ASCII only                                                                                                                                                                                                                                          |
| `Safe.token`                                     | `Safe.token`                                            | same, trims edges, rejects rather than cleans free text                                                                                                                                                                                                   |
| `Safe.known`                                     | `Safe.known`                                            | same, lowercases allowlisted values                                                                                                                                                                                                                       |
| `Safe.mime`                                      | `Safe.mime`                                             | same                                                                                                                                                                                                                                                      |
| `Safe.of`                                        | `Safe.of`                                               | differs because Swift uses string-backed enums                                                                                                                                                                                                            |
| `Safe.constant`                                  | `Safe.constant`                                         | same, 64                                                                                                                                                                                                                                                  |
| `Safe.MIME_TYPES`                                | `Safe.mime` local list                                  | same                                                                                                                                                                                                                                                      |
| `KNOWN_VIDEO_CODECS`                             | `KNOWN_VIDEO_CODECS`                                    | same                                                                                                                                                                                                                                                      |
| `KNOWN_AUDIO_CODECS`                             | `KNOWN_AUDIO_CODECS`                                    | same                                                                                                                                                                                                                                                      |
| `KNOWN_CONTAINERS`                               | `KNOWN_CONTAINERS`                                      | same                                                                                                                                                                                                                                                      |
| `KNOWN_SUBTITLE_FORMATS`                         | `KNOWN_SUBTITLE_FORMATS`                                | same                                                                                                                                                                                                                                                      |
| `KNOWN_SUBTITLE_SOURCES`                         | `SelectionDiagnostics.of` local list                    | same                                                                                                                                                                                                                                                      |
| `KNOWN_DELIVERIES`                               | `SelectionDiagnostics.of` local list                    | same                                                                                                                                                                                                                                                      |
| `KNOWN_QUALITIES`                                | `safeQuality` generated list                            | same                                                                                                                                                                                                                                                      |
| `KNOWN_REASONS`                                  | `PlaybackReport.attempt` generated list                 | same                                                                                                                                                                                                                                                      |
| `KNOWN_HDR`                                      | `KNOWN_HDR`                                             | same                                                                                                                                                                                                                                                      |
| `KNOWN_SETTING_CODECS`                           | `KNOWN_SETTING_CODECS`                                  | same                                                                                                                                                                                                                                                      |
| `KNOWN_PROFILE_CODECS`                           | `safeCodecs` union                                      | same                                                                                                                                                                                                                                                      |
| `safeVideoCodec`                                 | `safeVideoCodec`                                        | same                                                                                                                                                                                                                                                      |
| `safeAudioCodec`                                 | `safeAudioCodec`                                        | same, bounded PCM code exception                                                                                                                                                                                                                          |
| `safeCodecs`                                     | `safeCodecs`                                            | same                                                                                                                                                                                                                                                      |
| `safeQuality`                                    | `safeQuality`                                           | same                                                                                                                                                                                                                                                      |
| `SourceMode`                                     | `SourceMode` in `Playback.swift`                        | same                                                                                                                                                                                                                                                      |
| `AttemptReason`                                  | `AttemptReason`                                         | same                                                                                                                                                                                                                                                      |
| `AttemptOutcome`                                 | `AttemptOutcome`                                        | same                                                                                                                                                                                                                                                      |
| `SubtitleRendering`                              | `SubtitleRendering`                                     | same                                                                                                                                                                                                                                                      |
| `TrackKind`                                      | `TrackKind`                                             | same                                                                                                                                                                                                                                                      |
| `DiagnosticsNote`                                | `DiagnosticsNote`                                       | same, six counted codes                                                                                                                                                                                                                                   |
| `DeviceDiagnostics`                              | `DeviceDiagnostics`                                     | differs because this describes Apple devices                                                                                                                                                                                                              |
| `DeviceDiagnostics.appVersion`                   | `appVersion`                                            | same, Bundle version code only                                                                                                                                                                                                                            |
| `DeviceDiagnostics.appBuild`                     | `appBuild`                                              | same, numeric Bundle build                                                                                                                                                                                                                                |
| `DeviceDiagnostics.buildType`                    | `buildType`                                             | same, debug or release                                                                                                                                                                                                                                    |
| `DeviceDiagnostics.androidRelease`               | `osRelease`                                             | differs because this is the Apple OS version                                                                                                                                                                                                              |
| `DeviceDiagnostics.sdk`                          | none                                                    | not ported because Apple has no Android API level                                                                                                                                                                                                         |
| `DeviceDiagnostics.manufacturer`                 | `manufacturer`                                          | same, Apple                                                                                                                                                                                                                                               |
| `DeviceDiagnostics.model`                        | `model`                                                 | differs because iOS uses uname machine and macOS uses hw.model, never device name                                                                                                                                                                         |
| `DeviceDiagnostics.abi`                          | `abi`                                                   | differs because this is the compiled Apple architecture                                                                                                                                                                                                   |
| `DeviceDiagnostics.tv`                           | none                                                    | not ported because tvOS is out of scope                                                                                                                                                                                                                   |
| `DeviceDiagnostics.media3`                       | formatReport player line                                | not ported because AVPlayer has no independent library version                                                                                                                                                                                            |
| `DeviceDiagnostics.ffmpeg`                       | none                                                    | not ported because AVPlayer does not use the app's FFmpeg library                                                                                                                                                                                         |
| `DeviceDiagnostics.of`                           | `DeviceDiagnostics.of`                                  | same checks on applicable fields                                                                                                                                                                                                                          |
| `SettingsDiagnostics`                            | `SettingsDiagnostics`                                   | same                                                                                                                                                                                                                                                      |
| `SettingsDiagnostics.engine`                     | `engine`                                                | differs because the engine is avplayer                                                                                                                                                                                                                    |
| `SettingsDiagnostics.decoders`                   | `decoders`                                              | differs because AVPlayer chooses the decoder; this records the existing preference model                                                                                                                                                                  |
| `SettingsDiagnostics.quality`                    | `quality`                                               | same                                                                                                                                                                                                                                                      |
| `SettingsDiagnostics.videoCodec`                 | `videoCodec`                                            | same                                                                                                                                                                                                                                                      |
| `SettingsDiagnostics.audioCodec`                 | `audioCodec`                                            | same                                                                                                                                                                                                                                                      |
| `SettingsDiagnostics.convertAudio`               | `convertAudio`                                          | same, sorted and bounded                                                                                                                                                                                                                                  |
| `SettingsDiagnostics.of`                         | `SettingsDiagnostics.of`, prefs initializer             | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics`                                | `FileDiagnostics`                                       | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.container`                      | `container`                                             | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.videoCodec`                     | `videoCodec`                                            | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.videoProfile`                   | `videoProfile`                                          | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.width`                          | `width`                                                 | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.height`                         | `height`                                                | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.bitDepth`                       | `bitDepth`                                              | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.hdr`                            | `hdr`                                                   | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.dolbyVisionProfile`             | `dolbyVisionProfile`                                    | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.audioCodecs`                    | `audioCodecs`                                           | same, first 8                                                                                                                                                                                                                                             |
| `FileDiagnostics.subtitleCount`                  | `subtitleCount`                                         | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.probed`                         | `probed`                                                | same                                                                                                                                                                                                                                                      |
| `FileDiagnostics.of`                             | `FileDiagnostics.of`, item initializer                  | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics`                           | `SelectionDiagnostics`                                  | same, no language, label or title                                                                                                                                                                                                                         |
| `SelectionDiagnostics.audioIndex`                | `audioIndex`                                            | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics.audioCodec`                | `audioCodec`                                            | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics.audioChannels`             | `audioChannels`                                         | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics.subtitleFormat`            | `subtitleFormat`                                        | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics.subtitleSource`            | `subtitleSource`                                        | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics.subtitleDelivery`          | `subtitleDelivery`                                      | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics.subtitleRendering`         | `subtitleRendering`                                     | same                                                                                                                                                                                                                                                      |
| `SelectionDiagnostics.of`                        | `SelectionDiagnostics.of`                               | same                                                                                                                                                                                                                                                      |
| `CapabilityDiagnostics`                          | `CapabilityDiagnostics`                                 | same, codec summary of the actual sent device                                                                                                                                                                                                             |
| `CapabilityDiagnostics.videoCodecs`              | `videoCodecs`                                           | same, distinct, first 8                                                                                                                                                                                                                                   |
| `CapabilityDiagnostics.audioCodecs`              | `audioCodecs`                                           | same, first 16                                                                                                                                                                                                                                            |
| `CapabilityDiagnostics.embeddedSubtitles`        | `embeddedSubtitles`                                     | same, first 8                                                                                                                                                                                                                                             |
| `CapabilityDiagnostics.streamAudioCodecs`        | `streamAudioCodecs`                                     | same                                                                                                                                                                                                                                                      |
| `CapabilityDiagnostics.encodeVideoCodecs`        | `encodeVideoCodecs`                                     | same                                                                                                                                                                                                                                                      |
| `CapabilityDiagnostics.serverVideoCodecs`        | `serverVideoCodecs`                                     | same                                                                                                                                                                                                                                                      |
| `CapabilityDiagnostics.serverAudioCodecs`        | `serverAudioCodecs`                                     | same                                                                                                                                                                                                                                                      |
| `CapabilityDiagnostics.maxBitrate`               | `maxBitrate`                                            | same, optional bits per second                                                                                                                                                                                                                            |
| `CapabilityDiagnostics.of`                       | `CapabilityDiagnostics.of`                              | same; old device-only initializer retained                                                                                                                                                                                                                |
| `TrackDiagnostics`                               | `TrackDiagnostics`                                      | differs because it also carries CoreMedia format fields                                                                                                                                                                                                   |
| `TrackDiagnostics.type`                          | `type`                                                  | same                                                                                                                                                                                                                                                      |
| `TrackDiagnostics.selected`                      | `selected`                                              | differs because item track enablement replaces Media3 selection                                                                                                                                                                                           |
| `TrackDiagnostics.mime`                          | `mime`                                                  | differs because a CoreMedia fourcc is mapped when known; absent otherwise                                                                                                                                                                                 |
| `TrackDiagnostics.codecs`                        | `codec`                                                 | differs because the CoreMedia fourcc and separate numeric profile/level replace RFC codec strings                                                                                                                                                         |
| `TrackDiagnostics.width`                         | `width`                                                 | same, zero means absent                                                                                                                                                                                                                                   |
| `TrackDiagnostics.height`                        | `height`                                                | same, zero means absent                                                                                                                                                                                                                                   |
| `TrackDiagnostics.channels`                      | `channels`                                              | same                                                                                                                                                                                                                                                      |
| `TrackDiagnostics.sampleRate`                    | `sampleRate`                                            | same, Double preserves CoreAudio rates                                                                                                                                                                                                                    |
| `TrackDiagnostics.bitrate`                       | `bitrate`                                               | same, estimated asset-track data rate                                                                                                                                                                                                                     |
| `TrackDiagnostics.support`                       | `support`                                               | not ported by the probe because AVPlayer has no Media3 format-support classification; field retained for report parity                                                                                                                                    |
| `DecoderDiagnostics`                             | `DecoderDiagnostics`                                    | same shape, not supplied by AVPlayer                                                                                                                                                                                                                      |
| `DecoderDiagnostics.type`                        | `type`                                                  | same                                                                                                                                                                                                                                                      |
| `DecoderDiagnostics.name`                        | `name`                                                  | not ported by the probe because AVPlayer does not expose decoder names                                                                                                                                                                                    |
| `ErrorDiagnostics`                               | `ErrorDiagnostics`                                      | differs because Apple errors have domain/code pairs                                                                                                                                                                                                       |
| `ErrorDiagnostics.code`                          | `code`                                                  | same, native numeric error code                                                                                                                                                                                                                           |
| `ErrorDiagnostics.name`                          | `name`                                                  | differs because this is the NSError domain                                                                                                                                                                                                                |
| `ErrorDiagnostics.type`                          | `type`                                                  | differs because item failures are source errors, not ExoPlaybackException types                                                                                                                                                                           |
| `ErrorDiagnostics.renderer`                      | `renderer`                                              | not ported by the probe because AVPlayer does not expose renderer names                                                                                                                                                                                   |
| `ErrorDiagnostics.format`                        | `format`                                                | not ported by the probe because NSError does not identify a failing format                                                                                                                                                                                |
| `ErrorDiagnostics.formatSupport`                 | `formatSupport`                                         | not ported by the probe because AVPlayer has no Media3 support classification                                                                                                                                                                             |
| `ErrorDiagnostics.httpStatus`                    | `httpStatus`, error-log numeric codes                   | differs because arbitrary NSError userInfo is never inspected for HTTP values; AVPlayer log codes are retained separately                                                                                                                                 |
| `ErrorDiagnostics.decoder`                       | `decoder`                                               | not ported by the probe because AVPlayer does not expose decoder names                                                                                                                                                                                    |
| `ErrorDiagnostics.secureDecoder`                 | `secureDecoder`                                         | not ported by the probe because no MediaCodec initialization event exists                                                                                                                                                                                 |
| `ErrorDiagnostics.causes`                        | `causes`, `causeCodes`                                  | differs because bounded NSError domains and codes replace Java class names                                                                                                                                                                                |
| `AttemptDiagnostics`                             | `AttemptDiagnostics`, `PlaybackAttempt` alias           | same, compatibility alias retained                                                                                                                                                                                                                        |
| `AttemptDiagnostics.number`                      | `number`                                                | same, monotonic across evictions                                                                                                                                                                                                                          |
| `AttemptDiagnostics.mode`                        | `mode`                                                  | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.reason`                      | `reason`                                                | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.startAt`                     | `startAt`                                               | same, nonnegative whole seconds; nonfinite inputs become zero                                                                                                                                                                                             |
| `AttemptDiagnostics.audioIndex`                  | `audioIndex`                                            | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.quality`                     | `quality`                                               | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.burnIn`                      | `burnIn`                                                | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.why`                         | `why`                                                   | same, bounded generated reason allowlist                                                                                                                                                                                                                  |
| `AttemptDiagnostics.videoTo`                     | `videoTo`                                               | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.audioTo`                     | `audioTo`                                               | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.outcome`                     | `outcome`                                               | same                                                                                                                                                                                                                                                      |
| `AttemptDiagnostics.error`                       | `error`                                                 | same, bounded causes                                                                                                                                                                                                                                      |
| `PlaybackReport`                                 | `PlaybackReport`                                        | same, plus AVPlayer counters and buffer state                                                                                                                                                                                                             |
| `PlaybackReport.device`                          | `device`                                                | differs because it can be absent for backward-compatible empty construction                                                                                                                                                                               |
| `PlaybackReport.settings`                        | `settings`                                              | differs because old controller construction fills optional context after loading                                                                                                                                                                          |
| `PlaybackReport.file`                            | `file`                                                  | differs because old controller construction fills optional context after loading                                                                                                                                                                          |
| `PlaybackReport.selection`                       | `selection`                                             | same                                                                                                                                                                                                                                                      |
| `PlaybackReport.capabilities`                    | `capabilities`                                          | differs because old controller construction fills optional context after loading                                                                                                                                                                          |
| `PlaybackReport.attempts`                        | `attempts`                                              | same                                                                                                                                                                                                                                                      |
| `PlaybackReport.droppedAttempts`                 | `droppedAttempts`                                       | same                                                                                                                                                                                                                                                      |
| `PlaybackReport.tracks`                          | `tracks`                                                | same                                                                                                                                                                                                                                                      |
| `PlaybackReport.decoders`                        | `decoders`                                              | same                                                                                                                                                                                                                                                      |
| `PlaybackReport.notes`                           | `notes`                                                 | same, typed keys                                                                                                                                                                                                                                          |
| `PlaybackReport.latest`                          | `latest`                                                | same                                                                                                                                                                                                                                                      |
| `PlaybackReport.failed`                          | `failed`                                                | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder`                            | `DiagnosticsRecorder`                                   | differs because main-actor isolation replaces Android's main-thread convention                                                                                                                                                                            |
| `DiagnosticsRecorder.report`                     | `report`                                                | same, private setter                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.publish`                    | `publish`                                               | same, injectable callback                                                                                                                                                                                                                                 |
| `DiagnosticsRecorder.nextNumber`                 | `PlaybackReport.attempt` last number                    | same, retained latest number plus dropped count                                                                                                                                                                                                           |
| `DiagnosticsRecorder.init`                       | initializer                                             | same, publishes initial state                                                                                                                                                                                                                             |
| `DiagnosticsRecorder.update`                     | `update`                                                | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.updateLatest`               | guarded report mutation methods                         | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.attempt(mode, ...)`         | `attempt(mode:...)`                                     | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.playing`                    | `playing`                                               | same, only loading changes                                                                                                                                                                                                                                |
| `DiagnosticsRecorder.failed`                     | `failed`                                                | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.closed`                     | `closed`, `PlaybackReport.close`                        | same, only loading changes; played attempts stay playing                                                                                                                                                                                                  |
| `DiagnosticsRecorder.select`                     | `select`                                                | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.capabilities`               | `capabilities`                                          | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.tracks`                     | `tracks`                                                | same, first 4                                                                                                                                                                                                                                             |
| `DiagnosticsRecorder.decoder`                    | `decoder`                                               | same, deduplicated latest 4                                                                                                                                                                                                                               |
| `DiagnosticsRecorder.attempt(source, plan, ...)` | `attempt(_:plan:reason:audioIndex:)`                    | same, never retains source URL                                                                                                                                                                                                                            |
| `DiagnosticsRecorder.note`                       | `note`                                                  | same                                                                                                                                                                                                                                                      |
| `DiagnosticsRecorder.bounded`                    | `PlaybackReport.failed`                                 | same, first 3 causes                                                                                                                                                                                                                                      |
| `PlaybackDiagnostics`                            | `PlaybackDiagnostics`                                   | differs because Observation replaces StateFlow                                                                                                                                                                                                            |
| `PlaybackDiagnostics.state`                      | `shared.report`                                         | same, process-memory only                                                                                                                                                                                                                                 |
| `PlaybackDiagnostics.latest`                     | `latest`                                                | same                                                                                                                                                                                                                                                      |
| `PlaybackDiagnostics.publish`                    | `publish`                                               | same                                                                                                                                                                                                                                                      |
| `PlaybackDiagnostics.clear`                      | `clear`                                                 | same                                                                                                                                                                                                                                                      |
| `formatReport`                                   | `formatReport`                                          | differs because Apple device/player lines and AVPlayer fields replace Android-only lines; otherwise same sections                                                                                                                                         |
| `formatReport.line`                              | lines array                                             | same, trailing newline                                                                                                                                                                                                                                    |
| `formatReport.yesNo`                             | local `yesNo`                                           | same                                                                                                                                                                                                                                                      |
| `formatReport.list`                              | local `list`                                            | same                                                                                                                                                                                                                                                      |
| `formatReport.opt`                               | local `opt`                                             | same                                                                                                                                                                                                                                                      |
| `formatTrack`                                    | `formatTrack`                                           | differs because additional CoreMedia fields are rendered                                                                                                                                                                                                  |
| `formatError`                                    | `formatError`                                           | differs because underlying domain/code pairs are rendered                                                                                                                                                                                                 |
| `deviceDiagnostics`                              | `deviceDiagnostics`                                     | differs because Bundle, OS version, uname and hw.model replace Android Build fields                                                                                                                                                                       |
| `trackKind`                                      | `DiagnosticsProbe.formatDiagnostics` media-type mapping | differs because it maps CoreMedia media types                                                                                                                                                                                                             |
| `Int.known`                                      | positive numeric guards in format probe/rendering       | same, omits unknown or nonpositive values                                                                                                                                                                                                                 |
| `formatDiagnostics`                              | `DiagnosticsProbe.formatDiagnostics`                    | differs because CoreMedia descriptions replace Media3 Format; AVC/HEVC configuration records supply profile/level, HEVC supplies bit depth, Dolby records supply profile/level, named color extensions supply HDR, CoreAudio supplies channel layout/rate |
| `trackDiagnostics`                               | `DiagnosticsProbe.trackDiagnostics`, `tracks(item)`     | differs because enabled AVPlayerItemTracks replace selected Media3 groups; same per-kind selected-two or first fallback bound                                                                                                                             |
| `errorDiagnostics`                               | `errorDiagnostics`                                      | differs because NSError underlying chains replace Java cause chains; cycle detection added                                                                                                                                                                |

### Diagnostics integration calls for the controller owner

- At each source load, replace `attempt(method:offset:)` with
  `attempt(next, plan: plan, reason: reason, audioIndex: audio?.index)`.
  Pass the event's reason from start, fallback, retry and each pick handler.
  The old overload cannot infer HLS, burn-in, conversion, selected audio or
  why the server chose a method.
- At initial report creation and after picks settle, call
  `select(.of(audio: audio, subtitle: subtitle, rendering: rendering))`.
  Map `SubtitleShow` to screen, player, burnIn, or nil.
- Replace the device-only capability initializer at load with
  `CapabilityDiagnostics.of(device, options: options)`.
- After loading and after in-file audio selection, use
  `DiagnosticsProbe.tracks(player.currentItem)` rather than the asset-only
  compatibility overload. An asset has no current selection, so its tracks
  deliberately say not_selected. The item overload reads enabled tracks.
- In `sourceFailed`, call `failed(errorDiagnostics(cause as NSError))`
  before loading the replacement. The old `failed(code:)` loses the chain.
- `sample(player)` remains source-compatible and now reads status/error,
  bounded log codes, access counters and buffer state through
  `DiagnosticsProbing`. Tests can pass a fake using `sample(player, probe:)`.

### Diagnostics verification

All ten Kotlin test cases have Swift counterparts. Android-specific expected
version and renderer text use Apple expectations. The three original Swift
diagnostics cases moved unchanged into `PlaybackDiagnosticsTests.swift`.
Additional cases cover private file/selection metadata, Codable round trips,
NSError chains, fake access/error events, buffer state, injected probes,
per-kind track selection, AVC/HEVC/Dolby configuration records and PCM audio.
The opt-in `renderedLiveReport` prints only the rendered report, not the fixture
path, and leaves the existing full live playback test unchanged.

Verified on this branch:

- macOS `swift build` and `swift test` passed without compiler warnings.
  Swift Testing reports 73 tests passed, with four opt-in tests disabled.
  The diagnostics suite has 20 default cases and one opt-in live case.
- The iOS Simulator package build passed without diagnostics-code warnings.
- Root `pnpm verify` passed under Node 24 and pnpm 11.
- The existing live `fixturePlayback` test passed on all seven movie fixtures
  against localhost:18420, and `renderedLiveReport` passed. The rendered
  output was inspected: it contains only format and device codes, counters,
  and numeric timings. The current controller still omits server offerings
  and selection context until its owner adds the integration calls above.
- The macOS model can read `other` because Apple's comma-separated hardware
  identifiers fail the Kotlin-compatible short-code alphabet. No device
  name or serial is used as a fallback. The SwiftPM test host has no app
  version/build metadata, so it reports unknown and zero; app bundles use
  their actual version/build.

- `PlayerDownloads` is unchanged. `PlaybackEngine` gained internal state and
  transport methods for fake engines; the view's public construction API is
  unchanged. An internal initializer accepts a fake engine and a report clock.
