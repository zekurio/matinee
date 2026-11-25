import { QueryObserver, useQueryClient } from "@tanstack/solid-query"
import {
  type Accessor,
  createEffect,
  createMemo,
  from,
  onCleanup,
} from "solid-js"

import { tr } from "@/i18n"
import { toast } from "@/kit/toast"
import { type PlayerStore, selectSubtitle } from "@/stores/player"

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
  video: HTMLVideoElement | undefined,
  controls: HTMLElement | undefined,
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

export type SubtitleOptions = {
  video: () => HTMLVideoElement | undefined
  /** What the cues rise above while the controls show. */
  controls: () => HTMLElement | undefined
  /** Where PGS pictures draw. */
  pgsLayer: () => HTMLElement | undefined
  lifted: Accessor<boolean>
  /** Where in the file the video's time 0 is. */
  offset: Accessor<number>
  /** Asks the server again for a track, none for null, or its pick for undefined. */
  onSelect: (trackId: string | null | undefined) => void
  /** The viewer picked a track, for the server to remember. */
  onPick: (trackId: string | null) => void
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
export function useSubtitles(store: PlayerStore, options: SubtitleOptions) {
  const { view } = store
  const { video } = options
  const queryClient = useQueryClient()
  const tracks = () => view.plan.subtitleTracks
  const selected = () => selectSubtitle(view)
  // The file's time that shows at the video's 0: the stream's start, less
  // the viewer's delay, so a later cue shows later.
  const cueOffset = createMemo(
    () => options.offset() - view.subtitleDelay / 1000,
  )
  // The track the player draws, once the answer for the pick is here.
  const track = createMemo(() =>
    view.plan.subtitleMode === "client" && view.plan.subtitle?.id === selected()
      ? view.plan.subtitle
      : null,
  )
  const shownId = createMemo(() => track()?.id ?? null)
  const delivery = createMemo(() => track()?.delivery ?? null)
  // Off, for a track whose file didn't load. The next answer agrees.
  const turnOff = () => {
    store.getState().pick({ subtitle: { trackId: null } })
    loadFailed()
  }

  const assFailed = () => {
    const { device, setDevice } = store.getState()
    setDevice({
      ...device,
      subtitles: device.subtitles.filter((value) => value !== "ass"),
      sidecarSubtitles: device.sidecarSubtitles.filter(
        (value) => value !== "ass",
      ),
    })
    toast.error(tr("player.error.assFallback"), { position: "top-center" })
    options.onSelect(shownId())
  }
  // The shown track's file. A pick that changes cancels the fetch.
  const url = createMemo(() => {
    const kind = delivery()
    return track() && (kind === "webvtt" || kind === "pgs" || kind === "ass")
      ? view.plan.subtitleUrl
      : null
  })
  // The shown track's file, from the query cache, so picking a track again
  // finds it. An observer per file: a pick that changes lets go of the last
  // one, which cancels its fetch.
  const file = createMemo(() => {
    const address = url()
    const kind = delivery()
    return from<SubtitleFile | undefined>((next) => {
      if (address === null || kind === null) {
        next(undefined)
        return () => {}
      }
      const observer = new QueryObserver(queryClient, {
        queryKey: ["player", "subtitles", address, kind],
        queryFn: async ({ signal }): Promise<SubtitleFile> => {
          try {
            const response = await fetch(address, { signal })
            if (!response.ok) {
              throw new Error(`Subtitles answered ${response.status}`)
            }
            return kind === "pgs"
              ? { kind: "pgs", data: await response.arrayBuffer() }
              : {
                  kind: kind === "ass" ? "ass" : "webvtt",
                  text: await response.text(),
                }
          } catch (cause) {
            if (!signal.aborted) {
              if (kind === "ass") assFailed()
              else turnOff()
            }
            throw cause
          }
        },
        staleTime: Infinity,
        // A PGS file can be tens of megabytes; don't keep one nobody shows.
        // Picking it again revalidates it with the browser's cache.
        gcTime: kind === "pgs" ? 0 : undefined,
        retry: false,
      })
      const unsubscribe = observer.subscribe((result) => next(result.data))
      next(observer.getCurrentResult().data)
      return unsubscribe
    })
  })
  const text = createMemo(() => {
    const current = file()
    return current?.kind === "webvtt" ? current.text : undefined
  })

  useAss(
    video,
    () => {
      const current = file()
      return current?.kind === "ass" ? current.text : undefined
    },
    store.getState().itemId,
    () => `${view.source.url}:${shownId()}`,
    cueOffset,
    assFailed,
  )

  usePgs(
    options.pgsLayer,
    video,
    () => {
      const current = file()
      return current?.kind === "pgs" ? current.data : undefined
    },
    cueOffset,
    turnOff,
  )

  // The text as an object URL for the `<track>`, revoked once it's gone.
  const src = createMemo(() => {
    const body = text()
    if (shownId() === null || body === undefined) return null
    const created = URL.createObjectURL(new Blob([body], { type: "text/vtt" }))
    onCleanup(() => URL.revokeObjectURL(created))
    return created
  })
  // What the `<track>` effects follow: the track, its file, and the list.
  const rendered = () => ({ id: shownId(), src: src(), tracks: tracks() })

  // Show the track, and keep any track the browser found inside the file
  // off.
  createEffect(rendered, ({ id }) => {
    const el = video()
    if (!el) return
    const current = trackElement(el, id)
    const apply = () => {
      for (const textTrack of el.textTracks) {
        const mode = textTrack === current?.track ? "showing" : "disabled"
        if (textTrack.mode !== mode) textTrack.mode = mode
      }
    }
    apply()
    el.textTracks.addEventListener("change", apply)
    current?.addEventListener("error", turnOff)
    return () => {
      el.textTracks.removeEventListener("change", apply)
      current?.removeEventListener("error", turnOff)
    }
  })

  // Line cues up with a stream that starts partway into the file, and
  // with the viewer's delay.
  createEffect(
    () => ({ ...rendered(), offset: cueOffset() }),
    ({ id, offset }) => {
      const el = video()
      if (!el) return
      const element = trackElement(el, id)
      if (!element) return
      const shift = () => shiftCues(element.track, offset)
      shift()
      element.addEventListener("load", shift)
      return () => element.removeEventListener("load", shift)
    },
  )

  // Lift the cues above the controls while they show, and again as the
  // window or the track's cues change.
  createEffect(
    () => ({ ...rendered(), lifted: options.lifted() }),
    ({ id, lifted }) => {
      const el = video()
      if (!el) return
      const element = trackElement(el, id)
      const place = () => {
        const lift = lifted ? liftPixels(el, options.controls()) : 0
        if (MOVE_CONTAINER) el.style.setProperty("--cue-lift", `${lift}px`)
        else if (element) placeCues(el, element.track, lift)
      }
      place()
      element?.addEventListener("load", place)
      window.addEventListener("resize", place)
      return () => {
        element?.removeEventListener("load", place)
        window.removeEventListener("resize", place)
      }
    },
  )

  /** Show a track, or none for null, as the viewer's pick. */
  const select = (trackId: string | null) => {
    options.onSelect(trackId)
    options.onPick(trackId)
  }

  /** Off if a track shows; otherwise the last pick or the best guess. */
  const toggle = () => {
    const state = store.getState()
    if (selectSubtitle(state) !== null) {
      select(null)
      return
    }
    const again = state.plan.subtitleTracks.find(
      (entry) => entry.id === state.pickedSubtitle,
    )
    if (again) select(again.id)
    else options.onSelect(undefined)
  }

  // The `<track>` to render, once its text is here.
  const current = createMemo(() => {
    const shown = track()
    const address = src()
    return shown && delivery() === "webvtt" && address !== null
      ? { track: shown, src: address }
      : null
  })
  const loading = createMemo(
    () =>
      (delivery() === "webvtt" && current() === null) ||
      (delivery() === "pgs" && file()?.kind !== "pgs"),
  )

  // A toast while the track is on its way.
  createEffect(
    () => ({ loading: loading(), id: shownId() }),
    ({ loading }) => {
      if (!loading) return
      return subtitlesLoadingNotice()
    },
  )

  return { tracks, selected, current, select, toggle }
}

export type Subtitles = ReturnType<typeof useSubtitles>
