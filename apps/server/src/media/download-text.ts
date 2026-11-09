import { rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import type { SubtitleTrack } from "@matinee/contracts"
import type { MediaItemRow } from "@matinee/db"

import { env } from "../env"
import { log } from "../log"
import { type Box, boxes, child, children, initTracks } from "./bmff"
import { iso639_2 } from "./language"
import { runBytes } from "./process"
import { openSubtitle } from "./subtitles"
import { cuesToVtt, flatCues, vttCues } from "./webvtt"

/*
 * Text subtitles inside a download. The HLS muxer that writes a
 * download's segments can't hold them, so ffmpeg makes them an MP4 of
 * their own once, as 3GPP timed text (`tx3g`), which players of MP4 files
 * read. Their tracks join the download's init segment, and each segment
 * goes out after a fragment of the cues in its time. Nothing changes on
 * disk: the runs and their resumes never see these tracks.
 */

// Text from a large file was extracted once already; this is a remux.
const MUX_TIMEOUT_MS = 60_000

/** One sample, in its track's timescale. Gaps between cues are empty samples. */
type TextSample = { time: number; duration: number; data: Buffer }

type TextTrack = {
  /** The track's `trak` box, whole, with ffmpeg's track id. */
  trak: Buffer
  /** Its `trex` box from `mvex`. */
  trex: Buffer
  timescale: number
  samples: TextSample[]
}

/** The text tracks of a download, ready to go in its file. */
export type DownloadText = { tracks: TextTrack[] }

function box(type: string, ...parts: Buffer[]): Buffer {
  const header = Buffer.alloc(8)
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0)
  header.writeUInt32BE(size, 0)
  header.write(type, 4, "latin1")
  return Buffer.concat([header, ...parts], size)
}

/** The bytes of `found`, its header included: these boxes are never large. */
function whole(buffer: Buffer, found: Box): Buffer {
  return buffer.subarray(found.start - 8, found.end)
}

function versioned(buffer: Buffer, found: Box): boolean {
  return buffer[found.start] === 1
}

/** A track's name as players show it: its label, and whether it's forced or SDH. */
function titleOf(track: SubtitleTrack): string {
  const words = track.label.toLowerCase()
  const marks = [
    track.forced && !words.includes("forced") ? "Forced" : null,
    track.sdh && !/\b(sdh|cc)\b/.test(words) ? "SDH" : null,
  ].filter(Boolean)
  return marks.length > 0 ? `${track.label} (${marks.join(", ")})` : track.label
}

/** The samples of every track in the `moof`s of a fragmented MP4. */
function readSamples(buffer: Buffer, defaults: Map<number, number>) {
  const found = new Map<number, TextSample[]>()
  for (const moof of boxes(buffer)) {
    if (moof.type !== "moof") continue
    const moofStart = moof.start - 8
    for (const traf of children(buffer, moof, "traf")) {
      const tfhd = child(buffer, traf, "tfhd")
      const tfdt = child(buffer, traf, "tfdt")
      if (!tfhd || !tfdt) continue
      const tfhdFlags = buffer.readUIntBE(tfhd.start + 1, 3)
      const id = buffer.readUInt32BE(tfhd.start + 4)
      let cursor = tfhd.start + 8
      let base = moofStart
      if (tfhdFlags & 0x1) {
        base = Number(buffer.readBigUInt64BE(cursor))
        cursor += 8
      }
      if (tfhdFlags & 0x2) cursor += 4
      let defaultDuration = 0
      if (tfhdFlags & 0x8) {
        defaultDuration = buffer.readUInt32BE(cursor)
        cursor += 4
      }
      const defaultSize =
        tfhdFlags & 0x10 ? buffer.readUInt32BE(cursor) : (defaults.get(id) ?? 0)
      let time = versioned(buffer, tfdt)
        ? Number(buffer.readBigUInt64BE(tfdt.start + 4))
        : buffer.readUInt32BE(tfdt.start + 4)
      const samples = found.get(id) ?? []
      found.set(id, samples)
      for (const trun of children(buffer, traf, "trun")) {
        const flags = buffer.readUIntBE(trun.start + 1, 3)
        const count = buffer.readUInt32BE(trun.start + 4)
        let at = trun.start + 8
        let data = base
        if (flags & 0x1) {
          data = base + buffer.readInt32BE(at)
          at += 4
        }
        if (flags & 0x4) at += 4
        for (let i = 0; i < count; i++) {
          let duration = defaultDuration
          let size = defaultSize
          if (flags & 0x100) {
            duration = buffer.readUInt32BE(at)
            at += 4
          }
          if (flags & 0x200) {
            size = buffer.readUInt32BE(at)
            at += 4
          }
          if (flags & 0x400) at += 4
          if (flags & 0x800) at += 4
          samples.push({
            time,
            duration,
            data: buffer.subarray(data, data + size),
          })
          time += duration
          data += size
        }
      }
    }
  }
  return found
}

/** The tracks of ffmpeg's MP4 of the subtitles, in its order. */
function readTextMp4(buffer: Buffer): TextTrack[] {
  const moov = [...boxes(buffer)].find((found) => found.type === "moov")
  if (!moov) return []
  const mvex = child(buffer, moov, "mvex")
  const trexes = new Map<number, Buffer>()
  const sizes = new Map<number, number>()
  for (const trex of mvex ? children(buffer, mvex, "trex") : []) {
    const id = buffer.readUInt32BE(trex.start + 4)
    trexes.set(id, whole(buffer, trex))
    sizes.set(id, buffer.readUInt32BE(trex.start + 16))
  }
  const samples = readSamples(buffer, sizes)
  return children(buffer, moov, "trak").flatMap((trak) => {
    const tkhd = child(buffer, trak, "tkhd")
    const mdia = child(buffer, trak, "mdia")
    const mdhd = mdia && child(buffer, mdia, "mdhd")
    if (!tkhd || !mdhd) return []
    const id = buffer.readUInt32BE(
      tkhd.start + (versioned(buffer, tkhd) ? 20 : 12),
    )
    const trex = trexes.get(id)
    if (!trex) return []
    return [
      {
        // Copies: the tracks get new ids in the download.
        trak: Buffer.from(whole(buffer, trak)),
        trex: Buffer.from(trex),
        timescale: buffer.readUInt32BE(
          mdhd.start + (versioned(buffer, mdhd) ? 20 : 12),
        ),
        samples: (samples.get(id) ?? []).map((sample) => ({
          ...sample,
          data: Buffer.from(sample.data),
        })),
      },
    ]
  })
}

/**
 * The text subtitles `ids` of `item` for a download, made with scratch
 * files in `dir`. A track that can't be read is left out, so the rest of
 * the download goes on.
 */
export async function makeDownloadText(
  item: MediaItemRow,
  tracks: readonly SubtitleTrack[],
  dir: string,
): Promise<DownloadText> {
  const texts = await Promise.all(
    tracks.map(async (track) => {
      const body = await openSubtitle(item, track.id)
      const content = await body?.read()
      return content?.kind === "webvtt" ? { track, text: content.text } : null
    }),
  )
  const found = texts.filter((entry) => entry !== null)
  if (found.length === 0) return { tracks: [] }

  const files = found.map((_, i) => join(dir, `text-${i}.vtt`))
  try {
    await Promise.all(
      // Timed text shows one cue at a time, so cues that overlap merge.
      found.map((entry, i) =>
        writeFile(files[i] ?? "", cuesToVtt(flatCues(vttCues(entry.text)))),
      ),
    )
    const bytes = await runBytes(
      env.MATINEE_FFMPEG_PATH,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        // The cues keep their times, the file's, from 0 on.
        "-copyts",
        ...files.flatMap((file) => ["-i", file]),
        ...found.flatMap((entry, i) => {
          const language = entry.track.language
            ? iso639_2(entry.track.language)
            : null
          return [
            "-map",
            `${i}:s:0`,
            `-metadata:s:s:${i}`,
            `title=${titleOf(entry.track)}`,
            ...(language ? [`-metadata:s:s:${i}`, `language=${language}`] : []),
            // None shows until someone picks it.
            `-disposition:s:${i}`,
            "0",
          ]
        }),
        "-map_metadata",
        "-1",
        "-c:s",
        "mov_text",
        // Keeps the empty sample before the first cue, so times stay the file's.
        "-avoid_negative_ts",
        "disabled",
        "-f",
        "mp4",
        "-movflags",
        "+empty_moov+default_base_moof+frag_keyframe",
        "pipe:1",
      ],
      MUX_TIMEOUT_MS,
    )
    return { tracks: readTextMp4(bytes) }
  } catch (cause) {
    log.warn(`Couldn't put subtitles into a download of ${item.path}`, cause)
    return { tracks: [] }
  } finally {
    await Promise.all(files.map((file) => rm(file, { force: true })))
  }
}

/** An init segment with text tracks, and the id of the first of them. */
export type TextInit = { init: Buffer; firstId: number }

/**
 * `init` with the text tracks added after its own, numbered on from its
 * last track. The init segment as the runs wrote it stays as it is.
 */
export function initWithText(init: Buffer, text: DownloadText): TextInit {
  const firstId = Math.max(0, ...initTracks(init).map((track) => track.id)) + 1
  const top = [...boxes(init)]
  const moov = top.find((found) => found.type === "moov")
  const mvex = moov && child(init, moov, "mvex")
  if (text.tracks.length === 0 || !moov || !mvex) return { init, firstId }
  let next = firstId
  const traks: Buffer[] = []
  const trexes: Buffer[] = []
  for (const track of text.tracks) {
    const id = next++
    const trak = Buffer.from(track.trak)
    // `readTextMp4` kept only tracks with one.
    const tkhd = child(
      trak,
      { type: "trak", start: 8, end: trak.length },
      "tkhd",
    )
    if (tkhd) {
      // ffmpeg turns on the first subtitle of a file whatever its
      // disposition; none is on until someone picks it.
      const flags = trak.readUIntBE(tkhd.start + 1, 3)
      trak.writeUIntBE(flags & ~0x1, tkhd.start + 1, 3)
      trak.writeUInt32BE(id, tkhd.start + (versioned(trak, tkhd) ? 20 : 12))
    }
    const trex = Buffer.from(track.trex)
    trex.writeUInt32BE(id, 12)
    traks.push(trak)
    trexes.push(trex)
  }
  const inside = [...boxes(init, moov.start, moov.end)].flatMap((found) => {
    const bytes = whole(init, found)
    if (found.type === "mvhd") {
      const mvhd = Buffer.from(bytes)
      const header = bytes.length - (found.end - found.start)
      mvhd.writeUInt32BE(next, header + (versioned(init, found) ? 108 : 96))
      return [mvhd]
    }
    if (found.type === "mvex") {
      const rest = init.subarray(found.start, found.end)
      return [...traks, box("mvex", rest, ...trexes)]
    }
    return [bytes]
  })
  return {
    init: Buffer.concat(
      top.map((found) =>
        found === moov ? box("moov", ...inside) : whole(init, found),
      ),
    ),
    firstId,
  }
}

/**
 * A fragment of the text samples that start from `from` up to `to`, in
 * seconds, for the tracks `initWithText` numbered from `firstId`. Null
 * when no track has any there.
 */
export function textFragment(
  text: DownloadText,
  firstId: number,
  from: number,
  to: number,
  sequence: number,
): Buffer | null {
  const picked = text.tracks.map((track, i) => ({
    id: firstId + i,
    samples: track.samples.filter((sample) => {
      const seconds = sample.time / track.timescale
      return seconds >= from && seconds < to
    }),
  }))
  const tracks = picked.filter((track) => track.samples.length > 0)
  if (tracks.length === 0) return null

  const mfhd = Buffer.alloc(8)
  mfhd.writeUInt32BE(sequence, 4)
  const build = (offsets: number[]) =>
    box(
      "moof",
      box("mfhd", mfhd),
      ...tracks.map((track, i) => {
        const first = track.samples[0]
        // Default base is the moof; just the track's id.
        const tfhd = Buffer.alloc(8)
        tfhd.writeUInt32BE(0x020000, 0)
        tfhd.writeUInt32BE(track.id, 4)
        const tfdt = Buffer.alloc(12)
        tfdt.writeUInt32BE(0x01000000, 0)
        tfdt.writeBigUInt64BE(BigInt(first?.time ?? 0), 4)
        // Data offset, then each sample's duration and size.
        const trun = Buffer.alloc(12 + track.samples.length * 8)
        trun.writeUInt32BE(0x000301, 0)
        trun.writeUInt32BE(track.samples.length, 4)
        trun.writeInt32BE(offsets[i] ?? 0, 8)
        track.samples.forEach((sample, j) => {
          trun.writeUInt32BE(sample.duration, 12 + j * 8)
          trun.writeUInt32BE(sample.data.length, 16 + j * 8)
        })
        return box(
          "traf",
          box("tfhd", tfhd),
          box("tfdt", tfdt),
          box("trun", trun),
        )
      }),
    )
  // The sizes don't depend on the offsets, so a first pass gives them.
  const size = build(tracks.map(() => 0)).length
  let at = size + 8
  const offsets = tracks.map((track) => {
    const offset = at
    at += track.samples.reduce((sum, sample) => sum + sample.data.length, 0)
    return offset
  })
  return Buffer.concat([
    build(offsets),
    box(
      "mdat",
      ...tracks.flatMap((track) => track.samples.map((sample) => sample.data)),
    ),
  ])
}
