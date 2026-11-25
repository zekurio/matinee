/** A run of a cue's text, with how it's set. */
export type CueSpan = {
  text: string
  italic: boolean
  bold: boolean
  underline: boolean
}

/** One subtitle: when it shows, on the file's timeline, and what it says. */
export type Cue = { start: number; end: number; spans: CueSpan[] }

const TIMING =
  /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/
const TAG = /<(\/?)([a-z]+)[^>]*>/gi

function seconds(stamp: string): number {
  let total = 0
  for (const part of stamp.replace(",", ".").split(":")) {
    total = total * 60 + Number(part)
  }
  return total
}

function unescape(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, "\u00A0")
    .replace(/&[lr]rm;/g, "")
    .replace(/&amp;/g, "&")
}

/** Italic, bold, and underline from `<i>`, `<b>`, and `<u>`; other tags dropped. */
function styled(text: string): CueSpan[] {
  const spans: CueSpan[] = []
  const depth = { i: 0, b: 0, u: 0 }
  let index = 0
  const push = (part: string) => {
    if (part === "") return
    spans.push({
      text: unescape(part),
      italic: depth.i > 0,
      bold: depth.b > 0,
      underline: depth.u > 0,
    })
  }
  for (const match of text.matchAll(TAG)) {
    push(text.slice(index, match.index))
    const step = match[1] === "/" ? -1 : 1
    const tag = (match[2] ?? "").toLowerCase()
    if (tag === "i" || tag === "b" || tag === "u") {
      depth[tag] = Math.max(0, depth[tag] + step)
    }
    index = match.index + match[0].length
  }
  push(text.slice(index))
  return spans
}

/**
 * A WebVTT track as the server converts subtitles to, drawn by the player
 * itself. Its times are the file's, so it stays in step whatever the
 * video comes as: the file, a stream that starts partway in, or an encode.
 */
export class CueTrack {
  private constructor(private readonly cues: readonly Cue[]) {}

  static parse(source: string): CueTrack {
    const cues: Cue[] = []
    const blocks = source.replace(/\r\n?/g, "\n").split(/\n{2,}/)
    for (const block of blocks) {
      const lines = block.split("\n")
      const timingAt = lines.findIndex((line) => TIMING.test(line))
      const timing = TIMING.exec(lines[timingAt] ?? "")
      if (!timing) continue
      const text = lines
        .slice(timingAt + 1)
        .filter((line) => line.trim() !== "")
      if (text.length === 0) continue
      cues.push({
        start: seconds(timing[1] ?? "0"),
        end: seconds(timing[2] ?? "0"),
        spans: styled(text.join("\n")),
      })
    }
    return new CueTrack(cues.toSorted((a, b) => a.start - b.start))
  }

  /** The cues showing at `time` seconds into the file. */
  at(time: number): Cue[] {
    // Cues are sorted by start; look back from the last that started.
    let low = 0
    let high = this.cues.length
    while (low < high) {
      const mid = (low + high) >>> 1
      const cue = this.cues[mid]
      if (cue && cue.start <= time) low = mid + 1
      else high = mid
    }
    const shown: Cue[] = []
    // Long cues can overlap later ones; a few steps back is plenty.
    for (let index = low - 1; index >= 0 && low - index <= 16; index -= 1) {
      const cue = this.cues[index]
      if (cue && cue.end > time) shown.unshift(cue)
    }
    return shown
  }
}
