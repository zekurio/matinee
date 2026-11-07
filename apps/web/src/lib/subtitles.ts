import {
  LanguageTag,
  type PlaybackPreferences,
  type SubtitleTrack,
} from "@matinee/contracts"

import { tr } from "@/i18n"

import { deviceLanguage, sameLanguage, trackLabel } from "./languages"

/** The language subtitles show in: the preference, else the device's. */
function subtitleLanguage(preferences: PlaybackPreferences): string {
  return preferences.subtitleLanguage ?? deviceLanguage()
}

/**
 * Whether the player draws the track over whatever plays. A `burn-in`
 * track needs an encode of its own, so only the viewer's pick shows one.
 */
export function drawable(track: SubtitleTrack): boolean {
  return track.delivery === "webvtt" || track.delivery === "pgs"
}

/**
 * The full or forced track to show for a language: the exact tag first,
 * then one the file marks default, then one without SDH.
 */
function bestInLanguage(
  tracks: SubtitleTrack[],
  language: string | null,
  forced = false,
): SubtitleTrack | null {
  let best: SubtitleTrack | null = null
  let bestScore = -1
  for (const track of tracks) {
    if (track.forced !== forced || !sameLanguage(track.language, language)) {
      continue
    }
    const score =
      (track.language === language ? 4 : 0) +
      (track.default ? 2 : 0) +
      (track.sdh ? 0 : 1)
    if (score > bestScore) {
      best = track
      bestScore = score
    }
  }
  return best
}

/**
 * The forced track for the audio: one in its language, which is the one
 * made for it, else one in the viewer's subtitle language. Files with
 * several dubs often have a forced track for each.
 */
function forcedTrack(
  tracks: SubtitleTrack[],
  audioLanguage: string | null,
  language: string,
): SubtitleTrack | null {
  return (
    bestInLanguage(tracks, audioLanguage, true) ??
    bestInLanguage(tracks, language, true)
  )
}

/**
 * The track to show when a file starts, or null for off, by the
 * preferences' `subtitleMode`. `audioLanguage` is the language of the
 * audio that plays.
 */
export function defaultTrack(
  tracks: SubtitleTrack[],
  audioLanguage: string | null,
  preferences: PlaybackPreferences,
): SubtitleTrack | null {
  const shown = tracks.filter(drawable)
  const language = subtitleLanguage(preferences)
  const forced = () => forcedTrack(shown, audioLanguage, language)
  switch (preferences.subtitleMode) {
    case "off":
      return null
    case "forced":
      return forced()
    case "always":
      return bestInLanguage(shown, language) ?? forced()
    case "foreign":
      // Audio in no known language could be in the viewer's.
      return audioLanguage !== null && !sameLanguage(audioLanguage, language)
        ? (bestInLanguage(shown, language) ?? forced())
        : forced()
    case "default": {
      const translation = forced()
      if (translation) return translation
      // Some muxers mark every track default, which says nothing.
      const flagged = shown.filter((track) => track.default)
      if (shown.length > 1 && flagged.length === shown.length) return null
      return flagged[0] ?? null
    }
  }
}

/** The track C turns on when the viewer hasn't picked one in this file. */
export function fallbackTrack(
  tracks: SubtitleTrack[],
  preferences: PlaybackPreferences,
): SubtitleTrack | null {
  const shown = tracks.filter(drawable)
  return (
    bestInLanguage(shown, subtitleLanguage(preferences)) ??
    shown.find((track) => track.default && !track.forced) ??
    shown.find((track) => !track.forced) ??
    shown[0] ??
    null
  )
}

/**
 * What a pick in the player makes of the preferences when they remember
 * picks: a full track turns subtitles on in its language, keeping
 * `foreign` when the audio is foreign to it; a forced track, or off, goes
 * to forced tracks only. Off stays off.
 */
export function rememberPick(
  track: SubtitleTrack | undefined,
  preferences: PlaybackPreferences,
  audioLanguage: string | null,
): Partial<PlaybackPreferences> {
  const mode = preferences.subtitleMode
  if (!track) return { subtitleMode: mode === "off" ? "off" : "forced" }
  const tag = LanguageTag.safeParse(track.language)
  const subtitleLanguage = tag.success ? tag.data : preferences.subtitleLanguage
  if (track.forced) return { subtitleMode: "forced", subtitleLanguage }
  const foreign =
    mode === "foreign" &&
    audioLanguage !== null &&
    !sameLanguage(audioLanguage, track.language)
  return { subtitleMode: foreign ? "foreign" : "always", subtitleLanguage }
}

/**
 * The small print beside a track in the menu: its flags and format, and
 * whether picking it transcodes the video.
 */
export function trackDetail(track: SubtitleTrack): string {
  const parts = []
  if (track.forced) parts.push(tr("player.subtitles.forced"))
  if (track.sdh) parts.push("SDH")
  parts.push(track.format)
  if (track.delivery === "burn-in") parts.push(tr("player.subtitles.burnedIn"))
  return parts.join(" · ")
}

/**
 * A subtitle track's name: a file next to the video without a language is
 * "Unknown language", a stream without one "Track 2" by its place among
 * the file's streams, as the server numbers them.
 */
export function subtitleLabel(
  track: SubtitleTrack,
  tracks: readonly SubtitleTrack[],
): string {
  if (track.source !== "embedded") {
    return trackLabel(
      track.language,
      track.title,
      tr("player.track.unknownLanguage"),
    )
  }
  const position =
    tracks.filter((entry) => entry.source === "embedded").indexOf(track) + 1
  return trackLabel(
    track.language,
    track.title,
    tr("player.track.unnamed", { number: position }),
  )
}
