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
  const renderer = new JASSUB({
    video,
    subContent: text,
    fonts,
    queryFonts: false,
    maxRenderHeight: 1080,
    libassMemoryLimit: 64,
    libassGlyphLimit: 2000,
    timeOffset: offset,
  })
  const worker = renderer._worker
  worker.addEventListener("error", onError)
  const timeout = window.setTimeout(onError, 30_000)
  renderer.ready.then(() => window.clearTimeout(timeout), onError)
  return {
    offset: (value: number) => {
      renderer.timeOffset = value
      void renderer.resize(true).catch(onError)
    },
    destroy: () => {
      window.clearTimeout(timeout)
      worker.removeEventListener("error", onError)
      void renderer.destroy().catch(() => {})
      // A failed worker cannot acknowledge destroy's IPC request.
      worker.terminate()
      // JASSUB's loop value is a generation counter, not a callback id.
      // destroy marks it stopped; its pending frame callback exits on its own.
    },
  }
}
