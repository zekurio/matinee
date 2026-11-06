import type { Subtitles, SubtitleTrack } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { type RefObject, useCallback, useEffect, useRef, useState } from "react"

import {
  defaultTrack,
  fallbackTrack,
  readSubtitlePreference,
  writeSubtitlePreference,
} from "@/lib/subtitles"

const NO_TRACKS: SubtitleTrack[] = []
// Space between a lifted cue and the seek bar.
const CUE_GAP_PX = 12
// Chrome and Safari draw cues in a container that CSS can move (see
// globals.css). Elsewhere, as in Firefox, each cue moves instead.
const MOVE_CONTAINER = CSS.supports(
  "selector(video::-webkit-media-text-track-container)",
)
// Cue text is 5% of the video's height, as WebVTT says, and lines are
// spaced by the `::cue` line height in globals.css.
const CUE_FONT_RATIO = 0.05
const CUE_LINE_HEIGHT = 1.35
const CUE_FONT = '"Geist Variable", ui-sans-serif, system-ui, sans-serif'

// Cues the player moved, so it only puts back the ones it moved.
const moved = new WeakSet<VTTCue>()
let measure: CanvasRenderingContext2D | null = null

/** How far cues at the bottom of the video must rise to clear the controls. */
function liftPixels(
  video: HTMLVideoElement | null,
  controls: HTMLElement | null,
): number {
  if (!video || !controls) return 0
  const bottom = video.getBoundingClientRect().bottom
  const top = controls.getBoundingClientRect().top
  return Math.max(0, bottom - top + CUE_GAP_PX)
}

/** How many lines a cue's text takes once it wraps at `width`. */
function cueLines(text: string, fontSize: number, width: number): number {
  measure ??= document.createElement("canvas").getContext("2d")
  const rows = text.replace(/<[^>]*>/g, "").split("\n")
  if (!measure) return rows.length
  measure.font = `${fontSize}px ${CUE_FONT}`
  let lines = 0
  for (const row of rows) {
    lines += Math.max(1, Math.ceil(measure.measureText(row).width / width))
  }
  return lines
}

/**
 * Put the bottom of a track's cues `lift` pixels above the bottom of the
 * video, or back where they were for 0. Cues the file places itself, like
 * signs at the top, stay put. Only `line` with the default start alignment
 * means the same everywhere (Firefox swaps `lineAlign` end and center), so
 * each cue's top goes where its estimated height ends above the controls.
 */
function placeCues(video: HTMLVideoElement, track: TextTrack, lift: number) {
  const cues = track.cues
  const box = video.getBoundingClientRect()
  if (!cues || box.height <= 0) return
  const fontSize = box.height * CUE_FONT_RATIO
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]
    if (!(cue instanceof VTTCue)) continue
    if (lift === 0) {
      if (!moved.has(cue)) continue
      moved.delete(cue)
      cue.snapToLines = true
      cue.line = "auto"
      continue
    }
    if (!moved.has(cue) && cue.line !== "auto") continue
    moved.add(cue)
    // A little narrower than the video, so the guess errs toward more lines.
    const lines = cueLines(cue.text, fontSize, box.width * 0.9)
    const top = box.height - lift - lines * fontSize * CUE_LINE_HEIGHT
    cue.snapToLines = false
    cue.line = Math.max(0, Math.min(100, (top / box.height) * 100))
  }
}

/** The `<track>` the player rendered for a track id. */
function trackElement(
  video: HTMLVideoElement,
  trackId: string | null,
): HTMLTrackElement | undefined {
  const element = video.querySelector<HTMLTrackElement>("track[data-track-id]")
  return element && element.dataset.trackId === trackId ? element : undefined
}

/**
 * Subtitle selection for the player, which renders a `<track>` with
 * `data-track-id` for `current` only. Browsers turn on tracks by
 * themselves, such as one in the system language, and each one they turn
 * on loads; a lone track leaves them nothing to pick. While `lifted` is
 * true, cues sit above `controls`.
 */
export function useSubtitles(
  subtitles: Subtitles | undefined,
  video: RefObject<HTMLVideoElement | null>,
  controls: RefObject<HTMLElement | null>,
  lifted: boolean,
) {
  const tracks = subtitles?.tracks ?? NO_TRACKS
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // The default applies once, and never over the viewer's own pick.
  const decided = useRef(false)
  // The last track picked in this file, which C brings back.
  const picked = useRef<string | null>(null)

  useEffect(() => {
    if (!subtitles || decided.current) return
    decided.current = true
    const track = defaultTrack(
      subtitles.tracks,
      subtitles.audioLanguage,
      readSubtitlePreference(),
    )
    setSelected(track?.id ?? null)
  }, [subtitles])

  // Show the selected track, and keep any track the browser found inside
  // the file off.
  useEffect(() => {
    const el = video.current
    if (!el) return
    const current = trackElement(el, selected)
    const apply = () => {
      for (const track of el.textTracks) {
        const mode = track === current?.track ? "showing" : "disabled"
        if (track.mode !== mode) track.mode = mode
      }
    }
    apply()
    el.textTracks.addEventListener("change", apply)
    if (!current) {
      setLoading(false)
      return () => el.textTracks.removeEventListener("change", apply)
    }
    const onLoad = () => setLoading(false)
    const onError = () => {
      setLoading(false)
      setSelected(null)
      toast.error("Couldn't load these subtitles.", { position: "top-center" })
    }
    setLoading(current.readyState !== HTMLTrackElement.LOADED)
    current.addEventListener("load", onLoad)
    current.addEventListener("error", onError)
    return () => {
      el.textTracks.removeEventListener("change", apply)
      current.removeEventListener("load", onLoad)
      current.removeEventListener("error", onError)
    }
  }, [selected, tracks])

  useEffect(() => {
    const el = video.current
    if (!el) return
    const track = trackElement(el, selected)
    const place = () => {
      const lift = lifted ? liftPixels(el, controls.current) : 0
      if (MOVE_CONTAINER) el.style.setProperty("--cue-lift", `${lift}px`)
      else if (track) placeCues(el, track.track, lift)
    }
    place()
    track?.addEventListener("load", place)
    window.addEventListener("resize", place)
    return () => {
      track?.removeEventListener("load", place)
      window.removeEventListener("resize", place)
    }
  }, [selected, lifted, tracks])

  /** Show a track, or none for null, and remember it for the next file. */
  const select = useCallback(
    (trackId: string | null) => {
      decided.current = true
      setSelected(trackId)
      const track = tracks.find((candidate) => candidate.id === trackId)
      if (track) picked.current = track.id
      writeSubtitlePreference({
        enabled: track !== undefined,
        language: track?.language ?? readSubtitlePreference()?.language ?? null,
      })
    },
    [tracks],
  )

  /** Off if a track shows; otherwise the last pick or the best guess. */
  const toggle = useCallback(() => {
    if (selected !== null) {
      select(null)
      return
    }
    const again = tracks.find((track) => track.id === picked.current)
    const next = again ?? fallbackTrack(tracks, readSubtitlePreference())
    if (next) select(next.id)
  }, [selected, tracks, select])

  const current = tracks.find((track) => track.id === selected) ?? null
  return { tracks, selected, current, loading, select, toggle }
}
