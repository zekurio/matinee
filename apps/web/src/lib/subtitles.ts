import type { PlaybackPreferences, SubtitleTrack } from "@matinee/contracts"

import { tr } from "@/i18n"

import { deviceLanguage, sameLanguage, trackLabel } from "./languages"

/** The language subtitles show in: the preference, else the device's. */
function subtitleLanguage(preferences: PlaybackPreferences): string {
  return preferences.subtitleLanguage ?? deviceLanguage()
}

/**
 * Whether the player draws the track over whatever plays. A `burn-in`
 * track needs an encode of its own, so C never picks one.
 */
function drawable(track: SubtitleTrack): boolean {
  return track.delivery === "webvtt" || track.delivery === "pgs"
}

/**
 * The full track to show for a language: the exact tag first, then one
 * the file marks default, then one without SDH.
 */
function bestInLanguage(
  tracks: SubtitleTrack[],
  language: string | null,
): SubtitleTrack | null {
  let best: SubtitleTrack | null = null
  let bestScore = -1
  for (const track of tracks) {
    if (track.forced || !sameLanguage(track.language, language)) {
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
 * The track C turns on when the viewer hasn't picked one in this file.
 * The server picks the tracks a file starts with; this only stands in for
 * a pick the viewer didn't make.
 */
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
