import { gunzipSync } from "node:zlib"

import { PluginInstallError } from "./error"

export const TAR_LIMITS = { entries: 2000, bytes: 50 * 1024 * 1024 }
// Each entry can add a header and a partial block. Extensions count as entries too.
export const INFLATE_LIMIT = TAR_LIMITS.bytes + TAR_LIMITS.entries * 1024 + 1024
export function gunzip(bytes: Uint8Array): Uint8Array {
  try {
    return gunzipSync(bytes, { maxOutputLength: INFLATE_LIMIT })
  } catch (cause) {
    throw new PluginInstallError(
      "The package is not valid gzip or exceeds the unpacked size limit.",
      { cause },
    )
  }
}
function fail(message: string): never {
  throw new PluginInstallError(`Cannot read the package tarball: ${message}`)
}
function pathCheck(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-z]:/i.test(path) ||
    /[\0\\]/.test(path) ||
    path.split("/").includes("..")
  )
    fail("use relative paths without .., NUL bytes, or backslashes.")
}
function text(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return fail("a file name or extension is not valid UTF-8.")
  }
}
function field(bytes: Uint8Array): string {
  const end = bytes.indexOf(0)
  if (end >= 0 && bytes.subarray(end).some((byte) => byte !== 0))
    fail("a header field contains an embedded NUL.")
  return text(end < 0 ? bytes : bytes.subarray(0, end))
}
function octal(bytes: Uint8Array): number {
  const value = text(bytes).replace(/\0/g, " ").trim()
  if (!/^[0-7]*$/.test(value)) return fail("a numeric header field is invalid.")
  const number = value ? Number.parseInt(value, 8) : 0
  if (!Number.isSafeInteger(number))
    return fail("a numeric header field is too large.")
  return number
}
function pax(bytes: Uint8Array): Map<string, string> {
  const values = new Map<string, string>()
  for (let offset = 0; offset < bytes.length;) {
    const space = bytes.indexOf(32, offset)
    if (space < 0) return fail("a pax record has no length.")
    const lengthText = text(bytes.subarray(offset, space))
    const length = Number(lengthText)
    if (
      !/^\d+$/.test(lengthText) ||
      !Number.isSafeInteger(length) ||
      length <= space - offset + 2 ||
      offset + length > bytes.length ||
      bytes[offset + length - 1] !== 10
    )
      return fail("a pax record has an invalid length.")
    const record = text(bytes.subarray(space + 1, offset + length - 1))
    const equals = record.indexOf("=")
    if (equals < 1 || record.includes("\0"))
      return fail("a pax record is invalid.")
    values.set(record.slice(0, equals), record.slice(equals + 1))
    offset += length
  }
  return values
}
/** Reads tar bytes without extracting anything. Limits include duplicate files and extension entries. */
export function untar(
  bytes: Uint8Array,
  limits = TAR_LIMITS,
): { path: string; bytes: Uint8Array }[] {
  const files = new Map<string, Uint8Array>()
  let count = 0
  let total = 0
  let offset = 0
  let local = new Map<string, string>()
  const global = new Map<string, string>()
  let longName: string | undefined
  while (offset < bytes.length) {
    if (offset + 512 > bytes.length) return fail("a header is truncated.")
    const header = bytes.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) {
      if (bytes.subarray(offset).some((byte) => byte !== 0))
        return fail("data follows the end marker.")
      break
    }
    if (++count > Math.min(limits.entries, TAR_LIMITS.entries))
      return fail("more than 2000 entries.")
    const expected = octal(header.subarray(148, 156))
    let checksum = 0
    for (let i = 0; i < 512; i++)
      checksum += i >= 148 && i < 156 ? 32 : (header[i] ?? 0)
    if (checksum !== expected) return fail("a header checksum is wrong.")
    let size = octal(header.subarray(124, 136))
    const type = header[156] ?? 0
    const extension = type === 120 || type === 103 || type === 76
    const paxSize = local.get("size") ?? global.get("size")
    if (!extension && paxSize !== undefined) {
      if (!/^\d+$/.test(paxSize) || !Number.isSafeInteger(Number(paxSize)))
        return fail("a pax size is invalid.")
      size = Number(paxSize)
    }
    const start = offset + 512
    const end = start + size
    if (
      end > bytes.length ||
      start + Math.ceil(size / 512) * 512 > bytes.length
    )
      return fail("a file size runs past the end.")
    const data = bytes.subarray(start, end)
    offset = start + Math.ceil(size / 512) * 512
    const name = field(header.subarray(0, 100))
    const prefix = field(header.subarray(345, 500))
    pathCheck(prefix ? `${prefix}/${name}` : name)
    if (extension) {
      if (type === 76) {
        longName = field(data)
        pathCheck(longName)
      } else {
        const parsed = pax(data)
        for (const [key, value] of parsed) {
          if (key.startsWith("GNU.sparse") || key === "linkpath")
            return fail("links and sparse files are not supported.")
          if (key === "path") pathCheck(value)
          if (type === 103) global.set(key, value)
        }
        if (type === 120) local = parsed
      }
      continue
    }
    const path =
      local.get("path") ??
      longName ??
      global.get("path") ??
      (prefix ? `${prefix}/${name}` : name)
    pathCheck(path)
    local = new Map()
    longName = undefined
    if (type !== 0 && type !== 48 && type !== 53)
      return fail(
        "only regular files and directories are allowed; remove links and special files.",
      )
    if (type === 53) continue
    total += size
    if (total > Math.min(limits.bytes, TAR_LIMITS.bytes))
      return fail("more than 50 MB of file data.")
    const normalized = path
      .split("/")
      .filter((part) => part !== "." && part !== "")
      .join("/")
    files.set(normalized, data)
  }
  return [...files].map(([path, data]) => ({ path, bytes: data }))
}
