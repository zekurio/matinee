import type { SubtitleTrack } from "@matinee/contracts"

import { tr } from "@/i18n"

import { trackLabel } from "./languages"

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
