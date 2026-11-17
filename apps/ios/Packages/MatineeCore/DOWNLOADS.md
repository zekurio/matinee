# Downloads integration

`Downloads` and `DownloadStore` are observable main-actor objects. Keep one
`Downloads` alive for the app's lifetime. `DownloadFiles` owns media mutations,
size checks and atomic index writes on its own actor. The store awaits revisioned
snapshots, so an older result cannot overwrite a newer UI snapshot. Its `put`,
`update` and `remove` APIs are asynchronous. Media lives in
Application Support with backup exclusion. Initial index loading and root setup
are synchronous during store construction, before transfers start.

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
  item ids. `forgetServer` removes just that server, including pending progress
  (see Player for what it sends first).
- Settings are `unmeteredOnly`, `defaultVersion`, `videoCodec`, and `subtitles`.
  Pass `wishes()` to resolve to apply them.
- Low storage holds downloads back, as Android's `setRequiresStorageNotLow`:
  while `volumeAvailableCapacityForImportantUsage` is at or under the lesser
  of 5% of the volume and 500 MiB (`storageLow`), a download stays queued,
  and one running goes back to queued with what it has, its tasks cancelled
  and an original's resume data kept. The worker checks before each start,
  as each version fragment lands, and every five seconds of an original's
  progress, and looks again a minute after it held one back. Nothing weighs
  the server's size estimate, and the row reads Waiting, as on Android.
  `worker.capacity` is injectable; tests and the app's `-dev.lowStorage`
  replace it.
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
the request was in flight. Removing a server, `forgetServer(origin, api:)`
with the session's `onRemove` client, does as Android's: still signed in
there, it flushes what waited, then asks the server to drop the versions it
was making for this device's downloads, within eight seconds in all; an
unreachable server fails both and is left. Then the downloads go from the
device and what waited is cleared, whatever the server said.

## Versions and background handoff

The server emits init MP4 plus `.m4s` fMP4 fragments, not TS or an HLS download
asset. The worker appends complete fragments to `video.mp4`, flushing the file
before committing its byte/segment cursor. Append and index commit occupy one
non-suspending file-actor turn. Staged fragments remain until the index commits;
on restore, the worker truncates an uncommitted tail and replays the fragment.
A stale generation cannot append after pause or deletion. Deletion uses the same
actor, so it waits behind an active append and removes its result. The first
piece is moved when possible; otherwise assembly streams in 64 KiB chunks.
URLSession temporary files must be adopted synchronously on its background
delegate queue before returning, then their private UUID URLs pass to the actor.
Original transfer progress is observable but does not advance the durable cursor.
AVPlayer opens the finished
`file://` MP4 directly. No local HTTP server or resource loader is required.

**One outstanding version fragment is intentional.** The server deletes
fragments behind the index requested. Background URLSession cannot guarantee
ordering, even on one HTTP connection, and four at once made the server
answer ENOENT. Queuing multiple fragments safely needs a server change that retains
fragments until the client acknowledges them. Each completed task wakes the
app to queue the next. System deferral may let the encoder stop; its next
request resumes from the saved segment cursor. 503 honors Retry-After.

Originals use URLSession resume data, falling back to Range from the actual
local file length. A 200 response replaces rather than appends the old file.
Transient failures back off from 30 seconds through eight retries. For a real
background session, retry tasks use `earliestBeginDate` so the OS schedules
them while suspended. An initial API/setup failure that cannot create a byte
task still needs the next foreground restore/reachability event. Server
refusals are terminal, including non-403 refusals; Android
retries non-403 API errors.

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

The live test uses a plain URLSession, not an app background session. Actual
suspended transfers, force-quit behavior, relaunch handoff, cellular transitions,
OS retry deferral, large fragmented-file seeks, and locked-device transfers
still need device checks. Unit tests fake network eligibility and check request
policy flags; they cannot simulate the OS scheduler.
