import { t } from "./schema"
import { TranscodeVideoCodec } from "./transcoding"

/*
 * Playback preferences. The languages and skips follow the user to every
 * device, so the account keeps them. Codecs and quality depend on what a
 * device can play, so each player keeps those itself.
 */

/** A BCP 47 tag as tracks carry them, like `en`, `ja`, or `pt-BR`. */
export const LanguageTag = t
  .string()
  .max(35)
  .regex(
    /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/,
    "Use a language tag, like en or pt-BR.",
  )

/**
 * Which subtitles a file starts with:
 * - `default`: the track the file marks default, or a forced track.
 * - `always`: a full track in the subtitle language.
 * - `foreign`: a full track in the subtitle language when the audio is in
 *   another one, else as `forced`.
 * - `forced`: only a forced track, which translates foreign dialogue and
 *   signs: one in the audio's language, else in the subtitle language.
 * - `off`: none.
 */
export const SUBTITLE_MODES = [
  "default",
  "always",
  "foreign",
  "forced",
  "off",
] as const
export const SubtitleMode = t.enum(SUBTITLE_MODES)
export type SubtitleMode = t.infer<typeof SubtitleMode>

/** Stands for the language a title was made in, from its metadata. */
export const ORIGINAL_LANGUAGE = "original"

/** A language tag, or `original` for the title's own language. */
export const AudioLanguage = t.union([
  t.literal(ORIGINAL_LANGUAGE),
  LanguageTag,
])
export type AudioLanguage = t.infer<typeof AudioLanguage>

/** How far the players' settings offer to skip, in seconds. */
export const SKIP_STEPS = [5, 10, 15, 20, 30, 45, 60] as const

/** Seconds a skip button or key moves. */
export const SkipSeconds = t.number().int().min(1).max(120)

/** A skip length when the account hasn't chosen one. */
export const DEFAULT_SKIP_SECONDS = 10

/** The audio, subtitle, and skip choices an account syncs to its devices. */
export const PlaybackPreferences = t.object({
  /**
   * Play the best track in this language when the file has one; `original`
   * takes the title's `originalLanguage`. Null, or a file without such a
   * track, plays the track the file marks default.
   */
  audioLanguage: AudioLanguage.nullable(),
  subtitleMode: SubtitleMode,
  /**
   * For full tracks in `always` and `foreign`, and for forced tracks when
   * none is in the audio's language. Null uses the device's language.
   */
  subtitleLanguage: LanguageTag.nullable(),
  /**
   * A subtitle pick in the player sets the mode and language for the files
   * after it: a track turns subtitles on in its language, and off goes back
   * to forced tracks only.
   */
  rememberSubtitles: t.boolean(),
  /**
   * How far back and ahead the skip buttons, keys, and taps move. Saved
   * preferences from before these existed read with the defaults.
   */
  skipBackSeconds: SkipSeconds.$default(DEFAULT_SKIP_SECONDS),
  skipForwardSeconds: SkipSeconds.$default(DEFAULT_SKIP_SECONDS),
})
export type PlaybackPreferences = t.infer<typeof PlaybackPreferences>

/** What an account that never changed its preferences plays with. */
export const DEFAULT_PLAYBACK_PREFERENCES: Readonly<PlaybackPreferences> =
  Object.freeze({
    audioLanguage: null,
    subtitleMode: "default",
    subtitleLanguage: null,
    rememberSubtitles: true,
    skipBackSeconds: DEFAULT_SKIP_SECONDS,
    skipForwardSeconds: DEFAULT_SKIP_SECONDS,
  })

/** Codecs a stream can convert an audio track to. */
export const TRANSCODE_AUDIO_CODECS = ["opus", "aac"] as const
export const TranscodeAudioCodec = t.enum(TRANSCODE_AUDIO_CODECS)
export type TranscodeAudioCodec = t.infer<typeof TranscodeAudioCodec>

/** What a player's playback settings can offer on this server. */
export const PlaybackOptions = t.object({
  /**
   * The codecs an encode can produce here, H.264 first. A player lists the
   * ones it wants in `mediaHlsPath()`.
   */
  videoCodecs: t.array(TranscodeVideoCodec),
  /** The codecs a stream can convert audio to here, AAC always among them. */
  audioCodecs: t.array(TranscodeAudioCodec),
  /** The languages of the audio tracks in the libraries, most files first. */
  audioLanguages: t.array(LanguageTag),
  /** The languages of the subtitle tracks in the libraries, most files first. */
  subtitleLanguages: t.array(LanguageTag),
})
export type PlaybackOptions = t.infer<typeof PlaybackOptions>
