import { t } from "./schema"
import {
  LibraryKind,
  MediaItem,
  ProfileSharing,
  ProfileUser,
  TitleSummary,
} from "./schemas"
import { PlaybackQuality } from "./transcoding"

/*
 * Statistics come from playback sessions: one per sitting with one file,
 * which the player reports on like progress. Watch time is time spent
 * playing, not counting pauses or buffering. A session counts as a play
 * once it has played a minute or reached the end, so stray clicks stay out.
 * Marking a file watched adds a play of the runtime the player didn't
 * cover, at the time the user gave.
 */

/** How far back statistics look, ending now. */
export const STATS_RANGES = ["7d", "30d", "90d", "365d", "all"] as const
export const StatsRange = t.enum(STATS_RANGES)
export type StatsRange = t.infer<typeof StatsRange>

// Building a formatter costs far more than the rest of a parse. Only zones
// that worked are kept, so the set stays as small as the IANA list.
const knownTimeZones = new Set<string>()

function isTimeZone(value: string): boolean {
  if (knownTimeZones.has(value)) return true
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    knownTimeZones.add(value)
    return true
  } catch {
    return false
  }
}

/** An IANA time zone, like `Europe/Berlin`. Days and hours count in it. */
export const TimeZone = t
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9_+\-/]+$/, "Use an IANA time zone like Europe/Berlin.")
  .refine(isTimeZone, "Use an IANA time zone like Europe/Berlin.")

export const StatsInput = t.object({
  range: StatsRange.$default("30d"),
  timeZone: TimeZone.$default("UTC"),
})
export type StatsInput = t.infer<typeof StatsInput>

/**
 * The most the server did to play a session: `direct` sent the file as it
 * is, `remux` copied the video into a stream (converting the audio or
 * not), `transcode` encoded the video.
 */
export const PLAYBACK_METHODS = ["direct", "remux", "transcode"] as const
export const PlaybackMethod = t.enum(PLAYBACK_METHODS)
export type PlaybackMethod = t.infer<typeof PlaybackMethod>

/** How long each bucket of `WatchStats.buckets` is. */
export const STATS_UNITS = ["day", "week", "month"] as const
export const StatsUnit = t.enum(STATS_UNITS)
export type StatsUnit = t.infer<typeof StatsUnit>

export const WatchTotals = t.object({
  watchSeconds: t.number(),
  plays: t.number().int(),
  /** Movies played to the end. */
  movies: t.number().int(),
  /** Episodes played to the end, each counted once. */
  episodes: t.number().int(),
  /** Shows with at least one play. */
  shows: t.number().int(),
})
export type WatchTotals = t.infer<typeof WatchTotals>

/** Watch time in one day, week (from Monday), or month. */
export const StatsBucket = t.object({
  /** The first day, YYYY-MM-DD in the requested time zone. */
  start: t.string(),
  watchSeconds: t.number(),
  plays: t.number().int(),
})
export type StatsBucket = t.infer<typeof StatsBucket>

/** Watch time of sessions that started in one hour of one weekday. */
export const ActivityCell = t.object({
  /** 1 is Monday, 7 Sunday. */
  weekday: t.number().int().min(1).max(7),
  hour: t.number().int().min(0).max(23),
  watchSeconds: t.number(),
})
export type ActivityCell = t.infer<typeof ActivityCell>

export const GenreStat = t.object({
  name: t.string(),
  /** Time spent on titles in the genre. A title in two genres counts in both. */
  watchSeconds: t.number(),
})
export type GenreStat = t.infer<typeof GenreStat>

export const TitleStat = t.object({
  title: TitleSummary,
  watchSeconds: t.number(),
  plays: t.number().int(),
})
export type TitleStat = t.infer<typeof TitleStat>

/** What someone, or everyone, watched in a range. */
export const WatchStats = t.object({
  range: StatsRange,
  unit: StatsUnit,
  totals: WatchTotals,
  /** Oldest first, with empty buckets included, through the current one. */
  buckets: t.array(StatsBucket),
  /** Only the hours with watch time. */
  activity: t.array(ActivityCell),
  /** Most watched first, at most 8, from titles with at least one play. */
  genres: t.array(GenreStat),
  /**
   * Titles with at least one play, most watched first, at most 10.
   * Removed titles drop out.
   */
  titles: t.array(TitleStat),
})
export type WatchStats = t.infer<typeof WatchStats>

export const MethodStat = t.object({
  method: PlaybackMethod,
  plays: t.number().int(),
  watchSeconds: t.number(),
})
export type MethodStat = t.infer<typeof MethodStat>

/** Plays per value, such as an encoder, a codec, or a browser. */
export const NamedCount = t.object({
  name: t.string(),
  plays: t.number().int(),
})
export type NamedCount = t.infer<typeof NamedCount>

export const TranscodingStats = t.object({
  /** Plays that encoded the video. */
  videoTranscodes: t.number().int(),
  /** Of those, the ones a GPU encoded. */
  hardwareEncodes: t.number().int(),
  /** Plays that converted the audio, whatever happened to the video. */
  audioConversions: t.number().int(),
  /** Plays that tone mapped HDR to SDR. */
  toneMapped: t.number().int(),
  /** How long ffmpeg ran encoding, summed over every stream. */
  encodeSeconds: t.number(),
  /** ffmpeg's video encoders, like `libx264` or `h264_vaapi`. */
  encoders: t.array(NamedCount),
  /** ffmpeg's names for the video codecs that needed encoding. */
  videoCodecs: t.array(NamedCount),
  /** ffmpeg's names for the audio codecs that needed converting. */
  audioCodecs: t.array(NamedCount),
})
export type TranscodingStats = t.infer<typeof TranscodingStats>

export const UserStat = t.object({
  user: ProfileUser,
  watchSeconds: t.number(),
  plays: t.number().int(),
})
export type UserStat = t.infer<typeof UserStat>

/** What the libraries hold now. */
export const LibraryTotals = t.object({
  movies: t.number().int(),
  shows: t.number().int(),
  /** Files in shows. */
  episodes: t.number().int(),
  files: t.number().int(),
  sizeBytes: t.number(),
  /** Length of the files the server has measured. */
  durationSeconds: t.number(),
})
export type LibraryTotals = t.infer<typeof LibraryTotals>

/**
 * Files that arrived in one day, week, or month. A file arrived when it
 * appeared on its disk, or when a scan found it if that came first, so a
 * new server still shows when its files were downloaded.
 */
export const LibraryGrowthBucket = t.object({
  /** The first day, YYYY-MM-DD in the requested time zone. */
  start: t.string(),
  /** Files of movies that arrived in the bucket. */
  movies: t.number().int(),
  /** Files of shows that arrived in the bucket. */
  episodes: t.number().int(),
  sizeBytes: t.number(),
  /** Files in the libraries at the bucket's end, counting from the oldest. */
  totalFiles: t.number().int(),
  totalSizeBytes: t.number(),
})
export type LibraryGrowthBucket = t.infer<typeof LibraryGrowthBucket>

/** Files sharing a trait, like a resolution or a codec. */
export const QualityStat = t.object({
  /**
   * `4K`, `1440p`, `1080p`, `720p`, or `SD` for resolutions; ffmpeg's codec
   * names; `sdr`, `hdr10`, `hlg`, or `dolby-vision` for dynamic range.
   * `unknown` for files ffprobe hasn't read or couldn't.
   */
  name: t.string(),
  files: t.number().int(),
  sizeBytes: t.number(),
})
export type QualityStat = t.infer<typeof QualityStat>

export const LibraryShare = t.object({
  id: t.uuid(),
  name: t.string(),
  kind: LibraryKind,
  titles: t.number().int(),
  files: t.number().int(),
  sizeBytes: t.number(),
  durationSeconds: t.number(),
})
export type LibraryShare = t.infer<typeof LibraryShare>

/** What the libraries hold, how they grew, and in what quality. */
export const LibraryStats = t.object({
  range: StatsRange,
  unit: StatsUnit,
  totals: LibraryTotals,
  /** Oldest first, with empty buckets, through the current one. */
  growth: t.array(LibraryGrowthBucket),
  /** Most files first, as are the lists after it. */
  resolutions: t.array(QualityStat),
  videoCodecs: t.array(QualityStat),
  dynamicRange: t.array(QualityStat),
  /** The codec of each file's default audio track. */
  audioCodecs: t.array(QualityStat),
  /** By name. */
  libraries: t.array(LibraryShare),
})
export type LibraryStats = t.infer<typeof LibraryStats>

/** Everyone's watching and how the server played it. */
export const ServerStats = WatchStats.extend({
  /** People who watched anything. */
  viewers: t.number().int(),
  methods: t.array(MethodStat),
  transcoding: TranscodingStats,
  /** Most watch time first, at most 10. */
  users: t.array(UserStat),
  /** Browsers and apps, most plays first. */
  clients: t.array(NamedCount),
})
export type ServerStats = t.infer<typeof ServerStats>

/**
 * A session that's still open: it reported in the last 45 seconds, or in
 * the last two minutes when paused, and hasn't closed.
 */
export const NowPlaying = t.object({
  user: ProfileUser,
  /** Null when the file is gone from the library. */
  item: MediaItem.nullable(),
  method: PlaybackMethod,
  /** ffmpeg's codec of the file's video, null without video. */
  videoCodec: t.string().nullable(),
  /** ffmpeg's codec of the audio track that plays. */
  audioCodec: t.string().nullable(),
  audioConverted: t.boolean(),
  /** ffmpeg's audio encoder when the audio is converted, like `libopus`. */
  audioEncoder: t.string().nullable(),
  /** ffmpeg's video encoder for a transcode, like `h264_vaapi`. */
  videoEncoder: t.string().nullable(),
  hardwareEncoding: t.boolean(),
  /** A GPU decodes the source for the transcode. */
  hardwareDecoding: t.boolean(),
  /** Where tone mapping runs, like `tonemapx` or `opencl`. */
  toneMapper: t.string().nullable(),
  /** Null for the file as it is. */
  quality: PlaybackQuality.nullable(),
  positionSeconds: t.number(),
  /**
   * How long ago the player sent `positionSeconds`, by the server's clock
   * when it sent this state. Add the time since to estimate where it is now.
   */
  reportAgeSeconds: t.number().min(0),
  paused: t.boolean(),
  /** The browser and system, like `Firefox on Linux`. */
  client: t.string().nullable(),
  startedAt: t.date(),
  /** ffmpeg is running for it right now. */
  streaming: t.boolean(),
})
export type NowPlaying = t.infer<typeof NowPlaying>

export const LiveActivity = t.object({
  sessions: t.array(NowPlaying),
  /** ffmpeg processes playing right now, for any session. */
  streams: t.number().int(),
})
export type LiveActivity = t.infer<typeof LiveActivity>

/** A file someone played, for "recently watched". */
export const WatchedEntry = t.object({
  /** Its progress is the signed-in user's, as everywhere. */
  item: MediaItem,
  /** When the session last reported, or when the user said they watched it. */
  watchedAt: t.date(),
  /** That session reached the end. */
  completed: t.boolean(),
})
export type WatchedEntry = t.infer<typeof WatchedEntry>

export const Profile = t.object({
  user: ProfileUser,
  /** The signed-in user's own profile, which shows everything. */
  self: t.boolean(),
  sharing: ProfileSharing,
  /** Newest first. Null when the owner doesn't share them. */
  favorites: t.array(TitleSummary).nullable(),
  /**
   * Their favorite files, such as episodes, newest first. Null when the
   * owner doesn't share favorites.
   */
  favoriteItems: t.array(MediaItem).nullable(),
  /**
   * The latest file of each title they played, newest first. Null when
   * the owner doesn't share statistics.
   */
  recent: t.array(WatchedEntry).nullable(),
})
export type Profile = t.infer<typeof Profile>

/** Usernames in URLs, matched without regard to case. */
export const ProfileName = t.string().trim().min(1).max(64)

/**
 * What the leaderboard ranks. Streaks count days in a row with a play, in
 * the requested time zone; the current one runs up to today or yesterday
 * and ignores the range.
 */
export const LEADERBOARD_METRICS = [
  "watchTime",
  "plays",
  "currentStreak",
  "longestStreak",
  "movies",
  "episodes",
] as const
export const LeaderboardMetric = t.enum(LEADERBOARD_METRICS)
export type LeaderboardMetric = t.infer<typeof LeaderboardMetric>

export const LeaderboardEntry = t.object({
  /** 1 is first. People with the same value share a rank. */
  rank: t.number().int(),
  user: ProfileUser,
  /** Seconds for watch time, days for streaks, a count for the rest. */
  value: t.number(),
  /** The signed-in user. */
  self: t.boolean(),
})
export type LeaderboardEntry = t.infer<typeof LeaderboardEntry>

export const LeaderboardBoard = t.object({
  metric: LeaderboardMetric,
  /**
   * The top 10 with a value above zero, then, when the signed-in user
   * ranks lower, them with the places just above and below, in order.
   */
  entries: t.array(LeaderboardEntry),
})
export type LeaderboardBoard = t.infer<typeof LeaderboardBoard>

/**
 * Everyone who shares their statistics, ranked. The signed-in user is
 * always ranked too, but only they see themselves unless they share.
 */
export const Leaderboard = t.object({
  range: StatsRange,
  /** One per metric, in `LEADERBOARD_METRICS` order. */
  boards: t.array(LeaderboardBoard),
  /** The signed-in user shares their statistics, so others see them here. */
  sharing: t.boolean(),
})
export type Leaderboard = t.infer<typeof Leaderboard>
