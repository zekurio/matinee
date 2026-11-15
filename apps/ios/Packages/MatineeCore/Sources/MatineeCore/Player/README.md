# Player core

`PlayerController` is `@Observable` and `@MainActor`. Construct one per file
with a `MatineeApi`, `playbackDevice(prefs)`, `PlayerPrefs`, the account's
`PlaybackPreferences`, and an async token provider. No dependency on Session.
Call `await stop()` before discarding it. The token provider must belong to
the same server as the API. Downloads and queued reports likewise belong to
that server; the `PlayerDownloads` implementation must enforce that boundary.
`ServerPlayerDownloads(downloads:server:api:)` is that implementation over
the app's `Downloads`: `Downloads.playback(_:)` for the file and its saved
subtitles, that server's `PendingProgress` for reports, and `api` for the
episode after a download.

The controller is split by concern, in `PlayerController.kt`'s member order:
`PlayerController.swift` (state, opening, answers, loading, fallback, the
calls), `+Controls` (`togglePlay` to `pickSpeed`), `+Background` (`loadCues`
to `release`), and `+Screen` (what Android's player screen and activity keep
themselves: scrub, trickplay tiles, the countdown, the lifecycle calls).

## View contract

- For AVPlayer, attach optional `player` to an `AVPlayerLayer`. For an injected
  engine, host that engine's view. MatineeMPV provides `MPVPlaybackSurface`
  on iOS and tvOS. The controller owns neither view nor AVKit presentation.
- `start(itemId:at:sessionId:)` asks the server; `at` nil resumes where the
  server says. `startLocal(itemId:at:)` plays a download from the injected
  `PlayerDownloads`, from `at` or where it stopped. `item` is nil until the
  first answer or the download arrives.
- Observe `position`, `duration`, `buffered`, `playing`, `loading`, `ended`,
  `speed`, `videoAspect`, `source`, `error`, `unplayable`, `refusal`, and
  `notice`. When `unplayable` is set, show `player_unplayable` in place of
  `error`, as Android does; a `refusal` shows `error`, the server's words,
  with no retry.
- `play`, `pause`, `togglePlay`, `pickSpeed`, async `seekTo` and `skip`.
- Observe `audio`, `subtitle`, `quality`, `audioTracks`, `subtitles`,
  `qualities`, `offersOriginal`, and `options`. Call async `pickAudio`,
  `pickSubtitle`, or `pickQuality`. `burnsIn` says whether a menu track is
  burned into the picture.
- Render `cues?.at(position)` using each cue's styled spans and
  `subtitleLook(prefs)`. A track the server gives the engine (`player`
  mode) and a burned-in one are drawn by AVPlayer, and `cues` is nil.
  `subtitleError` allows a load-error affordance. Re-read the system look
  when returning from Accessibility settings.
- `beginScrub`, `scrub(to:)`, async `endScrub(commit:)`; observe
  `scrubPosition`. `trickplayFrame(at:)` gives a tile URL and pixel crop.
  Use `mediaRequest(url:)` for authenticated artwork and tile requests.
  `SeekDrag` (Seek.swift) is the web seek bar's drag under a finger: a press
  jumps, a slow drag moves finer than the finger, and `seekUnder` and
  `seekThumbX` place its edge-aligned thumb.
- The episodes either side, as `playback.start` answers them (`previous`,
  `next`) or, for a download, as `PlayerDownloads.previous(before:)` and
  `next(after:)` find them. `isEpisode` says whether the buttons show.
  `playPrevious()` and `playInstead(_:)` stop this sitting through `onNext`,
  which the view sets to open that item in its place.
- The server's `segments` and `upNextAt`; the client works out neither.
  `segment` is the one that plays now, short of its last second, as
  Android's. `skippable(controls:)` is the one whose button shows: for eight
  seconds after it starts (`segmentFresh`), then only with the controls.
  `skipSegment()` seeks to its end. A download has no segments.
- `offersNext` is true once the position reaches `upNextAt`, or the file
  ended. `upNext` holds the offer while it lasts: `early` when it came with
  the credits, `cancelled` when it waits for Play (autoplay off, Cancel, or
  Hide), `hidden` when Hide put it away until the end. `showsUpNext` says
  whether its card shows. `nextCountdown` counts the seconds left in the
  file while the credits roll, and the file's end then starts the next
  item; offered only at the end, it counts ten seconds. Moving back before
  `upNextAt` drops the offer, and reaching it again starts afresh. Call
  `cancelNext`, `hideNext`, or `playNext`.
- `startHold()` plays at `HOLD_SPEED` while a finger holds the video, if it
  plays slower; `endHold()` goes back to `speed`. `holding` shows the note.
  Swipe.swift has the swipes' arithmetic: `swipeLevel` for brightness and
  volume, `swipeSeek` for seeking.
- `PlayerPrefs` keeps the gestures (`swipeLevels`, `rememberBrightness` with
  `brightness`, `swipeSeek`, `holdSpeed`) and which buttons the controls show
  (`skipButtons`, `pictureInPictureButton`, `lockButton`, `audioButton`,
  `subtitlesButton`), under Android's keys.
- `retry`, `dismissNotice`, async `report` and `stop`.
- Lock-screen controls start with the first source.
  `enableNowPlaying(title:subtitle:)` replaces their title with the view's
  localized label. Artwork is fetched with the same bearer token. Skip
  commands use the account's configured steps.
- About can observe `PlaybackDiagnostics.shared.report`; `formatReport`
  serializes it and `PlaybackDiagnostics.clear()` discards it.

## Lifecycle

What Android does to the controller, and the call the iOS view makes at the
matching moment.

| Android                                                                                                                                                                                                          | iOS view                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerActivity.onCreate` sets the content; `PlayerScreen` loads the first answer, `rememberPlayerController` makes the controller, and its `DisposableEffect` calls `start()`. `PlaybackService.start` follows. | When the player view appears (`.task`), make the controller and `await start(itemId:at:)` or `startLocal(itemId:at:)`. Set `onNext`. Lock-screen controls start with the first source.                                                                                          |
| `onResume` and `onPause` only switch the dark theme. The controller isn't touched.                                                                                                                               | `scenePhase == .inactive` (Control Center, the app switcher): nothing.                                                                                                                                                                                                          |
| `ON_STOP` without picture in picture: `player.pause()`. The surface goes, so `onSurfaceSizeChanged` clears `surfaceShown`.                                                                                       | `scenePhase == .background`: `sceneDidEnterBackground()`, which clears `surfaceShown` and pauses unless `pictureInPictureActive`. `.active`: `sceneDidBecomeActive()`.                                                                                                          |
| Picture in picture enters by itself while playing (Android 12 and later) or on the user leaving; the screen hides its controls.                                                                                  | `pictureInPictureChanged(true)` from `pictureInPictureControllerDidStartPictureInPicture`, `false` from `…DidStop…`. Enable `canStartPictureInPictureAutomaticallyFromInline` while `playing` and `prefs.pictureInPicture`. A frame in PiP counts for the freeze watch.         |
| ExoPlayer's audio focus pauses for a call or another app and plays on after a transient loss; becoming noisy (headphones out) pauses.                                                                            | `AVAudioSession.interruptionNotification`: `audioInterruptionBegan()`, then `audioInterruptionEnded(shouldResume:)` with the `.shouldResume` option. A route change with `.oldDeviceUnavailable`: `pause()`. `PlayerNowPlaying` observes both and makes these calls; see below. |
| The next episode or a new intent changes the activity's target; `key(playing)` disposes the old controller (`release()`) and makes another.                                                                      | `onNext`: `await stop()` this controller, then make one for the next item.                                                                                                                                                                                                      |
| Leaving the player, or the sign-in changing under it: the composition disposes, `release()` reports `closed`, stops the service and the session, and frees the player.                                           | The view disappearing, or the session or server changing: `await stop()`. It sends the closing report once, even if called twice.                                                                                                                                               |
| `PlaybackService.onTaskRemoved` (the app swiped away) pauses and stops the service.                                                                                                                              | No callback is reliable when iOS ends the app. The 10 and 30 second reports, and the queued offline ones, stand in for the closing report.                                                                                                                                      |

`PlayerNowPlaying` observes both and passes them on: an interruption goes to
`audioInterruptionBegan` and `audioInterruptionEnded(shouldResume:)`, so only
the controller decides to resume, as ExoPlayer does, and unplugging pauses.
The view adds no observers of its own.

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

## Deliberate omissions

- MatineeCore has no mpv dependency. The app injects MatineeMPV's engine;
  AVPlayer continues to select its own decoder.
- No Android TV display-mode switching or Watch Next sync. There is no tvOS target.
- No bitmap cue extraction. AVFoundation supplies no bitmap cues to the app;
  AVPlayer draws supported in-file tracks, and the server burns unsupported ones.
- No Android service or task-removed callback. iOS can end the app without a
  reliable callback, so periodic reports and queued offline progress matter.
- No decoder/renderer names or Media3 format-support classifications in probes.
  AVPlayer doesn't expose them. Error reports use the NSError chain instead.

## Device description

The table describes implemented wire values, not physical-device certification.

| Contract field                  | iOS value and source                                                                           | Why, and limits of the claim                                                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `containers`                    | `mp4`, `m4v`, `mov`, AVFoundation file readers                                                 | MP4 HTTP tests below; M4V/MOV remain reader-family claims, not separately tested here. No MKV claim.                                                                                                                            |
| `video`                         | Hardware-supported H.264, HEVC, AV1 from `VTIsHardwareDecodeSupported`                         | No software AV1 claim. Each codec produces landscape and portrait entries. The iOS Simulator has no hardware decoders, so VideoToolbox says no to everything there; it claims H.264 and HEVC, which it plays through the Mac's. |
| decoder `codec`                 | ffmpeg names mapped from CoreMedia codec constants                                             | Matches the server's codec comparison.                                                                                                                                                                                          |
| decoder `maxWidth`, `maxHeight` | 3840x2160 and 2160x3840                                                                        | Conservative delivery envelope from Apple's HLS authoring 1.25, not a system-discovered maximum. This is still a policy ceiling, not proof that every older hardware decoder takes 4K.                                          |
| decoder `maxBitDepth`           | H.264 8; HEVC and AV1 10                                                                       | AVC High 10 excluded. HEVC Main and Main 10 only. No 12-bit or 4:2:2 claim.                                                                                                                                                     |
| decoder `profiles`              | AVC Constrained Baseline/Baseline/Main/High; HEVC Main/Main 10; AV1 Main                       | Explicit profile names as ffprobe reports them, not unlimited profiles.                                                                                                                                                         |
| decoder `maxLevel`              | AVC 52; HEVC 153; AV1 18                                                                       | Apple HLS authoring 1.3b, 1.6b, 1.37: AVC 5.2, HEVC 5.1, AV1 6.2, in ffprobe units. These are authoring ceilings, not discovered per-device limits.                                                                             |
| decoder `hdr`                   | iOS `AVPlayer.availableHDRModes`, filtered to 10-bit decoders; Dolby Vision only on HEVC       | HDR10 and HLG remain separate. macOS requires `eligibleForHDRPlayback` and main-screen potential EDR headroom above 1, then permits HDR10/HLG, not Dolby Vision. No headless HDR claim.                                         |
| decoder `dolbyVisionProfiles`   | HEVC 10-bit with Dolby Vision mode: `[5,8]`; otherwise `[]`                                    | Single-layer delivery only. Profile 7 and the inherited Android 0...10 fallback list are removed. Profile 8 subprofiles remain a contract limitation described below.                                                           |
| `audio`                         | Installed AudioToolbox decoders intersected with AAC, Opus, FLAC, ALAC, AC-3, E-AC-3; plus PCM | HTTP MP4 results below. User conversion settings remove optional codecs. PCM remains the native MOV/file reader claim. MP3 removed after the ffmpeg MP4 failed to advance. DTS, TrueHD, MP2 are not advertised.                 |
| `streamAudio`                   | Opus, AAC, FLAC, ALAC, AC-3, E-AC-3, supported and not converted; AAC always available         | fMP4 HLS results below. A supported preference moves to the front; unsupported preferences cannot add a codec.                                                                                                                  |
| `encodeVideo`                   | H.264, then hardware-supported HEVC/AV1                                                        | A supported preference reorders the list. The server chooses the encode and quality.                                                                                                                                            |
| `hls`                           | `true`                                                                                         | AVPlayer's native HLS loader; live fixture test covers server encodes.                                                                                                                                                          |
| `selectAudio`                   | `true`                                                                                         | AVMediaSelectionGroup selection; live two-language MP4 fixture.                                                                                                                                                                 |
| `subtitles`                     | `[webvtt]`                                                                                     | App cue renderer draws `subtitlePath()` output independently of AVPlayer.                                                                                                                                                       |
| `sidecarSubtitles`              | `[]`                                                                                           | No extra engine sidecar renderer.                                                                                                                                                                                               |
| `embeddedSubtitles`             | `[]`                                                                                           | No engine subtitle claim, even if AVPlayer could display some formats itself.                                                                                                                                                   |
| `language`                      | `Locale.language.languageCode`, fallback `en`                                                  | Base BCP 47 language, matching Android and server base-language matching. Region/extensions intentionally discarded.                                                                                                            |

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
