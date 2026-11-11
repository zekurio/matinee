# Watch Next

`MatineeApp` creates this publisher only on a TV. It uses the framework's
`TvContract.WatchNextPrograms`, available at our minimum API 26, without an
extra tvprovider dependency. The server's Continue watching and Next up
lists decide membership and order. Android's launcher controls the final
order and visibility of its shared row.

Sync runs on sign-in, foreground, viewer changes, after a player's final
progress report succeeds, and hourly with WorkManager while signed in.
Rows keep their ids and only changed columns are written. A failed fetch
keeps the previous rows. Changing server or account clears them and
revokes artwork grants.

Artwork requires authentication on the server. The publisher fetches it
with the session-bound HTTP client into private files. A disabled-by-default
FileProvider is enabled on TVs, with read grants for each image to the
installed HOME handlers and the TV provider. No token or server URL goes
into the TV provider. Images no longer in use are removed.

Links are explicit VIEW intents to MainActivity, with data
`matinee://watch-next/<server-and-account-hash>/<item-id>`. MainActivity
checks the session, identity and file before opening PlayerActivity with
no start override, just like Resume. The main activity stays below it for
Back. Signed-out, stale-account and missing-file links leave the app's
normal root visible.

A launcher removal sets `browsable=0`. The publisher remembers its server
engagement timestamp even if the item leaves the lists. It only replaces
the hidden row after that item has playback position and a later server
timestamp. Missing rows are remembered too, for launchers that delete them.
It never writes the system-owned browsable flag.

Continue watching supplies `progress.updatedAt`. Next up supplies
`NextUpEntry.lastWatchedAt`, the server timestamp of the last finished
episode of that show, and uses `WATCH_NEXT_TYPE_NEXT`. The next episode
stays unplayed, with no invented position or engagement time. Episode
cards use the show name as title, with episode title and season/episode
numbers in their own columns.

The [Watch Next attributes](https://developer.android.com/training/tv/discovery/watch-next-programs)
require last engagement time for both kinds. Position and duration are
required only for Continue watching. We also publish the content id,
playback intent, authenticated artwork and its aspect ratio, and episode
metadata described in the
[video program attributes](https://developer.android.com/training/tv/discovery/video-programs).
Membership still comes from the server, not a second set of client rules.

## Checking the provider

`adb shell content query --uri content://android.media.tv/watch_next_program`
shows nothing on TV images that restrict callers to their own package's
rows, even while the launcher shows Matinee's cards. Look at the launcher's
Play Next row instead.
