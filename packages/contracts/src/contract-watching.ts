import { eventIterator, oc } from "@orpc/contract"

import { get, post, put } from "./contract-routes"
import {
  PlaybackSeek,
  PlaybackSeekInput,
  PlaybackStart,
  PlaybackStartInput,
} from "./playback-start"
import { PlaybackOptions } from "./preferences"
import { t } from "./schema"
import { FeaturedTitle, MediaItem, TitleSummary, WatchedAt } from "./schemas"
import {
  Leaderboard,
  LibraryStats,
  LiveActivity,
  Profile,
  ProfileName,
  ServerStats,
  SessionStream,
  StatsInput,
  WatchedEntry,
  WatchStats,
} from "./stats"
import { SubtitlePick, TrackPicks } from "./streams"

/**
 * A sitting with a file that a player had while the server was out of
 * reach, as when watching a download: the id the player made for it, when
 * it began and ended, the time spent playing, and where it stopped.
 */
export const OfflinePlay = t.object({
  sessionId: t.uuid(),
  itemId: t.uuid(),
  startedAt: t.date(),
  endedAt: t.date(),
  playedSeconds: t.number().min(0),
  positionSeconds: t.number().min(0),
  durationSeconds: t.number().positive().optional(),
})
export type OfflinePlay = t.infer<typeof OfflinePlay>

export const playbackContract = oc.tag("Playback").router({
  /**
   * How a file plays on a device: the source to load, the audio and
   * subtitle that start, the file's tracks, and the next episode. A
   * player calls it to begin, and again with what changed when the viewer
   * picks a track or a quality, or when a source fails. Nothing is kept
   * between calls, so each one carries every pick made so far. Fails with
   * `PLAYBACK_UNPLAYABLE` when nothing the device plays is left.
   */
  start: post("/playback/start")
    .input(PlaybackStartInput)
    .output(PlaybackStart),
  /**
   * A seek in a `remux` source, which can't seek by itself: a new stream
   * from the keyframe near the point. Cheaper than `start`, since the
   * tracks and the method stay as they are.
   */
  seek: post("/playback/seek").input(PlaybackSeekInput).output(PlaybackSeek),
  /**
   * Players call this every ten seconds while playing, every thirty while
   * paused, and at once on play, pause, seek, and close. A session drops
   * out of `stats.live` 45 seconds after its last report, or two minutes
   * when paused. Positions near the end mark the file watched.
   *
   * Statistics count a report only with `sessionId` and `playedSeconds`.
   * The player makes the id, a UUID per sitting with the file, and sends
   * it in `mediaPlaybackPath()` too. `playedSeconds` is the time it has
   * spent playing in the session so far, without pauses and buffering;
   * the server never counts more than the time since the session began.
   */
  report: post("/media/{itemId}/progress")
    .input(
      t.object({
        itemId: t.uuid(),
        positionSeconds: t.number().min(0),
        durationSeconds: t.number().positive().optional(),
        sessionId: t.uuid().optional(),
        playedSeconds: t.number().min(0).optional(),
        /** Playback is paused, so the session shows as paused for a while. */
        paused: t.boolean().optional(),
        /** The player closed. Another report reopens the session. */
        closed: t.boolean().optional(),
      }),
    )
    .output(t.void()),
  /**
   * Plays a player had offline, sent once the server answers again, for
   * statistics. Each counts as a session at the time it happened, of no
   * more than the time between its start and end. Sending one again
   * changes nothing, and one that goes on a session the server already
   * has, which lost its connection, extends it. Plays of files that are
   * gone, and ones that end in the future, are left out. Where the person
   * got to still goes through `report`.
   */
  offline: post("/playback/offline")
    .input(t.object({ plays: t.array(OfflinePlay).min(1).max(200) }))
    .output(t.void()),
  /**
   * What a player's playback settings can offer here: the codecs this
   * server encodes to, and the languages the libraries' tracks are in.
   */
  options: get("/playback/options").output(PlaybackOptions),
  /**
   * The tracks a file starts with from the viewer's earlier picks, which a
   * player reads before it picks by the preferences' languages. See
   * `TrackPicks`. A file the background probe hasn't reached yet, or the
   * file a match comes from, is probed first, like `media.subtitles`.
   */
  tracks: get("/media/{itemId}/tracks")
    .input(t.object({ itemId: t.uuid() }))
    .output(TrackPicks),
  /**
   * Keep a track the viewer picked in the player, for the next time the
   * file plays and for the other files of its title. Leave out what the
   * viewer didn't pick. A kind of pick the preferences don't remember
   * (`rememberAudio`, `rememberSubtitles`) isn't kept.
   */
  /**
   * What the server does for one of the viewer's player sessions, the id
   * in `mediaPlaybackPath()`: how it plays, and for a transcode, the
   * encoders and whether a GPU helps. Again on each change. Null until the
   * session reports or starts a stream, and for another user's session.
   */
  stream: get("/playback/sessions/{sessionId}/stream")
    .input(t.object({ sessionId: t.uuid() }))
    .output(eventIterator(SessionStream.nullable())),
  pickTracks: put("/media/{itemId}/tracks")
    .input(
      t.object({
        itemId: t.uuid(),
        /** An `AudioTrack.index`. */
        audio: t.number().int().nonnegative().optional(),
        subtitle: SubtitlePick.optional(),
      }),
    )
    .output(t.void()),
  /**
   * Mark a file watched or unwatched by hand. Marking it watched counts in
   * statistics as a play at `watchedAt`, now if left out, of the runtime
   * from the resume point on. A file already watched stays as it is.
   * Unwatched takes back the plays marking added; what the player
   * recorded stays.
   */
  setWatched: put("/media/{itemId}/watched")
    .input(
      t.object({
        itemId: t.uuid(),
        watched: t.boolean(),
        watchedAt: WatchedAt.optional(),
      }),
    )
    .output(t.void()),
  /**
   * Mark every file of a title watched or unwatched, as `setWatched` does
   * one. `season` narrows to one season as in `titles.items`; null picks
   * the files without one.
   */
  setTitleWatched: put("/titles/{titleId}/watched")
    .input(
      t.object({
        titleId: t.uuid(),
        season: t.number().int().min(0).nullable().optional(),
        watched: t.boolean(),
        watchedAt: WatchedAt.optional(),
      }),
    )
    .output(t.void()),
})

export const homeContract = oc.tag("Home").router({
  /** Files the user started and didn't finish, most recent first. */
  continueWatching: get("/home/continue-watching")
    .input(t.object({ limit: t.number().int().min(1).max(50).$default(12) }))
    .output(t.array(MediaItem)),
  /** For each show the user is watching, the episode after the last one finished. */
  nextUp: get("/home/next-up")
    .input(t.object({ limit: t.number().int().min(1).max(50).$default(12) }))
    .output(t.array(MediaItem)),
  /**
   * Titles for the banner across every library: the newest, alternating
   * with well-rated ones picked at random. Leaves out titles the user
   * started, except a show whose next episode arrived after they last
   * watched it.
   */
  featured: get("/home/featured")
    .input(t.object({ limit: t.number().int().min(1).max(12).$default(6) }))
    .output(t.array(FeaturedTitle)),
})

export const favoritesContract = oc.tag("Favorites").router({
  /** The signed-in user's favorite titles, newest first. */
  list: get("/favorites")
    .input(t.object({ limit: t.number().int().min(1).max(200).$default(60) }))
    .output(t.array(TitleSummary)),
  /** The signed-in user's favorite files, such as episodes, newest first. */
  items: get("/favorites/items")
    .input(t.object({ limit: t.number().int().min(1).max(200).$default(60) }))
    .output(t.array(MediaItem)),
  /** Mark a title as a favorite or not. Either is fine to repeat. */
  set: put("/titles/{titleId}/favorite")
    .input(t.object({ titleId: t.uuid(), favorite: t.boolean() }))
    .output(t.void()),
  /**
   * Mark a file, such as an episode, as a favorite or not. Either is fine
   * to repeat. Mark a movie through its title with `set`.
   */
  setItem: put("/media/{itemId}/favorite")
    .input(t.object({ itemId: t.uuid(), favorite: t.boolean() }))
    .output(t.void()),
})

/**
 * Everyone on the server can see each other's profiles. What a profile
 * shows beyond the name and picture is up to its owner, see
 * `ProfileSharing`.
 */
export const profilesContract = oc.tag("Profiles").router({
  get: get("/profiles/{username}")
    .input(t.object({ username: ProfileName }))
    .output(Profile),
  /** Null when the owner doesn't share statistics. */
  stats: get("/profiles/{username}/stats")
    .input(StatsInput.extend({ username: ProfileName }))
    .output(WatchStats.nullable()),
  /**
   * The latest file of each title the owner played, newest first, as the
   * profile's `recent` lists a dozen of. Null when the owner doesn't share
   * statistics.
   */
  recent: get("/profiles/{username}/recent")
    .input(
      t.object({
        username: ProfileName,
        limit: t.number().int().min(1).max(200).$default(60),
      }),
    )
    .output(t.array(WatchedEntry).nullable()),
})

/** What everyone watched, how the server played it, and the libraries. */
export const statsContract = oc.tag("Statistics").router({
  /** Everyone's watching and how it played. Admins only. */
  server: get("/stats").input(StatsInput).output(ServerStats),
  /**
   * Who is watching right now, as a stream: the current state first, then
   * again whenever it changes. Over REST it's server-sent events. The
   * server ends the stream every few minutes; reconnect to keep following.
   * Admins only.
   */
  live: get("/stats/live").output(eventIterator(LiveActivity)),
  /** What the libraries hold, and how they grew over the range. */
  library: get("/stats/library").input(StatsInput).output(LibraryStats),
  /** People who share their statistics, ranked, and the signed-in user. */
  leaderboard: get("/stats/leaderboard").input(StatsInput).output(Leaderboard),
})
