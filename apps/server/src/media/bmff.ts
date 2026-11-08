import { open } from "node:fs/promises"

/*
 * Just enough ISO BMFF to read a fragmented MP4: the tracks of an init
 * segment, and from a media segment's `moof` boxes where each track's
 * samples start and end and how many there are. A segment's samples are
 * timed only by these boxes, so this is how the server knows exactly
 * where a track stopped.
 */

type Box = { type: string; start: number; end: number }

/** The boxes in `buffer` between `from` and `to`; `start` is the payload. */
function* boxes(buffer: Buffer, from = 0, to = buffer.length): Generator<Box> {
  let offset = from
  while (offset + 8 <= to) {
    let size = buffer.readUInt32BE(offset)
    const type = buffer.toString("latin1", offset + 4, offset + 8)
    let header = 8
    if (size === 1) {
      if (offset + 16 > to) return
      size = Number(buffer.readBigUInt64BE(offset + 8))
      header = 16
    } else if (size === 0) {
      size = to - offset
    }
    if (size < header || offset + size > to) return
    yield { type, start: offset + header, end: offset + size }
    offset += size
  }
}

function child(buffer: Buffer, parent: Box, type: string): Box | undefined {
  for (const box of boxes(buffer, parent.start, parent.end)) {
    if (box.type === type) return box
  }
  return undefined
}

function children(buffer: Buffer, parent: Box, type: string): Box[] {
  return [...boxes(buffer, parent.start, parent.end)].filter(
    (box) => box.type === type,
  )
}

export type InitTrack = {
  id: number
  /** `vide`, `soun`, and so on. */
  handler: string
  /** Ticks per second of the track's times. */
  timescale: number
  /** From `trex`, for fragments that don't say. */
  defaultDuration: number
}

/** The tracks of an init segment, in file order. */
export function initTracks(buffer: Buffer): InitTrack[] {
  const moov = [...boxes(buffer)].find((box) => box.type === "moov")
  if (!moov) return []
  const tracks: InitTrack[] = []
  for (const trak of children(buffer, moov, "trak")) {
    const tkhd = child(buffer, trak, "tkhd")
    const mdia = child(buffer, trak, "mdia")
    const mdhd = mdia && child(buffer, mdia, "mdhd")
    const hdlr = mdia && child(buffer, mdia, "hdlr")
    if (!tkhd || !mdhd || !hdlr) continue
    const v1 = (box: Box) => buffer[box.start] === 1
    tracks.push({
      id: buffer.readUInt32BE(tkhd.start + (v1(tkhd) ? 20 : 12)),
      handler: buffer.toString("latin1", hdlr.start + 8, hdlr.start + 12),
      timescale: buffer.readUInt32BE(mdhd.start + (v1(mdhd) ? 20 : 12)),
      defaultDuration: 0,
    })
  }
  const mvex = child(buffer, moov, "mvex")
  for (const trex of mvex ? children(buffer, mvex, "trex") : []) {
    const id = buffer.readUInt32BE(trex.start + 4)
    const track = tracks.find((entry) => entry.id === id)
    if (track) track.defaultDuration = buffer.readUInt32BE(trex.start + 12)
  }
  return tracks
}

export type FragmentTrack = {
  /** Decode time of the first sample, in the track's timescale. */
  start: number
  /** Decode time after the last sample. */
  end: number
  samples: number
}

/** Each track's samples in the `moof` boxes of one media segment. */
export function fragmentTracks(
  moofs: readonly Buffer[],
  tracks: readonly InitTrack[],
): Map<number, FragmentTrack> {
  const found = new Map<number, FragmentTrack>()
  for (const buffer of moofs) {
    const moof = [...boxes(buffer)].find((box) => box.type === "moof")
    if (!moof) continue
    for (const traf of children(buffer, moof, "traf")) {
      const tfhd = child(buffer, traf, "tfhd")
      const tfdt = child(buffer, traf, "tfdt")
      if (!tfhd || !tfdt) continue
      const tfhdFlags = buffer.readUIntBE(tfhd.start + 1, 3)
      const id = buffer.readUInt32BE(tfhd.start + 4)
      let cursor = tfhd.start + 8
      // Base data offset, then the sample description index.
      if (tfhdFlags & 0x1) cursor += 8
      if (tfhdFlags & 0x2) cursor += 4
      const fallback =
        tfhdFlags & 0x8
          ? buffer.readUInt32BE(cursor)
          : (tracks.find((track) => track.id === id)?.defaultDuration ?? 0)
      // Signed in version 1: an encoder's delay puts the first packet
      // before 0.
      const base =
        buffer[tfdt.start] === 1
          ? Number(buffer.readBigInt64BE(tfdt.start + 4))
          : buffer.readUInt32BE(tfdt.start + 4)
      let duration = 0
      let samples = 0
      for (const trun of children(buffer, traf, "trun")) {
        const flags = buffer.readUIntBE(trun.start + 1, 3)
        const count = buffer.readUInt32BE(trun.start + 4)
        let at = trun.start + 8
        if (flags & 0x1) at += 4
        if (flags & 0x4) at += 4
        const stride = [0x100, 0x200, 0x400, 0x800].filter(
          (flag) => flags & flag,
        ).length
        for (let i = 0; i < count; i++) {
          duration += flags & 0x100 ? buffer.readUInt32BE(at) : fallback
          at += stride * 4
        }
        samples += count
      }
      const known = found.get(id)
      found.set(id, {
        start: Math.min(known?.start ?? base, base),
        end: Math.max(known?.end ?? 0, base + duration),
        samples: (known?.samples ?? 0) + samples,
      })
    }
  }
  return found
}

/** The `moof` boxes of a file, read without its media data. */
export async function readMoofs(path: string): Promise<Buffer[]> {
  const file = await open(path, "r")
  try {
    const { size } = await file.stat()
    const moofs: Buffer[] = []
    const header = Buffer.alloc(16)
    let offset = 0
    while (offset + 8 <= size) {
      await file.read(header, 0, 16, offset)
      let length = header.readUInt32BE(0)
      const type = header.toString("latin1", 4, 8)
      if (length === 1) length = Number(header.readBigUInt64BE(8))
      else if (length === 0) length = size - offset
      if (length < 8) break
      if (type === "moof") {
        const box = Buffer.alloc(length)
        await file.read(box, 0, length, offset)
        moofs.push(box)
      }
      offset += length
    }
    return moofs
  } finally {
    await file.close()
  }
}
