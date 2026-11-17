# The dev server for simulators

`scripts/dev/` runs a Matinee server on a Mac for the simulators to sign in
to, at **http://localhost:18420**, with a small library of test patterns
and two accounts. It listens on IPv6 loopback only. It's a development
tool, not a way to run Matinee.

Its state is in `~/.t3/scratch/matinee-ios-dev/`, one per Mac, shared by
every checkout. `start`, `stop`, and `reseed` take a file lock, so two
checkouts don't run them at once. Don't reseed while someone else's
simulator is using it: every token stops working.

## Commands

All are in `apps/ios/scripts/dev/` and run from any directory. They need
Nix, Python 3, Git, and `ffmpeg` and `ffprobe` on `PATH`; `run` takes
Node 24, pnpm 11, and Postgres 17 from a pinned nixpkgs.

| Script                   | What it does                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start`                  | Clones the server at `PIN` in `dev.py` if it isn't there, builds it, starts Postgres and Node, and waits for the health check                                            |
| `stop`                   | Stops Node, then Postgres. Media and state stay                                                                                                                          |
| `reseed --yes`           | Stops everything, deletes the database and the server's data, makes any missing media, starts, seeds, scans, and queues trickplay                                        |
| `token [account]`        | Prints a new bearer token for `ios-admin` (the default) or `ios-viewer`                                                                                                  |
| `approve CODE [account]` | Approves the device code a simulator shows                                                                                                                               |
| `verify`                 | Signs in both accounts by device code, checks Home, favorites, and library access, fetches an encoded stream, and checks which files get direct play and a copied stream |

The server doesn't come back after a reboot; run `start` again. `start`
never moves an existing checkout to another commit. To update it, stop,
check out the commit you want in `server/` under the state folder, run
`pnpm install --frozen-lockfile && pnpm build` there in the same Nix shell
`run` uses, and start. Change `PIN` too, so a new Mac gets the same.

`just ios dev`, `just ios gallery`, and `just ios tv-dev` launch a
simulator already signed in, with a token from `token`.

## Accounts

| Username     | Role  | Libraries                        |
| ------------ | ----- | -------------------------------- |
| `ios-admin`  | Admin | Movies, Restricted movies, Shows |
| `ios-viewer` | User  | Movies, Shows                    |

Neither has a passkey or an OIDC identity, so the browser sign-in can't be
tried here. `token` writes a session row straight into Postgres, hashed as
`auth/session.ts` does it. `approve` uses such a session to call the real
`POST /api/v1/auth/device/{userCode}/approve`, so the device-code flow
itself runs as it does in production. The database trusts the Mac's user on
a private Unix socket and has no TCP listener.

```sh
TOKEN=$(apps/ios/scripts/dev/token ios-admin)
curl -fsS -H "Authorization: Bearer $TOKEN" \
  http://localhost:18420/api/v1/home/continue-watching
```

Both accounts start with S01E01 and S01E02 watched, S01E03 in Next up, Toy
Story watched, both Matrix files partly watched, and The Matrix a favorite.

## Library

`media.py` makes the files with ffmpeg. They are test patterns named after
films, not the films: each draws its file name and a running timecode and
plays a tone. Most are 24 seconds at 640×360 and 10 fps.

| Library / title                         | What it's for                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Movies / The Matrix, 1999               | 22 minutes of H.264 and AAC in MP4, English and German audio and embedded text subtitles. Seeking, resume, trickplay         |
| Movies / The Matrix Alternate           | A second file in `The Matrix (1999)/Extras`, which the server groups under the same movie                                    |
| Movies / Back to the Future, 1985       | MP4, two audio languages, two embedded mov_text subtitles                                                                    |
| Movies / Toy Story, 1995                | MP4 for direct play, with an `.en.srt` beside it                                                                             |
| Movies / MPV Styled Verification        | Two minutes of MKV with the same styled ASS track embedded and as `.en.ass`: bold yellow Arial 32 at (80,140). mpv's styling |
| Movies / Interstellar, 2014             | HEVC in MKV, AC-3 5.1, two audio languages, embedded SRT. A copied stream for a device that takes only MP4                   |
| Restricted movies / Blade Runner, 1982  | 3840×2160 HEVC in MKV, AC-3 5.1, eight seconds                                                                               |
| Restricted movies / Dune, 2021          | 10-bit HEVC tagged BT.2020 and PQ. The tags are synthetic; it says nothing about color                                       |
| Restricted movies / Jurassic Park, 1993 | MPEG-2 and Opus in MKV, SRT and embedded PGS, which draws a white bar at seconds 1 to 8. AVPlayer needs an encode            |
| Shows / Breaking Bad, 2008              | Two seasons of three one-minute episodes                                                                                     |

To make only the styled file somewhere else:

```sh
python3 apps/ios/scripts/dev/media.py --root /tmp/matinee-media --only-styled
```

## Metadata

The libraries have no metadata provider, so titles have names and years but
no artwork, cast, or summaries. To get them, put a key in a mode-0600
`metadata.env` in the state folder, restart, and pick the provider on each
library in the admin settings. A reseed makes the libraries without one
again.

```sh
MATINEE_TMDB_API_KEY=your_key
# or MATINEE_TVDB_API_KEY, with MATINEE_TVDB_PIN if it needs one
```

The server transcodes with VideoToolbox and the Mac's own ffmpeg, not
jellyfin-ffmpeg, so tone mapping and its throttling patches aren't covered.
