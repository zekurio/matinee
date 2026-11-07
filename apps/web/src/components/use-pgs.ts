import workerUrl from "libpgs/dist/libpgs.worker.js?url"
import { type RefObject, useEffect, useEffectEvent } from "react"

/**
 * Draws PGS subtitles from a `.sup` file over `video`, on a canvas in
 * `layer` that fits the frame the way the video does. libpgs, loaded only
 * for this, parses and draws in a worker that takes the canvas over, and a
 * canvas can be handed over once, so each file gets a new one. `offset` is
 * where in the file the video's time 0 is.
 */
export function usePgs(
  layer: RefObject<HTMLElement | null>,
  video: RefObject<HTMLVideoElement | null>,
  file: ArrayBuffer | undefined,
  offset: number,
  onError: () => void,
) {
  const fileTime = useEffectEvent(
    () => (video.current?.currentTime ?? 0) + offset,
  )
  const failed = useEffectEvent(onError)

  useEffect(() => {
    const host = layer.current
    const el = video.current
    if (!host || !el || !file) return
    let stopped = false
    let stop = () => {}
    const start = async () => {
      const { PgsRenderer } = await import("libpgs")
      if (stopped) return
      const canvas = document.createElement("canvas")
      canvas.className = "size-full object-contain"
      host.append(canvas)
      const renderer = new PgsRenderer({ canvas, workerUrl })
      const render = () => renderer.renderAtTimestamp(fileTime())
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
        if (frames) el.cancelVideoFrameCallback(frame)
        for (const event of events) el.removeEventListener(event, render)
        renderer.dispose()
        canvas.remove()
      }
      // Nothing to show yet, which also makes the first picture count as
      // a change once the file is parsed.
      render()
      await renderer.loadFromBuffer(file)
      if (stopped) return
      render()
      if (frames) frame = el.requestVideoFrameCallback(onFrame)
      for (const event of events) el.addEventListener(event, render)
    }
    start().catch(() => {
      if (!stopped) failed()
    })
    return () => {
      stopped = true
      stop()
    }
  }, [file])
}
