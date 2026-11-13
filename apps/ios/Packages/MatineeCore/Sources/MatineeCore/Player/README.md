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

- Attach `player` to an `AVPlayerLayer`. The view owns AVKit presentation and
  restoration, not the media session. Make the lifecycle calls below.
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
- Observe `next` and `nextCountdown`; call `cancelNext` or `playNext`.
  Set `onNext` to stop this sitting and open the next item. Like Android, the
  ten-second countdown starts after the file ends, and with autoplay off the
  view offers Play without one.
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

| Android                                                                                                                                                                                                          | iOS view                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerActivity.onCreate` sets the content; `PlayerScreen` loads the first answer, `rememberPlayerController` makes the controller, and its `DisposableEffect` calls `start()`. `PlaybackService.start` follows. | When the player view appears (`.task`), make the controller and `await start(itemId:at:)` or `startLocal(itemId:at:)`. Set `onNext`. Lock-screen controls start with the first source.                                                                                  |
| `onResume` and `onPause` only switch the dark theme. The controller isn't touched.                                                                                                                               | `scenePhase == .inactive` (Control Center, the app switcher): nothing.                                                                                                                                                                                                  |
| `ON_STOP` without picture in picture: `player.pause()`. The surface goes, so `onSurfaceSizeChanged` clears `surfaceShown`.                                                                                       | `scenePhase == .background`: `sceneDidEnterBackground()`, which clears `surfaceShown` and pauses unless `pictureInPictureActive`. `.active`: `sceneDidBecomeActive()`.                                                                                                  |
| Picture in picture enters by itself while playing (Android 12 and later) or on the user leaving; the screen hides its controls.                                                                                  | `pictureInPictureChanged(true)` from `pictureInPictureControllerDidStartPictureInPicture`, `false` from `…DidStop…`. Enable `canStartPictureInPictureAutomaticallyFromInline` while `playing` and `prefs.pictureInPicture`. A frame in PiP counts for the freeze watch. |
| ExoPlayer's audio focus pauses for a call or another app and plays on after a transient loss; becoming noisy (headphones out) pauses.                                                                            | `AVAudioSession.interruptionNotification`: `audioInterruptionBegan()`, then `audioInterruptionEnded(shouldResume:)` with the `.shouldResume` option. A route change with `.oldDeviceUnavailable`: `pause()`. `PlayerNowPlaying` observes both today; see below.         |
| The next episode or a new intent changes the activity's target; `key(playing)` disposes the old controller (`release()`) and makes another.                                                                      | `onNext`: `await stop()` this controller, then make one for the next item.                                                                                                                                                                                              |
| Leaving the player, or the sign-in changing under it: the composition disposes, `release()` reports `closed`, stops the service and the session, and frees the player.                                           | The view disappearing, or the session or server changing: `await stop()`. It sends the closing report once, even if called twice.                                                                                                                                       |
| `PlaybackService.onTaskRemoved` (the app swiped away) pauses and stops the service.                                                                                                                              | No callback is reliable when iOS ends the app. The 10 and 30 second reports, and the queued offline ones, stand in for the closing report.                                                                                                                              |

`PlayerNowPlaying` (owned by another change) currently pauses on an
interruption's start and never resumes. It should call
`audioInterruptionBegan` and `audioInterruptionEnded(shouldResume:)` instead,
so the controller resumes as ExoPlayer does.

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

### This pass

- `swift test`: 85 tests, up from 55. `PlaybackTests.swift` has all 16
  `PlaybackTest.kt` cases; `PlayerControllerTests.swift` has 18 (19 cases), against a fake
  engine and a stubbed server, for the behaviors in the table.
- The live test passed for all seven movie fixtures before and after, with the
  same methods: Toy Story, Back to the Future and The Matrix play direct;
  Interstellar, Blade Runner and Dune answer remux, fail with -11850, and
  play the encode the server answers next; Jurassic Park encodes. Audio picks,
  WebVTT cues, long-file encode seeks, the injected fallback and PGS burn-in
  behave as before.

## Parity: `PlayerController.kt` and `Playback.kt`

Every member of the two Kotlin files, in their order. "Same" means the same
branches and arithmetic, checked line by line in this pass.

### `PlayerController.kt`

| Kotlin member                                                          | Swift                                                  | Result                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Opening`                                                              | `start`, `startLocal`                                  | Differs because the iOS controller asks for the first answer itself; Android's screen asks before it makes the controller. A refusal or unplayable opening shows in `refusal` and `error`.                                             |
| `Opening.Server` (`plan`, `sessionId`, `quality`)                      | `start(itemId:at:sessionId:)`                          | Differs as above. The first call carries `prefs.quality` and the given session id, as the screen's does.                                                                                                                               |
| `Opening.Local` (`item`, `file`, `audio`, `subtitles`, `saved`, `at`)  | `LocalPlayback`                                        | Same fields. `startAudio` and `startSubtitle` are picked in `startLocal` with `downloadAudio` and `downloadSubtitle`, where Android's screen picks them.                                                                               |
| `Notice`                                                               | `Notice`                                               | Same.                                                                                                                                                                                                                                  |
| `MOVIE_AUDIO`                                                          | `PlayerNowPlaying`                                     | Differs because iOS sets `AVAudioSession` to `.playback` / `.moviePlayback`, which `PlayerNowPlaying` does.                                                                                                                            |
| `renderers`                                                            | none                                                   | Not ported because it configures ExoPlayer's renderers, decoder order and FFmpeg extension; AVPlayer chooses its decoders and has no API for it.                                                                                       |
| `Ask` and its fields                                                   | `Ask`                                                  | Same. `at` is optional, nil only for the opening, which resumes where the server says.                                                                                                                                                 |
| Constructor: `context`, `http`                                         | `api`, `tokenProvider`                                 | Differs because there's no Android context; the token provider authenticates media and subtitle requests.                                                                                                                              |
| Constructor: `options`                                                 | `options`                                              | Differs because `start` fetches `playback.options` itself.                                                                                                                                                                             |
| Constructor: `device`, `prefs`                                         | Same                                                   | Same.                                                                                                                                                                                                                                  |
| Constructor: `pending`                                                 | `downloads: PlayerDownloads`                           | Same role: reports wait there (`queueReport`) and are dropped when one arrives (`reported`).                                                                                                                                           |
| Constructor: `serverHeaders`, `userAgent`                              | none                                                   | Not ported because they're for mpv.                                                                                                                                                                                                    |
| Constructor: `matchFrameRate`                                          | none                                                   | Not ported because it's TV only.                                                                                                                                                                                                       |
| `scope`                                                                | Tasks kept per job, cancelled in `stop`                | Differs because Swift has no coroutine scope; see `askJob`.                                                                                                                                                                            |
| `server`, `local`                                                      | `plan`, `local`                                        | Same.                                                                                                                                                                                                                                  |
| `sessionId`, `startedAt`                                               | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `appContext`, `resources`                                              | none                                                   | Not ported because the package has no strings; the view words `error` and `unplayable`.                                                                                                                                                |
| `item`                                                                 | `item`                                                 | Differs because it's nil until the opening's answer arrives.                                                                                                                                                                           |
| `qualities`, `offersOriginal`                                          | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `player`                                                               | `player` (AVPlayer, behind `PlaybackEngine`)           | Differs because AVPlayer is the only engine. Audio focus and noisy handling are the lifecycle calls above.                                                                                                                             |
| `mpv`, `usesMpv`                                                       | none                                                   | Not ported because they're mpv.                                                                                                                                                                                                        |
| `freeze`, `nudged`                                                     | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `surfaceShown`                                                         | `surfaceShown`, `pictureInPictureActive`               | Differs because AVPlayerLayer reports no surface size; the view and `sceneDid…` set it.                                                                                                                                                |
| `session`, `controls`                                                  | `nowPlaying`, `enableNowPlaying`                       | Differs because iOS has `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` in place of a media session and service.                                                                                                                  |
| `plan`, `source`, `asking`, `localSubtitle`                            | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `audio`, `subtitle`, `quality`, `cues`, `cuesFor`                      | Same                                                   | Same. `cuesFor` was missing, so every answer fetched the cues again; ported.                                                                                                                                                           |
| `pictureCues`                                                          | none                                                   | Not ported because AVPlayerLayer draws a picture subtitle track itself and AVFoundation hands no bitmap cues to the app.                                                                                                               |
| `videoAspect`                                                          | `videoAspect`                                          | Same: `presentationSize` already applies the pixel aspect. Now stored and updated each tick, so the view observes it.                                                                                                                  |
| `subtitleError`, `speed`, `position`, `buffered`, `playing`, `loading` | Same                                                   | Same, read from AVPlayer each tick.                                                                                                                                                                                                    |
| `ended`                                                                | `ended`                                                | Differs because AVPlayer has no ended state in `timeControlStatus`: the last 0.3 seconds, not playing. It reports on the change, as `STATE_ENDED` does.                                                                                |
| `error`                                                                | `error`, `unplayable`                                  | Differs because the package has no `R.string.player_unplayable`; `unplayable` tells the view to use its own words.                                                                                                                     |
| `refusal`, `notice`, `trickplay`                                       | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `audioTracks`, `subtitles`                                             | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `next`                                                                 | `next`                                                 | Differs because a download's next comes from `PlayerDownloads.next(after:)` into `localNext`; Android's screen asks with `downloadNext`.                                                                                               |
| `duration`                                                             | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `pendingAt`, `sourceFailed`                                            | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `pendingAudioOverride`                                                 | `load` awaits the engine                               | Differs because AVPlayer's load returns once the item is ready, so the audio is picked then, with no pending flag.                                                                                                                     |
| `playedSeconds`, `lastReport`                                          | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `askJob`, `seekJob`                                                    | `askTask`, `seekTask`, with `asks`, `seeks`, `loads`   | Same cancellation; the counters drop an answer or load another replaced, since a Swift task can finish after its cancel.                                                                                                               |
| `inFlight`, `seekOnAnswer`                                             | Same                                                   | Same. Missing before; ported.                                                                                                                                                                                                          |
| `diagnostics`                                                          | `diagnostics: PlaybackReport`                          | Differs because the iOS report (another change's file) has no device or selection section yet.                                                                                                                                         |
| `init`: `onIsPlayingChanged`                                           | `tick`                                                 | Same: `playing` follows the engine and a change reports.                                                                                                                                                                               |
| `init`: `onPlaybackStateChanged`                                       | `tick`                                                 | Same for `loading` and `ended`. `diagnostics.playing()` is the report's own `sample`.                                                                                                                                                  |
| `init`: `onTracksChanged`                                              | `load`                                                 | Differs as `pendingAudioOverride`; tracks for the report come from `DiagnosticsProbe`.                                                                                                                                                 |
| `init`: `onCues`                                                       | none                                                   | Not ported, as `pictureCues`.                                                                                                                                                                                                          |
| `init`: `onVideoSizeChanged`                                           | `tick`                                                 | Same, polled.                                                                                                                                                                                                                          |
| `init`: `onPlayerError`                                                | `tick` reads `engine.failure`, then `sourceFailed(_:)` | Same: notes the failure and falls back, once per source.                                                                                                                                                                               |
| `init`: `onSurfaceSizeChanged`                                         | `surfaceShown`                                         | Differs as `surfaceShown`.                                                                                                                                                                                                             |
| `init`: video frame metadata listener                                  | `engine.hasVideoFrame()`                               | Differs because AVPlayer reports frames through `AVPlayerItemVideoOutput`.                                                                                                                                                             |
| `init`: `tick`, `loadTrickplay` launches                               | `beginTick`, `loadTrickplay`                           | Same, from `start` and `startLocal`.                                                                                                                                                                                                   |
| `init`: `mpv?.setSubtitleScale`                                        | none                                                   | Not ported because it's mpv.                                                                                                                                                                                                           |
| `applyFrameRateStrategy`                                               | none                                                   | Not ported because it's TV only, and for mpv; iOS has no frame-rate strategy (`AVDisplayCriteria` is tvOS).                                                                                                                            |
| `start`                                                                | `start`, `startLocal`                                  | Same, with the opening above.                                                                                                                                                                                                          |
| `isLocal`, `resolve`, `shown`                                          | Same                                                   | Same. `shown` for a download now uses `downloadSubtitleShow`.                                                                                                                                                                          |
| `burnsIn`                                                              | `burnsIn`                                              | Same. Was wrong: it said any non-WebVTT track burns in.                                                                                                                                                                                |
| `take`                                                                 | `take`                                                 | Same. Before, the answer was taken inline and a seek made while asking was lost.                                                                                                                                                       |
| `load`                                                                 | `load`                                                 | Same. Before, every load, a `playback.seek` stream too, counted as an attempt.                                                                                                                                                         |
| `showSubtitle`                                                         | `showSubtitle`                                         | Same: the view draws WebVTT, the engine an in-file track, and a burned-in one comes in the picture. The engine mode was missing; ported.                                                                                               |
| `showFilled`                                                           | none                                                   | Not ported because it's mpv; the view sets `AVPlayerLayer.videoGravity`.                                                                                                                                                               |
| `selectAudioInFile`                                                    | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `applyAudioOverride`                                                   | `engine.selectAudio`                                   | Differs because `AVMediaSelectionOption` has no track id: the place among the file's audio tracks, ExoPlayer's fallback, is the only match.                                                                                            |
| `applyTextOverride`                                                    | `applyTextOverride`, `engine.selectSubtitle`           | Differs the same way: the place among the file's own subtitle streams in the legible group. Before, the engine's text was always off.                                                                                                  |
| `now`                                                                  | `now`                                                  | Same. Was missing; positions in calls and reports used `position` and lost a pending switch.                                                                                                                                           |
| `fallBack`                                                             | `fallBack`                                             | Same. Before, the client refused to ask again when the method was already failed, a rule of its own.                                                                                                                                   |
| `frozen`                                                               | `frozen`                                               | Same.                                                                                                                                                                                                                                  |
| `ask`                                                                  | `ask`                                                  | Same.                                                                                                                                                                                                                                  |
| `request`                                                              | `request`                                              | Same: replaces a call on its way, whose answer is dropped. Missing before; ported.                                                                                                                                                     |
| `refused`                                                              | `refused`                                              | Same. The menu goes back to what plays, and a seek made meanwhile goes to it. Differs in one branch: an opening that fails shows the error, as Android's screen does.                                                                  |
| `retry`                                                                | `retry`                                                | Same. After a failed opening it asks from the opening's `at`.                                                                                                                                                                          |
| `togglePlay`                                                           | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `seekTo`                                                               | `seekTo`                                               | Same, but a seek in an encode that isn't HLS reloads, which Kotlin doesn't: `sameSource` ignores where a stream starts, so Kotlin would keep the old stream. Both apps ask for HLS, so neither hits it.                                |
| `seekStream`                                                           | `seekStream`                                           | Same. Now sends the answer's audio, as Kotlin, not the menu's.                                                                                                                                                                         |
| `skip`                                                                 | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `pickAudio`, `pickSubtitle`, `pickQuality`                             | Same                                                   | Same. Before, picking what already plays asked again, and the pick waited on `pickTracks` before asking.                                                                                                                               |
| `sendPick`                                                             | Same                                                   | Same.                                                                                                                                                                                                                                  |
| `pickSpeed`                                                            | `pickSpeed`                                            | Differs because AVPlayer's speed is its rate: a paused player keeps it for `play`. Non-finite rates are ignored.                                                                                                                       |
| `loadCues`                                                             | `loadCues`                                             | Same: the saved file first, then the server with the token; parsed off the main actor.                                                                                                                                                 |
| `loadTrickplay`                                                        | `loadTrickplay`                                        | Same. Now also for a download, as Kotlin.                                                                                                                                                                                              |
| `tick`                                                                 | `tick`                                                 | Same arithmetic and cadence. Differs in one rule: AVPlayer can wait for data for ever, so a source it waits on for 20 seconds while the viewer wants it playing, with no call on its way, fails as ExoPlayer's timeouts would fail it. |
| `report`                                                               | `report`, `sendReport`                                 | Same: position from `now`, `closed` only when true, a report that arrives drops what waited, one that doesn't queues the position and, when any played, the sitting as an offline play. Missing before; ported.                        |
| `report`: `watchNext?.requestSync()`                                   | none                                                   | Not ported because Watch Next is the Android TV launcher's.                                                                                                                                                                            |
| `metadata`                                                             | `metadata`, `enableNowPlaying`                         | Same: an episode shows its show and code, a movie its year.                                                                                                                                                                            |
| `selectionDiagnostics`, `recordSelection`                              | none                                                   | Not ported yet because the iOS `PlaybackReport` has no selection; `SubtitleShow.rendering` is ready for it.                                                                                                                            |
| `listenForDecoders`                                                    | none                                                   | Not ported because ExoPlayer's MediaCodec callbacks have no AVPlayer API.                                                                                                                                                              |
| `release`                                                              | `stop`                                                 | Same order: diagnostics close, closing report, controls go, player cleared. Explicitly async; a second call does nothing.                                                                                                              |

### `Playback.kt`

| Kotlin member                                                   | Swift                    | Result                                                                                     |
| --------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| `Picks`, `Picks.plus`                                           | `Picks`, `merging`       | Same.                                                                                      |
| `NoticeKind`, `Refusal`, `refusal`                              | Same                     | Same.                                                                                      |
| `Asking`, `pick`, `fail`, `forgetFailures`, `input`, `settle`   | Same                     | Same. Every fixture case of `PlaybackTest.kt` is ported in `PlaybackTests.swift`.          |
| `SourceKind`, `SeekWay`                                         | Same                     | Same.                                                                                      |
| `Source` fields, `mode`, `kind`, `position`, `startMs`          | Same                     | Same. `kind` now goes through `mode`, as Kotlin.                                           |
| `seeksItself`, `holdsTracks`, `seek`, `fileSeconds`, `sourceMs` | Same                     | Same.                                                                                      |
| `Source.of`, `Source.local`                                     | Same                     | Same.                                                                                      |
| `sameSource`, `burnedIn`                                        | Same                     | Same.                                                                                      |
| `SubtitleShow` `Off`, `Screen`, `InFile`, `Burned`, `track`     | Same                     | Same.                                                                                      |
| `SubtitleShow.Overlay`                                          | `.overlay`               | Same. Only mpv draws it; `subtitleShow(_:mpv:)` keeps the flag for that engine.            |
| `rendering`                                                     | `SubtitleShow.rendering` | Same, with `SubtitleShow.Rendering` until the diagnostics have `SubtitleRendering`.        |
| `streamIndex`, `subtitleShow`                                   | Same                     | Same.                                                                                      |
| `downloadSubtitleShow` (in `DownloadTracks.kt`, tested here)    | `downloadSubtitleShow`   | Same. In `Playback.swift` for now, since `DownloadTracks.swift` belongs to another change. |

### Swift-only members

`play`, `pause`, `options`, `localNext`, `nextCountdown`, `cancelNext`,
`playNext`, `onNext`, `scrubPosition`, `beginScrub`, `scrub(to:)`,
`endScrub`, `trickplayFrame`, `mediaRequest`, `dismissNotice`,
`failedMethods`, `preferences`, `pictureInPictureActive`, and the lifecycle
calls hold what Android's `PlayerScreen.kt`, `PlayerActivity.kt` and
`PlayerHost` keep. `ServerPlayerDownloads` is what `PlayerScreen.kt` and
`app.downloads.pending` hand the Kotlin controller.

### Other player files

Compared in the second pass and not audited again here; the parity of
`PlaybackDiagnostics`, `Capabilities`/`PlaybackDevice`, `PlayerPrefs` and the
other files is still incomplete and belongs to their own changes.

| Kotlin member                                                                 | Swift member                             | Comparison                                                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `CueTrack.at`, `parse`, `seconds`, `unescape`, `styled`                       | `CueTrack`                               | Same bounded 16-cue backward search, timing parser and tag/entity handling. Cue positions are ignored by Kotlin too.                    |
| `seekable`, `seekClamp`, `seekFraction`, `seekAt`, `seekSteps`, `seekStepped` | Same names                               | Same. All six Kotlin SeekTest cases ported separately.                                                                                  |
| `FreezeWatch.frame`, `check`, `reset`                                         | Same names                               | Same. All five Kotlin FreezeWatchTest cases ported separately.                                                                          |
| `DiagnosticsNote`                                                             | `DiagnosticsNote`, `PlaybackReport.note` | Same six named notes, counted without retaining server messages.                                                                        |
| `AttemptOutcome` replacement and closure                                      | `PlaybackReport.attempt`, `close`        | Corrected replacement of playing attempts and closure of the final attempt.                                                             |
| ExoPlayer renderers and decoder listeners                                     | `AVPlayerEngine`, `DiagnosticsProbe`     | Differs because AVPlayer owns decoder selection. Renderer factory and MediaCodec decoder initialization callbacks have no AVPlayer API. |
