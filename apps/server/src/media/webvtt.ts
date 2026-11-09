const TIME = String.raw`(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})`
const SRT_TIMING = new RegExp(String.raw`^\s*${TIME}\s*-->\s*${TIME}`)
// ASS override blocks like `{\an8}`, which some SRT files carry.
const OVERRIDE = /\{\\[^}]*\}/g

/**
 * Text from a subtitle file. A byte order mark picks the encoding;
 * otherwise UTF-8, falling back to Windows-1252 for older SRT files.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes)
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes)
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder("windows-1252").decode(bytes)
  }
}

function timestamp(parts: string[], from: number): string {
  const [h = "0", m = "0", s = "0", ms = "0"] = parts.slice(from, from + 4)
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}.${ms.padEnd(3, "0")}`
}

/**
 * SRT to WebVTT. The two differ in the header and in the comma before the
 * milliseconds; cue numbers become cue ids, and `<i>`, `<b>`, and `<u>`
 * mean the same in both.
 */
export function srtToVtt(text: string): string {
  const out = ["WEBVTT", ""]
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const timing = SRT_TIMING.exec(line)
    if (timing) {
      out.push(`${timestamp(timing, 1)} --> ${timestamp(timing, 5)}`)
      continue
    }
    // An arrow in the text would start a new cue.
    const cleaned = line.replace(OVERRIDE, "").replaceAll("-->", "->")
    // A line that was only an override tag would end the cue early.
    if (cleaned.trim() === "" && line.trim() !== "") continue
    out.push(cleaned)
  }
  return `${out.join("\n").trimEnd()}\n`
}

/** A WebVTT file as served: with its header, even if the file lacks one. */
export function vttText(text: string): string {
  return text.startsWith("WEBVTT") ? text : `WEBVTT\n\n${text}`
}

const VTT_TIME = String.raw`(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})`
const VTT_TIMING = new RegExp(String.raw`^\s*${VTT_TIME}\s+-->\s+${VTT_TIME}`)
// What ffmpeg leaves of an ASS override block, like `{\an8}` or
// `{1\c&HFFFFFF&}`: braces around a backslash.
const ASS_LEFTOVER = /\{[^{}]*\\[^{}]*\}/g
// Blocks of a WebVTT file part at blank lines.
const BLANK = /\n(?:[ \t]*\n)+/
const HEADER = /^(?:WEBVTT|NOTE|STYLE|REGION)\b/

function isCue(lines: readonly string[]): boolean {
  return lines.slice(0, 2).some((line) => VTT_TIMING.test(line))
}

/** A line of cue text as it should read: no arrow, which would start a cue, and no ASS tags. */
function cueLine(line: string): string {
  return line.replace(ASS_LEFTOVER, "").replaceAll("-->", "->")
}

/**
 * WebVTT that ffmpeg made, made safe to read. ffmpeg copies an arrow in
 * cue text as is, which would start a new cue; an ASS `\N\N` becomes a
 * blank line, which ends the cue and leaves the rest a block players
 * drop, so that goes back into its cue; and override tags it doesn't know
 * stay in as text. Reading it again changes nothing.
 */
export function cleanVtt(text: string): string {
  const blocks: string[][] = []
  for (const block of text.replace(/\r\n?/g, "\n").trim().split(BLANK)) {
    const lines = block.split("\n")
    const previous = blocks.at(-1)
    if (HEADER.test(lines[0] ?? "") || blocks.length === 0) {
      blocks.push(lines)
      continue
    }
    const cue = isCue(lines)
    const timing = lines.findIndex((line) => VTT_TIMING.test(line))
    const head = cue ? lines.slice(0, timing + 1) : []
    // A line that was only a tag would end the cue early.
    const body = lines
      .slice(head.length)
      .filter((line) => cueLine(line).trim() !== "" || line.trim() === "")
      .map(cueLine)
    if (cue) blocks.push([...head, ...body])
    else if (previous && isCue(previous)) previous.push(...body)
    else blocks.push(body)
  }
  return `${blocks
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join("\n"))
    .join("\n\n")}\n`
}

/** A cue of a WebVTT file, in seconds. */
export type Cue = { start: number; end: number; text: string }

function seconds(parts: RegExpExecArray, from: number): number {
  const [h = "0", m = "0", s = "0", ms = "0"] = parts.slice(from, from + 4)
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

/** The cues of a WebVTT file, cleaned as `cleanVtt` does, in its order. */
export function vttCues(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of cleanVtt(text).split(BLANK)) {
    const lines = block.split("\n")
    const at = lines.findIndex((line) => VTT_TIMING.test(line))
    const timing = at >= 0 && at < 2 ? VTT_TIMING.exec(lines[at] ?? "") : null
    if (!timing) continue
    const cue = lines
      .slice(at + 1)
      .join("\n")
      .trim()
    const start = seconds(timing, 1)
    const end = seconds(timing, 5)
    if (cue && end > start) cues.push({ start, end, text: cue })
  }
  return cues
}

/**
 * Cues that never overlap: where several show at once, one cue with all
 * their lines, the one that started first on top. For formats that show
 * one cue at a time, like MP4's timed text.
 */
export function flatCues(cues: readonly Cue[]): Cue[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  const times = [...new Set(sorted.flatMap((cue) => [cue.start, cue.end]))]
  times.sort((a, b) => a - b)
  const flat: Cue[] = []
  for (let i = 0; i + 1 < times.length; i++) {
    const from = times[i] ?? 0
    const to = times[i + 1] ?? from
    const text = sorted
      .filter((cue) => cue.start <= from && cue.end >= to)
      .map((cue) => cue.text)
      .join("\n")
    if (!text) continue
    const last = flat.at(-1)
    if (last && last.end === from && last.text === text) last.end = to
    else flat.push({ start: from, end: to, text })
  }
  return flat
}

function vttTime(value: number): string {
  const ms = Math.round(value * 1000)
  const pad = (n: number, width = 2) => String(n).padStart(width, "0")
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

/** A WebVTT file of `cues`. */
export function cuesToVtt(cues: readonly Cue[]): string {
  const blocks = cues.map(
    (cue) => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cue.text}`,
  )
  return `${["WEBVTT", ...blocks].join("\n\n")}\n`
}
