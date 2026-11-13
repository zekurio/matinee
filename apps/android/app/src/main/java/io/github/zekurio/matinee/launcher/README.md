# Watch Next

On a TV, `MatineeApp` publishes Continue watching and Next up to the
launcher's Watch Next row. It uses the framework's
`TvContract.WatchNextPrograms`, available from API 26, so there's no
tvprovider dependency. The server's lists decide what goes in and in what
order. The launcher has the final say on how the row looks.

## Sync

Sync runs on sign-in, on foreground, when the viewer changes, after the
player's last progress report, and hourly through WorkManager. Rows keep
their ids, and only changed columns get written. A failed fetch keeps the
old rows. Switching server or account clears them and revokes artwork
grants.

Continue watching rows use `progress.updatedAt` as engagement time. Next up
rows use `NextUpEntry.lastWatchedAt`, the time the previous episode
finished, and `WATCH_NEXT_TYPE_NEXT`, with no position. Episode cards put
the show name in the title and the episode title and numbers in their own
columns.

## Artwork

Artwork needs a session, so the publisher downloads it with the
authenticated client into private files. A FileProvider, off by default
and enabled on TVs, grants read access per image to the HOME apps and the
TV provider. No token or server URL goes into the provider. Unused images
get deleted.

## Links

Each card opens MainActivity with
`matinee://watch-next/<server-and-account-hash>/<item-id>`. MainActivity
checks the session, account, and file, then opens PlayerActivity like
Resume does, with MainActivity under it for Back. A signed-out, stale, or
missing link just shows the app's home.

## Removed cards

When a user removes a card, the launcher sets `browsable=0`. The publisher
never writes that flag. It remembers the server timestamp of the removed
item and only puts it back once there's playback progress with a newer
timestamp. It does the same for rows the launcher deletes outright.

## Checking it

`adb shell content query --uri content://android.media.tv/watch_next_program`
returns nothing on TV images that only show callers their own rows. Look
at the launcher's Play Next row instead.
