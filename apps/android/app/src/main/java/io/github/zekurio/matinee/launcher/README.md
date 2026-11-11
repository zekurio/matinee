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

Continue watching supplies `progress.updatedAt`. Next up usually has no
progress or engagement time. We leave these columns null rather than use
the sync time or the file modification time. A server-supplied show
engagement time would let launchers sort and display Next up reliably.

## Checking the provider

The shell's `content query` sees only the shell's rows on TV images that
restrict callers to their own package. The instrumentation probe reads
Matinee's rows from its own context, without exporting a debug endpoint.
Bring the signed-in app to the foreground before probing to run a sync.

```sh
nix develop ../..#android -c ./gradlew testDebugUnitTest assembleDebug assembleDebugAndroidTest
adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5554 install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s emulator-5554 shell am instrument -w \
  io.github.zekurio.matinee.debug.test/io.github.zekurio.matinee.launcher.WatchNextProbe
```

After signing out, pass `-e empty true` before `-w` to assert there are no
rows. `-e signOut true -e empty true` invokes the session's sign-out and
checks cleanup, for TV builds whose Settings page is not available yet.
Instrumentation restarts the app process, so leave the player first.
