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
The diagnostic report records bounded attempts, outcome/error codes, format
descriptions, access-log rates, stalls and dropped frames. It is smaller than
Android's report: the full device/settings/file/capability context and named
notes have not yet been ported. Unit tests cover the shared arithmetic,
profiles, cues, failure accumulation, and report bounds, not every Kotlin
case. Refusals and offline playback still need controller-level integration
tests with injected responses/downloads.
