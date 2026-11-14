import { isIP } from "node:net"

function ipv4Bytes(ip: string): number[] {
  return ip.split(".").map(Number)
}

function publicV4(b: number[]): boolean {
  const [a = 0, c = 0, d = 0] = b
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && c >= 64 && c <= 127) ||
    (a === 169 && c === 254) ||
    (a === 172 && c >= 16 && c <= 31) ||
    (a === 192 &&
      (c === 168 ||
        (c === 0 && (d === 0 || d === 2)) ||
        (c === 88 && d === 99))) ||
    (a === 198 && (c === 18 || c === 19 || (c === 51 && d === 100))) ||
    (a === 203 && c === 0 && d === 113) ||
    a >= 224
  )
}

/** Classify parsed address bytes, including IPv4 embedded in IPv6. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return publicV4(ipv4Bytes(ip))
  if (family !== 6 || ip.includes("%")) return false
  let text = ip
  if (text.includes(".")) {
    const split = text.lastIndexOf(":")
    const v4 = ipv4Bytes(text.slice(split + 1))
    text = `${text.slice(0, split)}:${((v4[0] ?? 0) * 256 + (v4[1] ?? 0)).toString(16)}:${((v4[2] ?? 0) * 256 + (v4[3] ?? 0)).toString(16)}`
  }
  const halves = text.split("::")
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves[1] ? halves[1].split(":") : []
  const words =
    halves.length === 1
      ? left
      : [
          ...left,
          ...Array<string>(8 - left.length - right.length).fill("0"),
          ...right,
        ]
  const b = words.flatMap((word) => {
    const n = Number.parseInt(word, 16)
    return [n >> 8, n & 255]
  })
  if (
    b.every((v) => v === 0) ||
    (b.slice(0, 15).every((v) => v === 0) && b[15] === 1)
  )
    return false
  if (
    ((b[0] ?? 0) & 254) === 252 ||
    (b[0] === 254 && ((b[1] ?? 0) & 192) === 128) ||
    b[0] === 255
  )
    return false
  if (b[0] === 32 && b[1] === 1 && b[2] === 13 && b[3] === 184) return false
  const compatible = b.slice(0, 12).every((v) => v === 0)
  const mapped =
    b.slice(0, 10).every((v) => v === 0) && b[10] === 255 && b[11] === 255
  const nat64 =
    b[0] === 0 &&
    b[1] === 100 &&
    b[2] === 255 &&
    b[3] === 155 &&
    b.slice(4, 12).every((v) => v === 0)
  if (compatible || mapped || nat64) return publicV4(b.slice(12))
  if (b[0] === 32 && b[1] === 2) return publicV4(b.slice(2, 6))
  return true
}
