import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import type { IncomingMessage } from "node:http"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP, isIPv4, type LookupFunction } from "node:net"
import { Readable } from "node:stream"
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib"

/*
 * Requests to URLs the server didn't write itself: provider artwork and
 * the OIDC `picture` claim. A provider's URL may still point inward, at
 * the server's own loopback, the LAN, or a cloud metadata address, either
 * outright, through a redirect, or through DNS that answers a public
 * address when checked and a private one when connected. So every hop is
 * checked, and the socket connects to the very address the check passed:
 * the `lookup` given to the request is the only resolution it makes.
 */

/** Why an outbound request was refused, before or between hops. */
export class OutboundBlocked extends Error {}

const MAX_REDIRECTS = 5
const REDIRECTS = new Set([301, 302, 303, 307, 308])

/** Ranges that are not the public internet, or not a single host. */
const blocked = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network", including 0.0.0.0
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and broadcast
] as const) {
  blocked.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::", 96], // IPv4-compatible, deprecated
  ["100::", 64], // discard
  ["2001::", 23], // IETF protocol assignments, Teredo
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local, deprecated
  ["ff00::", 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, "ipv6")
}

/** The eight 16-bit groups of an IPv6 address, or null if it isn't one. */
function hextets(address: string): number[] | null {
  if (isIP(address) !== 6) return null
  let text = address.toLowerCase()
  const zone = text.indexOf("%")
  if (zone !== -1) text = text.slice(0, zone)
  // A trailing dotted IPv4 part counts as two groups.
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (dotted?.[1]) {
    const bytes = dotted[1].split(".").map(Number)
    const [a = 0, b = 0, c = 0, d = 0] = bytes
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head = "", tail] = text.split("::")
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  const fill = tail === undefined ? 0 : 8 - left.length - right.length
  const groups = [...left, ...Array<string>(fill).fill("0"), ...right]
  if (groups.length !== 8) return null
  return groups.map((group) => Number.parseInt(group, 16))
}

/** The IPv4 address two groups hold, dotted. */
function ipv4Of(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".")
}

/**
 * Whether `address` is one the server may connect to: a public unicast
 * IPv4 or IPv6 address. IPv6 forms that carry an IPv4 address, such as
 * `::ffff:127.0.0.1`, NAT64, and 6to4, are judged by that address.
 */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return !blocked.check(address, "ipv4")
  const groups = hextets(address)
  if (!groups) return false
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] =
    groups
  // ::ffff:a.b.c.d, mapped
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    if (g5 === 0xffff) return isPublicAddress(ipv4Of(g6, g7))
  }
  // 64:ff9b::a.b.c.d, NAT64, and 64:ff9b:1::/48, local-use NAT64
  if (g0 === 0x64 && g1 === 0xff9b) {
    if (g2 !== 0) return false
    return isPublicAddress(ipv4Of(g6, g7))
  }
  // 2002:aabb:ccdd::/48, 6to4
  if (g0 === 0x2002) return isPublicAddress(ipv4Of(g1, g2))
  return !blocked.check(
    groups.map((group) => group.toString(16)).join(":"),
    "ipv6",
  )
}

/**
 * The address check behind every outbound connection: resolves the name
 * and refuses it if any address it has is not public, so a name can't mix
 * a private address in with public ones.
 */
const lookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(
    hostname,
    { all: true, family: options.family ?? 0, hints: options.hints ?? 0 },
    (cause, addresses: LookupAddress[]) => {
      if (cause) {
        callback(cause, "", 0)
        return
      }
      const refused = addresses.find(({ address }) => !isPublicAddress(address))
      if (refused || addresses.length === 0) {
        callback(
          new OutboundBlocked(
            `${hostname} resolves to an address the server doesn't fetch from`,
          ),
          "",
          0,
        )
        return
      }
      if (options.all) {
        callback(null, addresses)
        return
      }
      const [first] = addresses
      if (first) callback(null, first.address, first.family)
    },
  )
}

/**
 * The URL with only what a log may show: scheme, host, and path. No
 * credentials, and no query or fragment, which often hold a signed token.
 */
export function urlForLog(url: string | URL): string {
  if (!URL.canParse(url)) return "an invalid URL"
  const parsed = new URL(url)
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
}

/** A URL the server may request, or the reason it may not. */
function checkUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OutboundBlocked(`${urlForLog(url)} isn't an http or https URL`)
  }
  if (url.username || url.password) {
    throw new OutboundBlocked(`${urlForLog(url)} carries credentials`)
  }
  // An address written out never reaches `lookup`, so it is checked here.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1")
  if (isIP(host) !== 0 && !isPublicAddress(host)) {
    throw new OutboundBlocked(
      `${urlForLog(url)} names an address the server doesn't fetch from`,
    )
  }
}

export type OutboundResponse = {
  status: number
  headers: IncomingMessage["headers"]
  /** The decoded body. Cancel it when not reading it to the end. */
  body: ReadableStream<Uint8Array>
  /** The URL that answered, after redirects. */
  url: URL
}

function once(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      headers,
      signal,
      lookup,
      // A pooled socket could outlive the check that let it connect.
      agent: false,
    })
    req.once("response", resolve)
    req.once("error", reject)
    req.end()
  })
}

function decoded(response: IncomingMessage): Readable {
  switch (response.headers["content-encoding"]?.trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return response.pipe(createGunzip())
    case "deflate":
      return response.pipe(createInflate())
    case "br":
      return response.pipe(createBrotliDecompress())
    default:
      return response
  }
}

/**
 * GET `url` from a public address, following at most five redirects and
 * checking each. `signal` covers the whole exchange, body included.
 * Throws `OutboundBlocked` for a URL or address it refuses.
 */
export async function outboundGet(
  url: string,
  {
    headers = {},
    signal,
  }: { headers?: Record<string, string>; signal: AbortSignal },
): Promise<OutboundResponse> {
  if (!URL.canParse(url)) throw new OutboundBlocked("an invalid URL")
  let current = new URL(url)
  for (let hop = 0; ; hop++) {
    checkUrl(current)
    const response = await once(
      current,
      { "accept-encoding": "gzip, deflate, br", ...headers },
      signal,
    )
    const status = response.statusCode ?? 0
    const location = response.headers.location
    if (REDIRECTS.has(status) && location) {
      response.resume()
      response.destroy()
      if (hop >= MAX_REDIRECTS) {
        throw new OutboundBlocked(`${urlForLog(url)} redirects too often`)
      }
      if (!URL.canParse(location, current)) {
        throw new OutboundBlocked(
          `${urlForLog(current)} redirects to an invalid URL`,
        )
      }
      const next = new URL(location, current)
      // Never trade TLS for plain HTTP on the way.
      if (current.protocol === "https:" && next.protocol === "http:") {
        throw new OutboundBlocked(
          `${urlForLog(current)} redirects to plain HTTP`,
        )
      }
      current = next
      continue
    }
    const body = decoded(response)
    signal.addEventListener("abort", () => body.destroy(signal.reason), {
      once: true,
    })
    return {
      status,
      headers: response.headers,
      // SAFETY: A byte stream without an encoding yields Buffers, which are
      // Uint8Arrays.
      body: Readable.toWeb(body) as ReadableStream<Uint8Array>,
      url: current,
    }
  }
}
