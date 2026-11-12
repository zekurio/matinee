import { open } from "node:fs/promises"

const MAX_METADATA = 32 * 1024 * 1024

/** Reject fragmented MOV/MP4: those need a sequential pass, not sample seeks. */
export async function movieSubtitleIndex(
  path: string,
): Promise<{ usable: boolean; bytesRead: number }> {
  const file = await open(path, "r")
  let bytesRead = 0
  try {
    const size = (await file.stat()).size
    for (let at = 0, count = 0; at + 8 <= size && count < 1024; count++) {
      const header = Buffer.alloc(Math.min(16, size - at))
      const read = await file.read({ buffer: header, position: at })
      bytesRead += read.bytesRead
      if (read.bytesRead !== header.length) break
      let length = header.readUInt32BE(0)
      let start = 8
      if (length === 1) {
        if (header.length < 16) break
        const extended = header.readBigUInt64BE(8)
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) break
        length = Number(extended)
        start = 16
      }
      if (length < start || at + length > size) break
      const type = header.toString("ascii", 4, 8)
      if (type === "moof") break
      if (type === "moov") {
        if (length - start > MAX_METADATA) break
        const bytes = Buffer.alloc(length - start)
        const result = await file.read({ buffer: bytes, position: at + start })
        bytesRead += result.bytesRead
        if (result.bytesRead !== bytes.length) break
        let boxes = 0
        let tables = 0
        const visit = (from: number, end: number): boolean => {
          for (let pos = from; pos < end;) {
            if (++boxes > 200_000 || pos + 8 > end) return false
            const n = bytes.readUInt32BE(pos)
            const tag = bytes.toString("ascii", pos + 4, pos + 8)
            if (n < 8 || pos + n > end || tag === "mvex") return false
            if (
              ["trak", "mdia", "minf", "stbl"].includes(tag) &&
              !visit(pos + 8, pos + n)
            )
              return false
            if (tag === "stco" || tag === "co64") {
              if (n < 16 || bytes.readUInt32BE(pos + 12) === 0) return false
              tables++
            }
            pos += n
          }
          return true
        }
        return { usable: visit(0, bytes.length) && tables > 0, bytesRead }
      }
      at += length
    }
    return { usable: false, bytesRead }
  } finally {
    await file.close()
  }
}
