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
- `PlayerDownloads` is unchanged. `PlaybackEngine` gained internal state and
  transport methods for fake engines; the view's public construction API is
  unchanged. An internal initializer accepts a fake engine and a report clock.
