import { toast } from "@matinee/ui/components/sonner"
import { skipToken, useQuery } from "@tanstack/react-query"
import { type RefObject, useEffect } from "react"
import { useShallow } from "zustand/shallow"

import { tr } from "@/i18n"
import {
  selectSubtitle,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"

import { subtitlesLoadingNotice } from "./playback-notices"
import { useAss } from "./use-ass"
import { usePgs } from "./use-pgs"

/** A track's file as fetched: WebVTT text, or a PGS `.sup` file. */
type SubtitleFile =
  | { kind: "ass"; text: string }
  | { kind: "webvtt"; text: string }
  | { kind: "pgs"; data: ArrayBuffer }

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
  toast.error(tr("player.error.subtitles"), {
    description: tr("player.error.subtitlesDetail"),
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
 * Subtitles for the player, as the server answered: the track that shows
 * and how. A track the player draws (`client`) is fetched from its
 * `subtitleUrl`: WebVTT renders as a `<track>` with `data-track-id` for
 * `current` only, and PGS draws on a canvas in `pgsLayer`. A burned-in
 * track is part of the picture. Browsers turn on tracks by themselves,
 * such as one in the system language, and each one they turn on loads; a
 * lone track leaves them nothing to pick. While `lifted` is true, cues sit
 * above `controls`. `offset` is where in the file the video's time 0 is,
 * for streams that start partway in. The viewer's `subtitleDelay` in the
 * store moves every cue on top of that. A pick goes to `onSelect`, which
 * asks the server again.
 *
 * A track's file is fetched before it shows; a `<track>` loads it from
 * memory. A showing track that is still loading holds Chrome's
 * `readyState` below HAVE_FUTURE_DATA: the video plays on, but
 * `currentTime` stops and `canplay` and `playing` never fire. Pulling a
 * track out of a large file can take the server minutes.
 */
export function useSubtitles(
  video: RefObject<HTMLVideoElement | null>,
  controls: RefObject<HTMLElement | null>,
  pgsLayer: RefObject<HTMLElement | null>,
  lifted: boolean,
  offset: number,
  onSelect: (trackId: string | null | undefined) => void,
  onPick: (trackId: string | null) => void,
) {
  const store = usePlayerStoreApi()
  const { plan, selected, objectUrl, delay, itemId, source } = usePlayerStore(
    useShallow((state) => ({
      plan: state.plan,
      itemId: state.itemId,
      source: state.source,
      selected: selectSubtitle(state),
      objectUrl: state.subtitleUrl,
      delay: state.subtitleDelay,
    })),
  )
  const tracks = plan.subtitleTracks
  // The file's time that shows at the video's 0: the stream's start, less
  // the viewer's delay, so a later cue shows later.
  const cueOffset = offset - delay / 1000
  // The track the player draws, once the answer for the pick is here.
  const track =
    plan.subtitleMode === "client" && plan.subtitle?.id === selected
      ? plan.subtitle
      : null
  const shownId = track?.id ?? null
  const delivery = track?.delivery ?? null
  // Off, for a track whose file didn't load. The next answer agrees.
  const turnOff = () => {
    store.getState().pick({ subtitle: { trackId: null } })
    loadFailed()
  }

  const assFailed = () => {
    const { device } = store.getState()
    store.setState({
      device: {
        ...device,
        subtitles: device.subtitles.filter((value) => value !== "ass"),
        sidecarSubtitles: device.sidecarSubtitles.filter(
          (value) => value !== "ass",
        ),
      },
    })
    toast.error(tr("player.error.assFallback"), { position: "top-center" })
    onSelect(shownId)
  }
  // The shown track's file. A pick that changes cancels the fetch.
  const url =
    track && (delivery === "webvtt" || delivery === "pgs" || delivery === "ass")
      ? plan.subtitleUrl
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
                : {
                    kind: delivery === "ass" ? "ass" : "webvtt",
                    text: await response.text(),
                  }
            } catch (cause) {
              if (!signal.aborted) {
                if (delivery === "ass") assFailed()
                else turnOff()
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

  useAss(
    video,
    file?.kind === "ass" ? file.text : undefined,
    itemId,
    `${source.url}:${shownId}`,
    cueOffset,
    assFailed,
  )

  usePgs(
    pgsLayer,
    video,
    file?.kind === "pgs" ? file.data : undefined,
    cueOffset,
    turnOff,
  )

  // The text as an object URL for the `<track>`, revoked once it's gone.
  useEffect(() => {
    if (shownId === null || text === undefined) return
    const { setSubtitleUrl } = store.getState()
    const created = URL.createObjectURL(new Blob([text], { type: "text/vtt" }))
    setSubtitleUrl({ trackId: shownId, url: created })
    return () => {
      URL.revokeObjectURL(created)
      setSubtitleUrl(null)
    }
  }, [shownId, text])

  const src =
    objectUrl !== null && objectUrl.trackId === shownId ? objectUrl.url : null

  // Show the track, and keep any track the browser found inside
  // the file off.
  useEffect(() => {
    const el = video.current
    if (!el) return
    const current = trackElement(el, shownId)
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
    current.addEventListener("error", turnOff)
    return () => {
      el.textTracks.removeEventListener("change", apply)
      current.removeEventListener("error", turnOff)
    }
  }, [shownId, src, tracks])

  // Line cues up with a stream that starts partway into the file, and
  // with the viewer's delay.
  useEffect(() => {
    const el = video.current
    if (!el) return
    const track = trackElement(el, shownId)
    if (!track) return
    const shift = () => shiftCues(track.track, cueOffset)
    shift()
    track.addEventListener("load", shift)
    return () => track.removeEventListener("load", shift)
  }, [shownId, src, cueOffset, tracks])

  // Lift the cues above the controls while they show, and again as the
  // window or the track's cues change.
  useEffect(() => {
    const el = video.current
    if (!el) return
    const track = trackElement(el, shownId)
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
  }, [shownId, src, lifted, tracks])

  /** Show a track, or none for null, as the viewer's pick. */
  const select = (trackId: string | null) => {
    onSelect(trackId)
    onPick(trackId)
  }

  /** Off if a track shows; otherwise the last pick or the best guess. */
  const toggle = () => {
    if (selected !== null) {
      select(null)
      return
    }
    const { pickedSubtitle } = store.getState()
    const again = tracks.find((track) => track.id === pickedSubtitle)
    if (again) select(again.id)
    else onSelect(undefined)
  }

  // The `<track>` to render, once its text is here.
  const current =
    track && delivery === "webvtt" && src !== null ? { track, src } : null
  const loading =
    (delivery === "webvtt" && current === null) ||
    (delivery === "pgs" && file?.kind !== "pgs")

  // A toast while the track is on its way.
  useEffect(() => {
    if (!loading) return
    return subtitlesLoadingNotice()
  }, [loading, shownId])

  return { tracks, selected, current, select, toggle }
}
