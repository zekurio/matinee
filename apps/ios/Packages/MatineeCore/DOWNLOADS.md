# Downloads integration

`Downloads` and `DownloadStore` are observable main-actor objects. Keep one
`Downloads` alive for the app's lifetime. The main actor serializes index
changes and fragment commits; URLSession performs the transfers. JSON index
writes are atomic. Media lives in Application Support with backup exclusion.

## Session and screens

```swift
let downloads = try Downloads(client: { [weak session] origin in
  session?.serverClient(origin: origin)?.api
})
downloads.store.server = session.activeServer
session.onRemove = { origin, api in
  do { try await downloads.forgetServer(origin, api: api) }
  catch { AppLog.downloads.error("Could not remove server downloads") }
}
await downloads.restore()
```

The app must update `store.server` whenever `activeServer` changes. Compose
`onRemove` with any other cleanup hook rather than overwrite one.

- `store.items` and `store.done(id)` show only the selected server. `store.all`
  is keyed by local UUID, not item id, and is for administration/background work.
- `resolve(api:items:device:wishes:)` batches at 100. The player supplies the
  device profile. `wishes`, `defaultAudio`, and `defaultSubtitles` prepare the
  downloads sheet from the server's resolved choices.
- `enqueue(source, server:original:spec:plan:subtitles:)` accepts a ready
  resolution. Optional spec/plan are a server-approved customization.
- `pause`, `resume` (also retry), `remove`, and `removeAll` use selected-server
  item ids. `forgetServer` removes just that server, including pending progress.
- Settings are `unmeteredOnly`, `defaultVersion`, `videoCodec`, and `subtitles`.
  Pass `wishes()` to resolve to apply them. `store.storageUsed` counts disk bytes.
- `OfflineItem` exposes state, optional ratio, bytes, tracks, subtitles, image,
  and a typed `DownloadFailure`. Translate the failure cases in the app. A
  server failure carries its message unchanged.
- `offlineHomeRows` is the pure offline Home sorter. `HomeSnapshot` stores the
  online resume/next-up order separately per server. The caller supplies places
  and watched flags, using a pending ratio >= 0.9 as watched when appropriate.

## Player

`try downloads.playback(id)` returns only a completed download of the selected
server whose video still exists. `OfflinePlayback` supplies the local video
URL, `entry` with audio tracks and metadata, saved subtitle track/URL pairs,
the pending-or-server saved position, and its server's `PendingProgress`.
Choose offline tracks in the player, not with the online playback API.

Save last positions with `pending.put(id, PendingReport(...))`, and sittings
with `putPlay(PlaybackOfflineInput.Play(...))`. On successful online reporting,
`drop(id)` and `dropPlay(sessionId)` remove obsolete pending values. On reconnect:

```swift
try await downloads.pendingFor(origin).flush { origin in
  session.serverClient(origin: origin)?.api
}
```

Flush sends sittings in batches of 200 before positions. It retains failures,
except permanent 4xx responses, and never removes a newer value written while
the request was in flight. Removing a server does not wait on remote IO. If
wanted, flush its progress with a caller-owned timeout before local deletion.

## Versions and background handoff

The server emits init MP4 plus `.m4s` fMP4 fragments, not TS or an HLS download
asset. The worker appends complete fragments to `video.mp4`, flushing the file
before committing its byte/segment cursor. On restore, it truncates an
uncommitted tail and drains staged fragments. AVPlayer opens the finished
`file://` MP4 directly. No local HTTP server or resource loader is required.

**One outstanding version fragment is intentional.** The server deletes
fragments behind the index requested. Background URLSession cannot guarantee
ordering, even on one HTTP connection. An initial four-task window caused
server ENOENT errors and a failed repeat live check. The serial replacement
passed. Queuing multiple fragments safely needs a server change that retains
fragments until the client acknowledges them. Each completed task wakes the
app to queue the next. System deferral may let the encoder stop; its next
request resumes from the saved segment cursor. 503 honors Retry-After.

Originals use URLSession resume data, falling back to Range from the actual
local file length. A 200 response replaces rather than appends the old file.
Transient failures back off from 30 seconds through eight retries. For a real
background session, retry tasks use `earliestBeginDate` so the OS schedules
them while suspended. An initial API/setup failure that cannot create a byte
task still needs the next foreground restore/reachability event. Server
refusals are terminal, including non-403 refusals, as requested; Android
currently retries non-403 API errors.

In `application(_:handleEventsForBackgroundURLSession:completionHandler:)`,
create/retain Downloads first, then call on the main actor:

```swift
let handled = downloads.worker.handleEventsForBackgroundURLSession(
  identifier: identifier, completionHandler: completionHandler)
```

The identifier is `io.github.zekurio.matinee.downloads`. The worker reconnects
to that background session when initialized. It waits for its durable file
handling and scheduling before forwarding the system completion handler.
Do not call that handler twice. Handle unknown identifiers in the app delegate.

Background URLSession does not require a `UIBackgroundModes` entry. Do not add
`fetch` or `processing` just for downloads. The player needs its own `audio`
background mode. The app needs `NSLocalNetworkUsageDescription` for LAN servers
and an ATS policy appropriate to HTTP self-hosted servers, with local HTTP
allowed for the fixture. This package adds neither entitlements nor Info.plist
entries. There are no BGTaskScheduler identifiers in this implementation.

## Verification

Run from the package folder:

```sh
swift build
swift test
xcodebuild -scheme MatineeCore -destination 'generic/platform=iOS Simulator' build
```

Live test is opt-in and uses a plain URLSession, because background sessions
need an application bundle:

```sh
# From repository root; token file is private and is never committed.
apps/ios/scripts/dev/token ios-admin > /tmp/matinee-download-token
cd apps/ios/Packages/MatineeCore
MATINEE_DOWNLOAD_LIVE=1 swift test --filter LiveDownloadTests
```

`MATINEE_DOWNLOAD_TOKEN_FILE` overrides the token file. The test writes only
to a temporary download root, resolves live server decisions, pauses/resumes,
loads both files with AVPlayer, seeks, flushes offline progress, and deletes
the media. It changes watch progress for those fixture files.

Latest successful run with serial version fetching:

```text
LIVE resolve The Matrix: copy, subtitles 2
LIVE interrupted bytes=51412848 segment=0
LIVE downloaded bytes=92615594 segment=0 subtitles=2
LIVE AVPlayer ready=1 seek=true time=12.049292482
LIVE offline progress accepted
LIVE deleted media directory
LIVE resolve Jurassic Park: encode, subtitles 2
LIVE interrupted bytes=525321 segment=1
LIVE downloaded bytes=2072924 segment=4 subtitles=2
LIVE AVPlayer ready=1 seek=true time=11.968534897
LIVE offline progress accepted
LIVE deleted media directory
Test live() passed after 10.894 seconds.
```

`ios-viewer` returned HTTP 200 with a ready resolution for The Matrix, so it
does not exercise downloads-off refusal. No shared account policy was changed.
403 refusal and transient retries are covered through URLProtocol instead.

Still needs device/app-target checks: actual suspended transfers, force-quit
behavior, relaunch handoff, unmetered/cellular transitions, OS retry deferral,
large real-world fMP4 seeking, and transfers while the device is locked.
Unit tests fake network eligibility and assert request policy flags; they
cannot simulate the OS network scheduler. File assembly and atomic index IO
currently run on the main actor, so profile very large originals on a device
before deciding whether to move disk operations to a serial file actor.
