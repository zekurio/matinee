import { lookup } from "node:dns/promises"
import {
  request as httpRequest,
  validateHeaderName,
  validateHeaderValue,
} from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"
import type { LookupFunction } from "node:net"
import { Writable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { callbackify } from "node:util"
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib"

import { isPublicAddress } from "./address"

/**
 * A host a request may go to. `*.example.com` matches any subdomain, and
 * `*` alone matches any public https host, which `trusted` can't widen.
 */
export type HostRule = {
  pattern: string
  port?: number
  trusted?: boolean
  /**
   * The one scheme the rule is for. A rule made from an address someone
   * typed sets it, with the port, so allowing `https://nas.lan` doesn't
   * also allow plain http to port 80 of that machine.
   */
  protocol?: "http:" | "https:"
}

/** Any public https host on port 443, as a rule to list beside others. */
export const ANY_PUBLIC_HOST: HostRule = { pattern: "*" }
export class GuardedFetchError extends Error {
  constructor(
    public readonly code: "blocked" | "too-large" | "timeout" | "network",
    message: string,
  ) {
    super(message)
    this.name = "GuardedFetchError"
  }
}
type Options = {
  method?: string
  headers?: Record<string, string>
  body?: Uint8Array | string | null
  allow: readonly HostRule[] | "public"
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  userAgent?: string
  signal?: AbortSignal
  /** Test-only: supplies DNS answers inside the connection's lookup hook. */
  testLookup?: (
    hostname: string,
  ) => Promise<{ address: string; family: number }[]>
}
function hostname(url: URL): string {
  return url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "")
}
function match(url: URL, allow: Options["allow"]): HostRule | undefined {
  if (
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  )
    return
  const host = hostname(url)
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80))
  const anyPublic =
    url.protocol === "https:" && port === 443 && !isIP(host)
      ? { pattern: host }
      : undefined
  if (allow === "public") return anyPublic
  const rule = allow.find((rule) => {
    if (rule.pattern === "*") return anyPublic !== undefined
    if (/[/?#@]/.test(rule.pattern)) return false
    let pattern: string
    try {
      const wildcard = rule.pattern.startsWith("*.")
      pattern =
        (wildcard ? "*." : "") +
        hostname(
          new URL(`https://${wildcard ? rule.pattern.slice(2) : rule.pattern}`),
        )
    } catch {
      return false
    }
    const matches = pattern.startsWith("*.")
      ? host.endsWith(pattern.slice(1)) && host !== pattern.slice(2)
      : host === pattern
    return (
      matches &&
      port === (rule.port ?? (url.protocol === "https:" ? 443 : 80)) &&
      (rule.protocol === undefined || url.protocol === rule.protocol) &&
      (url.protocol === "https:" || rule.trusted === true) &&
      (!isIP(host) || (rule.trusted === true && pattern === host))
    )
  })
  return rule?.pattern === "*" ? anyPublic : rule
}
/**
 * The rule for exactly the address an admin typed: its host, its port,
 * and its scheme, on any network. Undefined if it isn't an http(s)
 * address or carries a username.
 */
export function ruleForAddress(address: string): HostRule | undefined {
  const url = URL.parse(address)
  if (!url || url.username || url.password) return
  if (url.protocol !== "http:" && url.protocol !== "https:") return
  return {
    // As the URL has it, so an IPv6 address keeps its brackets.
    pattern: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    protocol: url.protocol,
    trusted: true,
  }
}
export function hostAllowed(
  url: string | URL,
  allow: Options["allow"],
): boolean {
  try {
    return match(new URL(url), allow) !== undefined
  } catch {
    return false
  }
}
const forbidden = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "cookie",
])
const redirects = new Set([301, 302, 303, 307, 308])

export async function guardedFetch(
  input: string,
  options: Options,
): Promise<{
  status: number
  statusText: string
  url: string
  headers: [string, string][]
  body: Uint8Array
}> {
  const controller = new AbortController()
  const abort = () =>
    controller.abort(new GuardedFetchError("timeout", "Request was aborted"))
  const timer = setTimeout(
    () =>
      controller.abort(
        new GuardedFetchError("timeout", "Request exceeded its time limit"),
      ),
    options.timeoutMs ?? 20_000,
  )
  options.signal?.addEventListener("abort", abort, { once: true })
  if (options.signal?.aborted) abort()
  try {
    let url: URL
    try {
      url = new URL(input)
    } catch {
      throw new GuardedFetchError("blocked", "Use a valid absolute HTTP URL")
    }
    const headers = Object.fromEntries<string>([])
    try {
      for (const [name, value] of Object.entries(options.headers ?? {})) {
        validateHeaderName(name)
        validateHeaderValue(name, value)
        const key = name.toLowerCase()
        if (!forbidden.has(key) && !key.startsWith("proxy-"))
          headers[key] = value
      }
      headers["user-agent"] =
        options.userAgent ?? headers["user-agent"] ?? "Matinee"
      headers["accept-encoding"] = "gzip, deflate, br"
      for (const [name, value] of Object.entries(headers))
        validateHeaderValue(name, value)
    } catch {
      throw new GuardedFetchError(
        "blocked",
        "Request headers contain an invalid name or value",
      )
    }
    let method = (options.method ?? "GET").toUpperCase()
    let body = options.body
    for (let hop = 0; ; hop++) {
      controller.signal.throwIfAborted()
      const rule = match(url, options.allow)
      if (!rule)
        throw new GuardedFetchError("blocked", `${url.hostname} isn't allowed`)
      const checkedLookup: LookupFunction = (host, settings, callback) => {
        const resolve =
          options.testLookup ?? ((name: string) => lookup(name, { all: true }))
        callbackify(async () => {
          const addresses = await resolve(host)
          controller.signal.throwIfAborted()
          if (
            !addresses.length ||
            addresses.some(
              (a) =>
                !isIP(a.address) ||
                (!rule.trusted && !isPublicAddress(a.address)),
            )
          ) {
            throw new GuardedFetchError(
              "blocked",
              `${host} resolves to a private or invalid address`,
            )
          }
          return addresses
        })((cause, addresses) => {
          if (cause || !addresses) {
            callback(cause, [], 0)
            return
          }
          if (settings.all) callback(null, addresses)
          else {
            const first = addresses.find(
              (a) => !settings.family || a.family === settings.family,
            )
            if (first) callback(null, first.address, first.family)
            else
              callback(
                new GuardedFetchError(
                  "network",
                  `${host} has no address in the requested family`,
                ),
                [],
                0,
              )
          }
        })
      }
      const current = url
      const result = await new Promise<{
        status: number
        statusText: string
        headers: [string, string][]
        body: Uint8Array
        location?: string
      }>((resolve, reject) => {
        const request = (
          current.protocol === "https:" ? httpsRequest : httpRequest
        )(
          current,
          {
            method,
            headers,
            agent: false,
            lookup: checkedLookup,
            signal: controller.signal,
          },
          (response) => {
            const status = response.statusCode ?? 0
            const location = response.headers.location
            if (redirects.has(status) && location !== undefined) {
              response.destroy()
              resolve({
                status,
                statusText: response.statusMessage ?? "",
                headers: [],
                body: new Uint8Array(),
                location,
              })
              return
            }
            const chunks: Buffer[] = []
            let size = 0
            const sink = new Writable({
              write(chunk: Buffer, _encoding, callback) {
                size += chunk.length
                if (size > (options.maxBytes ?? 10 * 1024 * 1024))
                  callback(
                    new GuardedFetchError("too-large", `${input} is too large`),
                  )
                else {
                  chunks.push(chunk)
                  callback()
                }
              },
            })
            const encoding =
              method === "HEAD" || status === 204 || status === 304
                ? undefined
                : response.headers["content-encoding"]?.trim().toLowerCase()
            const decoder =
              encoding === "gzip"
                ? createGunzip()
                : encoding === "deflate"
                  ? createInflate()
                  : encoding === "br"
                    ? createBrotliDecompress()
                    : undefined
            if (encoding && encoding !== "identity" && !decoder) {
              response.destroy()
              reject(
                new GuardedFetchError(
                  "network",
                  `Unsupported content encoding: ${encoding}`,
                ),
              )
              return
            }
            const outputHeaders: [string, string][] = []
            for (let i = 0; i < response.rawHeaders.length; i += 2) {
              const name = response.rawHeaders[i] ?? ""
              if (name.toLowerCase() !== "set-cookie")
                outputHeaders.push([
                  name.toLowerCase(),
                  response.rawHeaders[i + 1] ?? "",
                ])
            }
            const done = decoder
              ? pipeline(response, decoder, sink, { signal: controller.signal })
              : pipeline(response, sink, { signal: controller.signal })
            void done.then(
              () =>
                resolve({
                  status,
                  statusText: response.statusMessage ?? "",
                  headers: outputHeaders,
                  body: Buffer.concat(chunks, size),
                }),
              (cause: Error) => {
                request.destroy()
                reject(cause)
              },
            )
          },
        )
        request.on("error", (cause) => {
          request.destroy()
          reject(cause)
        })
        try {
          request.end(body ?? undefined)
        } catch (cause) {
          request.destroy()
          reject(cause)
        }
      })
      if (result.location === undefined) return { ...result, url: url.href }
      if (hop >= (options.maxRedirects ?? 5))
        throw new GuardedFetchError("blocked", "Too many redirects")
      let next: URL
      try {
        next = new URL(result.location, url)
      } catch {
        throw new GuardedFetchError("blocked", "Redirect has an invalid URL")
      }
      if (url.protocol === "https:" && next.protocol === "http:")
        throw new GuardedFetchError(
          "blocked",
          "Redirect from HTTPS to HTTP isn't allowed",
        )
      if (hostname(url) !== hostname(next) || url.port !== next.port)
        delete headers.authorization
      if (
        (result.status === 303 && method !== "HEAD") ||
        ((result.status === 301 || result.status === 302) && method === "POST")
      ) {
        method = "GET"
        body = null
        delete headers["content-type"]
      }
      url = next
    }
  } catch (cause) {
    if (controller.signal.aborted) throw controller.signal.reason
    if (cause instanceof GuardedFetchError) throw cause
    throw new GuardedFetchError(
      "network",
      `Request failed: ${cause instanceof Error ? cause.message : "network error"}`,
    )
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", abort)
  }
}
