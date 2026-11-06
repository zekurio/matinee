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

const VTT_TIMING = /^\s*(\d+:)?\d{2}:\d{2}\.\d{3}\s+-->/

/** ffmpeg copies an arrow in cue text as is, which would start a new cue. */
export function cleanVtt(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line.includes("-->") && !VTT_TIMING.test(line)
        ? line.replaceAll("-->", "->")
        : line,
    )
    .join("\n")
}
