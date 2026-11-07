import type { Subtitles, SubtitleTrack } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { skipToken, useQuery } from "@tanstack/react-query"
import { type RefObject, useEffect } from "react"
import { useShallow } from "zustand/shallow"

import {
  currentPlaybackPreferences,
  updatePlaybackPreferences,
} from "@/lib/playback-sync"
import { defaultTrack, fallbackTrack, rememberPick } from "@/lib/subtitles"
import { usePlayerStore, usePlayerStoreApi } from "@/stores/player"

import { usePgs } from "./use-pgs"

/** A track's file as fetched: WebVTT text, or a PGS `.sup` file. */
type SubtitleFile =
  | { kind: "webvtt"; text: string }
  | { kind: "pgs"; data: ArrayBuffer }

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
const CUE_FONT = '"Red Hat Text Variable", ui-sans-serif, system-ui, sans-serif'

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

// Each cue's times in the file, before any shift.
const fileTimes = new WeakMap<TextTrackCue, { start: number; end: number }>()

/** Move a track's cues so the file's time `offset` lands on 0. */
function shiftCues(track: TextTrack, offset: number) {
  const cues = track.cues
  if (!cues) return
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]
    if (!cue) continue
    let times = fileTimes.get(cue)
    if (!times) {
      if (offset === 0) continue
      times = { start: cue.startTime, end: cue.endTime }
      fileTimes.set(cue, times)
    }
    cue.startTime = times.start - offset
    cue.endTime = times.end - offset
  }
}

function loadFailed() {
  toast.error("Couldn't load subtitles", {
    description: "Pick another track or turn them off.",
    position: "top-center",
  })
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
 * Subtitle selection for the player. A WebVTT track renders as a `<track>`
 * with `data-track-id` for `current` only. Browsers turn on tracks by
 * themselves, such as one in the system language, and each one they turn
 * on loads; a lone track leaves them nothing to pick. While `lifted` is
 * true, cues sit above `controls`. `offset` is where in the file the
 * video's time 0 is, for streams that start partway in. PGS draws on a
 * canvas in `pgsLayer`. A track only an encode shows goes to `burnIn`,
 * which gets null again when the viewer picks another. Until the viewer
 * picks, the preferences pick by `audioLanguage`, the language of the
 * audio that plays, falling back on the file's default audio's.
 *
 * A track's file is fetched before it shows; a `<track>` loads it from
 * memory. A showing track that is still loading holds Chrome's
 * `readyState` below HAVE_FUTURE_DATA: the video plays on, but
 * `currentTime` stops and `canplay` and `playing` never fire. Pulling a
 * track out of a large file can take the server minutes.
 */
export function useSubtitles(
  subtitles: Subtitles | undefined,
  subtitleSrc: (trackId: string) => string,
  video: RefObject<HTMLVideoElement | null>,
  controls: RefObject<HTMLElement | null>,
  pgsLayer: RefObject<HTMLElement | null>,
  lifted: boolean,
  offset: number,
  burnIn: (trackId: string | null) => void,
  audioLanguage: string | null,
) {
  const store = usePlayerStoreApi()
  const tracks = subtitles?.tracks ?? NO_TRACKS
  const { chosen, defaults, objectUrl } = usePlayerStore(
    useShallow((state) => ({
      chosen: state.chosenSubtitle,
      defaults: state.subtitleDefaults,
      objectUrl: state.subtitleUrl,
    })),
  )
  // The default shows once the tracks are here, until the viewer picks.
  const playingLanguage = audioLanguage ?? subtitles?.audioLanguage ?? null
  const selected =
    chosen !== undefined
      ? chosen
      : subtitles
        ? (defaultTrack(subtitles.tracks, playingLanguage, defaults)?.id ??
          null)
        : null
  const track = tracks.find((candidate) => candidate.id === selected) ?? null
  const delivery = track?.delivery ?? null

  // The selected track's file. A pick that changes cancels the fetch.
  const url =
    track && (delivery === "webvtt" || delivery === "pgs")
      ? subtitleSrc(track.id)
      : null
  const file = useQuery({
    queryKey: ["player", "subtitles", url, delivery],
    queryFn:
      url === null
        ? skipToken
        : async ({ signal }): Promise<SubtitleFile> => {
            try {
              const response = await fetch(url, { signal })
              if (!response.ok) {
                throw new Error(`Subtitles answered ${response.status}`)
              }
              return delivery === "pgs"
                ? { kind: "pgs", data: await response.arrayBuffer() }
                : { kind: "webvtt", text: await response.text() }
            } catch (cause) {
              if (!signal.aborted) {
                store.getState().chooseSubtitle(null)
                loadFailed()
              }
              throw cause
            }
          },
    staleTime: Infinity,
    // A PGS file can be tens of megabytes; don't keep one nobody shows.
    // Picking it again revalidates it with the browser's cache.
    gcTime: delivery === "pgs" ? 0 : undefined,
    retry: false,
  }).data
  const text = file?.kind === "webvtt" ? file.text : undefined

  usePgs(
    pgsLayer,
    video,
    file?.kind === "pgs" ? file.data : undefined,
    offset,
    () => {
      store.getState().chooseSubtitle(null)
      loadFailed()
    },
  )

  // The text as an object URL for the `<track>`, revoked once it's gone.
  useEffect(() => {
    if (selected === null || text === undefined) return
    const { setSubtitleUrl } = store.getState()
    const created = URL.createObjectURL(new Blob([text], { type: "text/vtt" }))
    setSubtitleUrl({ trackId: selected, url: created })
    return () => {
      URL.revokeObjectURL(created)
      setSubtitleUrl(null)
    }
  }, [selected, text])

  const src =
    objectUrl !== null && objectUrl.trackId === selected ? objectUrl.url : null

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
      return () => el.textTracks.removeEventListener("change", apply)
    }
    const onError = () => {
      store.getState().chooseSubtitle(null)
      loadFailed()
    }
    current.addEventListener("error", onError)
    return () => {
      el.textTracks.removeEventListener("change", apply)
      current.removeEventListener("error", onError)
    }
  }, [selected, src, tracks])

  // Line cues up with a stream that starts partway into the file.
  useEffect(() => {
    const el = video.current
    if (!el) return
    const track = trackElement(el, selected)
    if (!track) return
    const shift = () => shiftCues(track.track, offset)
    shift()
    track.addEventListener("load", shift)
    return () => track.removeEventListener("load", shift)
  }, [selected, src, offset, tracks])

  // Lift the cues above the controls while they show, and again as the
  // window or the track's cues change.
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
  }, [selected, src, lifted, tracks])

  /**
   * Show a track, or none for null, and when the preferences remember
   * picks, make it the choice for the next file.
   */
  const select = (trackId: string | null) => {
    const next = tracks.find((candidate) => candidate.id === trackId)
    store.getState().chooseSubtitle(trackId)
    burnIn(next?.delivery === "burn-in" ? next.id : null)
    const preferences = currentPlaybackPreferences()
    if (preferences.rememberSubtitles) {
      updatePlaybackPreferences(
        rememberPick(next, preferences, playingLanguage),
      )
    }
  }

  /** Off if a track shows; otherwise the last pick or the best guess. */
  const toggle = () => {
    if (selected !== null) {
      select(null)
      return
    }
    const { pickedSubtitle } = store.getState()
    const again = tracks.find((track) => track.id === pickedSubtitle)
    const next = again ?? fallbackTrack(tracks, currentPlaybackPreferences())
    if (next) select(next.id)
  }

  // The `<track>` to render, once its text is here.
  const current =
    track && delivery === "webvtt" && src !== null ? { track, src } : null
  const loading =
    (delivery === "webvtt" && current === null) ||
    (delivery === "pgs" && file?.kind !== "pgs")
  return { tracks, selected, current, loading, select, toggle }
}
