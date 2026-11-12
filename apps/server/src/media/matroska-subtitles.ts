import { open, type FileHandle } from "node:fs/promises"

// Only metadata and subtitle blocks are read. Limits also bound malformed inputs.
const MAX_ELEMENT = 32 * 1024 * 1024
const MAX_TOTAL = 128 * 1024 * 1024

type Element = { id: number; start: number; end: number }

function vint(bytes: Buffer, at: number, id = false) {
  const first = bytes[at] ?? 0
  let width = 1
  while (width <= 8 && !(first & (1 << (8 - width)))) width++
  if (width > (id ? 4 : 8) || at + width > bytes.length)
    throw new Error("Invalid EBML integer")
  // Unknown sizes are legal for Segment and Cluster. Their payloads are
  // never allocated from this sentinel; read() rejects it elsewhere.
  if (
    !id &&
    first === (1 << (9 - width)) - 1 &&
    bytes.subarray(at + 1, at + width).every((byte) => byte === 0xff)
  ) {
    return { value: Number.MAX_SAFE_INTEGER - 32, width }
  }
  let value = id ? first : first & ((1 << (8 - width)) - 1)
  for (let i = 1; i < width; i++) value = value * 256 + (bytes[at + i] ?? 0)
  if (!Number.isSafeInteger(value)) throw new Error("Oversized EBML integer")
  return { value, width }
}

function element(bytes: Buffer, at: number): Element {
  const id = vint(bytes, at, true)
  const size = vint(bytes, at + id.width)
  const start = at + id.width + size.width
  return { id: id.value, start, end: start + size.value }
}

function children(bytes: Buffer): Element[] {
  const result: Element[] = []
  for (let at = 0; at < bytes.length;) {
    const item = element(bytes, at)
    if (item.end > bytes.length || result.length >= 200_000)
      throw new Error("Invalid EBML children")
    result.push(item)
    at = item.end
  }
  return result
}

function uint(bytes: Buffer): number {
  if (!bytes.length || bytes.length > 8)
    throw new Error("Invalid EBML unsigned integer")
  let value = 0
  for (const byte of bytes) value = value * 256 + byte
  if (!Number.isSafeInteger(value))
    throw new Error("Oversized EBML unsigned integer")
  return value
}

function fields(bytes: Buffer): Map<number, Buffer> {
  return new Map(
    children(bytes).map((item) => [
      item.id,
      bytes.subarray(item.start, item.end),
    ]),
  )
}

function required(map: Map<number, Buffer>, id: number): Buffer {
  const bytes = map.get(id)
  if (!bytes) throw new Error("Missing Matroska field")
  return bytes
}

function encoded(id: number, bytes: Buffer): Buffer {
  const hex = id.toString(16)
  const tag = Buffer.from(hex, "hex")
  const size = Buffer.alloc(5)
  size[0] = 0x08
  size.writeUInt32BE(bytes.length, 1)
  return Buffer.concat([tag, size, bytes])
}

function integer(id: number, value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid Matroska timestamp")
  const bytes = Buffer.alloc(8)
  bytes.writeBigUInt64BE(BigInt(value))
  return encoded(id, bytes)
}

class Reader {
  bytesRead = 0
  private file: FileHandle
  private size: number
  constructor(file: FileHandle, size: number) {
    this.file = file
    this.size = size
  }

  async read(at: number, length: number): Promise<Buffer> {
    if (
      !Number.isSafeInteger(at) ||
      at < 0 ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > MAX_ELEMENT ||
      at + length > this.size ||
      this.bytesRead + length > MAX_TOTAL
    ) {
      throw new Error("Matroska read limit")
    }
    this.bytesRead += length
    const bytes = Buffer.alloc(length)
    let done = 0
    while (done < length) {
      const result = await this.file.read(bytes, done, length - done, at + done)
      if (!result.bytesRead) throw new Error("Truncated Matroska file")
      done += result.bytesRead
    }
    return bytes
  }

  async header(at: number): Promise<Element> {
    const bytes = await this.read(at, Math.min(16, this.size - at))
    const item = element(bytes, 0)
    return { id: item.id, start: at + item.start, end: at + item.end }
  }

  async payload(at: number, expected: number): Promise<Buffer> {
    const item = await this.header(at)
    if (item.id !== expected) throw new Error("Unexpected Matroska element")
    return this.read(item.start, item.end - item.start)
  }
}

/**
 * Make a tiny Matroska input from an indexed subtitle track. Keeping the
 * original TrackEntry and blocks lets ffmpeg handle ASS, PGS, lacing and
 * ContentEncodings without duplicating its decoders. Null means use the
 * ordinary demuxer instead. Reads run in bounded, offset-ordered windows.
 */
export async function indexedSubtitle(
  path: string,
  stream: number,
): Promise<{ bytes: Buffer; bytesRead: number } | null> {
  const file = await open(path, "r").catch(() => null)
  if (!file) return null
  try {
    const reader = new Reader(file, (await file.stat()).size)
    const ebml = await reader.header(0)
    if (ebml.id !== 0x1a45dfa3) return null
    const header = await reader.read(0, ebml.end)
    const segment = await reader.header(ebml.end)
    if (segment.id !== 0x18538067) return null
    const base = segment.start
    const locations = new Map<number, number>()
    const pending = [base]
    const visited = new Set<number>()
    // SeekHead can point to a second SeekHead at the end of the file.
    while (pending.length) {
      const at = pending.pop()
      if (at === undefined || visited.has(at)) continue
      if (visited.size >= 32) return null
      visited.add(at)
      const seek = await reader.payload(at, 0x114d9b74)
      for (const entry of children(seek)) {
        if (entry.id !== 0x4dbb) continue
        const values = fields(seek.subarray(entry.start, entry.end))
        const id = uint(required(values, 0x53ab))
        const offset = base + uint(required(values, 0x53ac))
        locations.set(id, offset)
        if (id === 0x114d9b74) pending.push(offset)
      }
    }
    const tracks = await reader.payload(
      locations.get(0x1654ae6b) ?? -1,
      0x1654ae6b,
    )
    const entries = children(tracks).filter((entry) => entry.id === 0xae)
    const track = entries[stream]
    if (!track) return null
    const entry = tracks.subarray(track.start, track.end)
    const values = fields(entry)
    const codec = required(values, 0x86).toString("utf8")
    if (
      !["S_TEXT/UTF8", "S_TEXT/ASS", "S_TEXT/SSA", "S_HDMV/PGS"].includes(codec)
    )
      return null
    if (uint(required(values, 0x83)) !== 17) return null
    const encodings = values.get(0x6d80)
    for (const encoding of encodings ? children(encodings) : []) {
      if (encoding.id !== 0x6240) return null
      const config = fields(
        encodings
          ? encodings.subarray(encoding.start, encoding.end)
          : Buffer.alloc(0),
      )
      if (
        config.has(0x5035) ||
        uint(config.get(0x5033) ?? Buffer.from([0])) !== 0
      )
        return null
      const compression = config.get(0x5034)
      if (!compression) return null
      const algorithm = uint(
        fields(compression).get(0x4254) ?? Buffer.from([0]),
      )
      if (algorithm !== 0 && algorithm !== 3) return null
    }
    const number = uint(required(values, 0xd7))
    const info = await reader.payload(
      locations.get(0x1549a966) ?? -1,
      0x1549a966,
    )
    const scale = fields(info).get(0x2ad7b1) ?? Buffer.from([0x0f, 0x42, 0x40])
    const cues = await reader.payload(
      locations.get(0x1c53bb6b) ?? -1,
      0x1c53bb6b,
    )
    const picks: { cluster: number; relative: number; time: number }[] = []
    for (const point of children(cues)) {
      if (point.id !== 0xbb) continue
      const bytes = cues.subarray(point.start, point.end)
      const time = uint(required(fields(bytes), 0xb3))
      for (const position of children(bytes)) {
        if (position.id !== 0xb7) continue
        const pos = fields(bytes.subarray(position.start, position.end))
        if (uint(required(pos, 0xf7)) !== number) continue
        picks.push({
          cluster: base + uint(required(pos, 0xf1)),
          relative: uint(required(pos, 0xf0)),
          time,
        })
      }
    }
    if (!picks.length || picks.length > 100_000) return null
    picks.sort((a, b) => a.cluster - b.cluster || a.relative - b.relative)
    const parts = [
      header,
      Buffer.from("1853806701ffffffffffffff", "hex"),
      encoded(0x1549a966, encoded(0x2ad7b1, scale)),
      encoded(0x1654ae6b, encoded(0xae, entry)),
    ]
    let total = parts.reduce((sum, part) => sum + part.length, 0)
    let previous = -1
    for (let first = 0; first < picks.length; first += 16) {
      // Give the disk scheduler a bounded, offset-ordered window of reads.
      const batch = await Promise.all(
        picks.slice(first, first + 16).map(async (pick) => {
          const cluster = await reader.header(pick.cluster)
          if (cluster.id !== 0x1f43b675) throw new Error("Invalid cue cluster")
          const at = cluster.start + pick.relative
          const block = await reader.header(at)
          if (block.id !== 0xa0 && block.id !== 0xa3)
            throw new Error("Invalid cue block")
          const payload = await reader.read(
            block.start,
            block.end - block.start,
          )
          return { pick, at, block, payload }
        }),
      )
      for (const { pick, at, block, payload } of batch) {
        if (at <= previous) return null
        previous = at
        const data =
          block.id === 0xa0 ? required(fields(payload), 0xa1) : payload
        const trackNumber = vint(data, 0)
        if (trackNumber.value !== number || data.length < trackNumber.width + 3)
          return null
        const time = pick.time - data.readInt16BE(trackNumber.width)
        const part = encoded(
          0x1f43b675,
          Buffer.concat([integer(0xe7, time), encoded(block.id, payload)]),
        )
        total += part.length
        if (total > MAX_TOTAL) return null
        parts.push(part)
      }
    }
    return { bytes: Buffer.concat(parts), bytesRead: reader.bytesRead }
  } catch {
    // Unsupported layouts, truncated files and read failures use ffmpeg.
    return null
  } finally {
    await file.close()
  }
}
