import type { SubtitleTrack } from "@matinee/contracts"
import { z } from "zod"

const STORAGE_KEY = "matinee.subtitles"

/**
 * The viewer's last subtitle choice, kept across files. The language stays
 * when subtitles go off, so turning them back on finds the same language.
 */
const SubtitlePreference = z.object({
  enabled: z.boolean(),
  language: z.string().max(35).nullable(),
})
export type SubtitlePreference = z.infer<typeof SubtitlePreference>

/** Null until the viewer picks a track or turns subtitles off. */
export function readSubtitlePreference(): SubtitlePreference | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === null) return null
    const parsed = SubtitlePreference.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeSubtitlePreference(next: SubtitlePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage is off or full. The choice still holds for this file.
  }
}

/** `pt-BR` and `pt` are the same language here. */
function baseLanguage(tag: string | null): string | null {
  if (!tag) return null
  try {
    return new Intl.Locale(tag).language
  } catch {
    return tag.toLowerCase()
  }
}

function sameLanguage(a: string | null, b: string | null): boolean {
  const base = baseLanguage(a)
  return base !== null && base === baseLanguage(b)
}

/**
 * The full (not forced) track to show for a language: the exact tag first,
 * then one the file marks default, then one without SDH.
 */
function bestInLanguage(
  tracks: SubtitleTrack[],
  language: string,
): SubtitleTrack | null {
  let best: SubtitleTrack | null = null
  let bestScore = -1
  for (const track of tracks) {
    if (track.forced || !sameLanguage(track.language, language)) continue
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
 * The track to show when a file starts, or null for off. In order: the
 * viewer's language if they had subtitles on; a forced track in the audio's
 * language, which translates only foreign dialogue and signs; a track the
 * file marks default, but only if the viewer never chose.
 */
export function defaultTrack(
  tracks: SubtitleTrack[],
  audioLanguage: string | null,
  preference: SubtitlePreference | null,
): SubtitleTrack | null {
  const shown = tracks.filter((track) => track.available)
  if (preference?.enabled && preference.language) {
    const full = bestInLanguage(shown, preference.language)
    if (full) return full
  }
  const forced = shown.find(
    (track) => track.forced && sameLanguage(track.language, audioLanguage),
  )
  if (forced) return forced
  if (preference) return null
  // Some muxers mark every track default, which says nothing.
  const flagged = shown.filter((track) => track.default)
  if (shown.length > 1 && flagged.length === shown.length) return null
  return flagged[0] ?? null
}

/** The track C turns on when the viewer hasn't picked one in this file. */
export function fallbackTrack(
  tracks: SubtitleTrack[],
  preference: SubtitlePreference | null,
): SubtitleTrack | null {
  const shown = tracks.filter((track) => track.available)
  return (
    (preference?.language
      ? bestInLanguage(shown, preference.language)
      : null) ??
    shown.find((track) => track.default && !track.forced) ??
    shown.find((track) => !track.forced) ??
    shown[0] ??
    null
  )
}

/**
 * The small print beside a track in the menu: its flags, why it can't
 * play, and where it comes from when another track has the same name.
 */
export function trackDetail(
  track: SubtitleTrack,
  tracks: SubtitleTrack[],
): string {
  const parts = []
  if (track.forced) parts.push("Forced")
  if (track.sdh) parts.push("SDH")
  if (!track.available) {
    parts.push("Needs transcoding")
  } else if (
    tracks.some(
      (other) =>
        other.id !== track.id &&
        other.label === track.label &&
        other.forced === track.forced &&
        other.sdh === track.sdh,
    )
  ) {
    parts.push(track.source === "embedded" ? "Embedded" : "External")
  }
  return parts.join(" · ")
}
