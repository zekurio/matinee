import workerUrl from "libpgs/dist/libpgs.worker.js?url"
import { type Accessor, createEffect } from "solid-js"

/**
 * Draws PGS subtitles from a `.sup` file over `video`, on a canvas in
 * `layer` that fits the frame the way the video does. libpgs, loaded only
 * for this, parses and draws in a worker that takes the canvas over, and a
 * canvas can be handed over once, so each file gets a new one, and the
 * renderer and its worker go with the file. `offset` is the file's time
 * that shows at the video's time 0.
 */
export function usePgs(
  layer: () => HTMLElement | undefined,
  video: () => HTMLVideoElement | undefined,
  file: Accessor<ArrayBuffer | undefined>,
  offset: Accessor<number>,
  onError: () => void,
) {
  // Draws the current picture again, once a file is loaded.
  let redraw: (() => void) | null = null
  // The latest offset. A paused video sends no events, so a new one draws
  // by itself.
  let timeOffset = 0
  createEffect(offset, (value) => {
    timeOffset = value
    redraw?.()
  })

  createEffect(file, (data) => {
    const host = layer()
    const el = video()
    if (!host || !el || !data) return
    let stopped = false
    let stop: (() => void) | null = null
    const start = async () => {
      const { PgsRenderer } = await import("libpgs")
      if (stopped) return
      const canvas = document.createElement("canvas")
      canvas.className = "size-full object-contain"
      host.append(canvas)
      const renderer = new PgsRenderer({ canvas, workerUrl })
      const render = () =>
        renderer.renderAtTimestamp(el.currentTime + timeOffset)
      // Every frame while it plays, so pictures change on time, and on the
      // video's events while it's paused or a new source loads. Browsers
      // without frame callbacks get the events alone.
      const frames = "requestVideoFrameCallback" in el
      let frame = 0
      const onFrame = () => {
        render()
        frame = el.requestVideoFrameCallback(onFrame)
      }
      const events = ["timeupdate", "seeked", "loadeddata"] as const
      stop = () => {
        redraw = null
        if (frames) el.cancelVideoFrameCallback(frame)
        for (const event of events) el.removeEventListener(event, render)
        renderer.dispose()
        canvas.remove()
      }
      // Nothing to show yet, which also makes the first picture count as
      // a change once the file is parsed.
      render()
      await renderer.loadFromBuffer(data)
      if (stopped) return
      render()
      redraw = render
      if (frames) frame = el.requestVideoFrameCallback(onFrame)
      for (const event of events) el.addEventListener(event, render)
    }
    start().catch(() => {
      if (!stopped) onError()
    })
    return () => {
      stopped = true
      stop?.()
    }
  })
}
