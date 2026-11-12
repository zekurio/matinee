import JASSUB from "jassub"

/** Loaded only when an ASS track is selected. No remote font lookup. */
export function drawAss(
  video: HTMLVideoElement,
  text: string,
  fonts: string[],
  offset: number,
  onError: () => void,
) {
  if (
    !text.includes("[Script Info]") ||
    !/\[V4\+? Styles\]/i.test(text) ||
    !text.includes("[Events]")
  ) {
    throw new Error("Incomplete ASS script")
  }
  const canvas = document.createElement("canvas")
  canvas.className = "JASSUB"
  canvas.style.position = "absolute"
  canvas.style.pointerEvents = "none"
  video.insertAdjacentElement("afterend", canvas)
  let renderer: JASSUB
  try {
    // Attach the video ourselves so a worker initialization failure also
    // handles setVideo's rejected promise instead of leaving it unhandled.
    renderer = new JASSUB({
      canvas,
      subContent: text,
      fonts,
      queryFonts: false,
      maxRenderHeight: 1080,
      libassMemoryLimit: 64,
      libassGlyphLimit: 2000,
      timeOffset: offset,
    })
  } catch (cause) {
    canvas.remove()
    throw cause
  }
  let stopped = false
  let reported = false
  const fail = () => {
    if (stopped || reported) return
    reported = true
    onError()
  }
  void renderer.setVideo(video).catch(fail)
  const worker = renderer._worker
  worker.addEventListener("error", fail)
  const timeout = window.setTimeout(fail, 30_000)
  renderer.ready.then(() => window.clearTimeout(timeout), fail)
  return {
    offset: (value: number) => {
      renderer.timeOffset = value
      void renderer.resize(true).catch(fail)
    },
    destroy: () => {
      stopped = true
      window.clearTimeout(timeout)
      worker.removeEventListener("error", fail)
      void renderer.destroy().catch(() => {})
      // A failed worker cannot acknowledge destroy's IPC request.
      worker.terminate()
      // JASSUB's loop value is a generation counter, not a callback id.
      // destroy marks it stopped; its pending frame callback exits on its own.
    },
  }
}
