import {
  DEFAULT_PLAYBACK_PREFERENCES,
  PlaybackPreferences,
  type SubtitlePick,
  type SubtitleTrack,
  type TrackPicks,
} from "@matinee/contracts"
import {
  type MediaItemRow,
  mediaItem,
  trackPick,
  type UserRow,
} from "@matinee/db"
import { and, eq, or } from "drizzle-orm"

import { db } from "../db"
import { listAudio } from "./playback"
import { listSubtitles } from "./subtitles"

/*
 * Track picks the way Jellyfin remembers them: a file plays again with the
 * tracks the viewer picked in it, and a file they never picked in, like
 * the next episode, gets the track most like their latest pick in another
 * file of the same title. The preferences' languages decide the rest.
 */

/** What matching compares of an audio or subtitle track. */
type Comparable = {
  language: string | null
  title: string | null
  /** The codec or format. */
  kind: string
}

// Jellyfin's bar: a language and a codec, or a title and a place, say
// it's the same track; a codec and a place alone don't.
const MATCH_SCORE = 3

/**
 * How alike a track is to the one picked: the same language or title
 * counts 2, the same codec or format and the same place among the file's
 * tracks 1 each.
 */
function likeness(
  picked: Comparable,
  pickedAt: number,
  track: Comparable,
  at: number,
): number {
  let score = 0
  if (picked.language !== null && picked.language === track.language) {
    score += 2
  }
  if (picked.title && picked.title === track.title) score += 2
  if (picked.kind === track.kind) score += 1
  if (pickedAt === at) score += 1
  return score
}

/**
 * The track in `tracks` most like `from[pickedAt]`, if one is alike
 * enough. `fits` rules tracks out, and `bonus` adds to a track's score.
 */
function closest<T extends Comparable>(
  from: readonly T[],
  pickedAt: number,
  tracks: readonly T[],
  fits: (picked: T, track: T) => boolean = () => true,
  bonus: (picked: T, track: T) => number = () => 0,
): T | undefined {
  const picked = from[pickedAt]
  if (!picked) return undefined
  let best: T | undefined
  let bestScore = MATCH_SCORE - 1
  tracks.forEach((track, at) => {
    if (!fits(picked, track)) return
    const score = likeness(picked, pickedAt, track, at) + bonus(picked, track)
    if (score > bestScore) {
      best = track
      bestScore = score
    }
  })
  return best
}

/** The preferences of a user, or the defaults when they never set any. */
function preferencesOf(user: UserRow): PlaybackPreferences {
  return (
    PlaybackPreferences.safeParse(user.playbackPreferences).data ??
    DEFAULT_PLAYBACK_PREFERENCES
  )
}

/** A file's picks, with the file. */
type Picks = typeof trackPick.$inferSelect & { item: MediaItemRow }

/** The picks with a kind of pick made last, in a file other than `itemId`. */
function latestElsewhere(
  rows: readonly Picks[],
  itemId: string,
  pickedAt: (row: Picks) => Date | null,
): Picks | undefined {
  let latest: Picks | undefined
  for (const row of rows) {
    const at = pickedAt(row)
    if (row.mediaItemId === itemId || !at) continue
    const latestAt = latest && pickedAt(latest)
    if (!latestAt || at > latestAt) latest = row
  }
  return latest
}

/** The audio track in `item` most like the one picked in `from`. */
async function matchAudio(
  from: MediaItemRow,
  index: number,
  item: MediaItemRow,
): Promise<number | null> {
  const [before, now] = await Promise.all([listAudio(from), listAudio(item)])
  const comparable = (track: (typeof before)[number]) => ({
    ...track,
    kind: track.codec,
  })
  const match = closest(
    before.map(comparable),
    before.findIndex((track) => track.index === index),
    now.map(comparable),
  )
  return match?.index ?? null
}

/**
 * The subtitle pick in `item` most like the one picked in `from`. Off
 * stays off. A forced track never stands in for a full one, nor the other
 * way around, and a track the player can't draw by itself never comes up.
 */
async function matchSubtitle(
  from: MediaItemRow,
  trackId: string | null,
  item: MediaItemRow,
): Promise<SubtitlePick | null> {
  if (trackId === null) return { trackId: null }
  const [before, now] = await Promise.all([
    listSubtitles(from),
    listSubtitles(item),
  ])
  const comparable = (track: SubtitleTrack) => ({
    ...track,
    kind: track.format,
  })
  const match = closest(
    before.tracks.map(comparable),
    before.tracks.findIndex((track) => track.id === trackId),
    now.tracks.map(comparable),
    (picked, track) =>
      picked.forced === track.forced &&
      (track.delivery === "webvtt" || track.delivery === "pgs"),
    (picked, track) => (picked.sdh === track.sdh ? 1 : 0),
  )
  return match ? { trackId: match.id } : null
}

/** The tracks `item` starts with from `user`'s picks. See `TrackPicks`. */
export async function rememberedTracks(
  user: UserRow,
  item: MediaItemRow,
): Promise<TrackPicks> {
  const preferences = preferencesOf(user)
  const none: TrackPicks = { audio: null, subtitle: null }
  if (!preferences.rememberAudio && !preferences.rememberSubtitles) {
    return none
  }
  const rows = await db
    .select({ pick: trackPick, item: mediaItem })
    .from(trackPick)
    .innerJoin(mediaItem, eq(mediaItem.id, trackPick.mediaItemId))
    .where(
      and(
        eq(trackPick.userId, user.id),
        item.titleId
          ? or(
              eq(trackPick.mediaItemId, item.id),
              eq(mediaItem.titleId, item.titleId),
            )
          : eq(trackPick.mediaItemId, item.id),
      ),
    )
  const picks = rows.map((row) => ({ ...row.pick, item: row.item }))
  const own = picks.find((row) => row.mediaItemId === item.id)

  let audio: number | null = null
  if (preferences.rememberAudio) {
    if (own?.audioPickedAt && own.audioStreamIndex !== null) {
      audio = own.audioStreamIndex
    } else {
      const other = latestElsewhere(picks, item.id, (row) => row.audioPickedAt)
      if (other && other.audioStreamIndex !== null) {
        audio = await matchAudio(other.item, other.audioStreamIndex, item)
      }
    }
  }

  let subtitle: SubtitlePick | null = null
  if (preferences.rememberSubtitles) {
    if (own?.subtitlePickedAt) {
      subtitle = { trackId: own.subtitleTrackId }
    } else {
      const other = latestElsewhere(
        picks,
        item.id,
        (row) => row.subtitlePickedAt,
      )
      if (other) {
        subtitle = await matchSubtitle(other.item, other.subtitleTrackId, item)
      }
    }
  }
  return { audio, subtitle }
}

/**
 * Keep the tracks `user` picked in `item`'s player, the kinds their
 * preferences remember. Left out means not picked.
 */
export async function savePick(
  user: UserRow,
  item: MediaItemRow,
  pick: { audio?: number; subtitle?: SubtitlePick },
): Promise<void> {
  const preferences = preferencesOf(user)
  const now = new Date()
  const audio =
    preferences.rememberAudio && pick.audio !== undefined
      ? { audioStreamIndex: pick.audio, audioPickedAt: now }
      : null
  const subtitle =
    preferences.rememberSubtitles && pick.subtitle !== undefined
      ? { subtitleTrackId: pick.subtitle.trackId, subtitlePickedAt: now }
      : null
  if (!audio && !subtitle) return
  const set = { ...audio, ...subtitle }
  await db
    .insert(trackPick)
    .values({ userId: user.id, mediaItemId: item.id, ...set })
    .onConflictDoUpdate({
      target: [trackPick.userId, trackPick.mediaItemId],
      set,
    })
}
