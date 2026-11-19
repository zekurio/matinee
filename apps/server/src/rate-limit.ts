import { isIPv6 } from "node:net"

import type { Context } from "hono"

import { connectionOf } from "./network/connection"
import { networkRules } from "./network/settings"

/*
 * Limits on what anyone can ask of the server without signing in: each
 * client gets so many tries per window, in memory. The server runs as one
 * process, so a Map is all it takes, and a restart forgetting the counts
 * only ever lets someone in sooner.
 */

const MINUTE_MS = 60_000

/** Clients each limit remembers at most. The oldest window goes first. */
const MAX_CLIENTS = 10_000

type Window = { tries: number; endsAt: number }

export type RateLimit = {
  /**
   * Take one try for `client`. Seconds until it may try again, or 0 when
   * this one may go ahead.
   */
  take(client: string): number
}

/** At most `tries` per `windowMs` for each client. */
export function rateLimit(options: {
  tries: number
  windowMs: number
}): RateLimit {
  // Every window is as long as the next and starts when it's stored, so
  // the Map's insertion order is the order they end in.
  const windows = new Map<string, Window>()

  function forgetEnded(now: number): void {
    for (const [client, window] of windows) {
      if (window.endsAt > now && windows.size < MAX_CLIENTS) return
      windows.delete(client)
    }
  }

  return {
    take(client) {
      const now = Date.now()
      forgetEnded(now)
      const window = windows.get(client)
      if (!window) {
        windows.set(client, { tries: 1, endsAt: now + options.windowMs })
        return 0
      }
      if (window.tries >= options.tries) {
        return Math.max(1, Math.ceil((window.endsAt - now) / 1000))
      }
      window.tries++
      return 0
    },
  }
}

/** What each anonymous procedure may be asked for, per client. */
export const LIMITS = {
  /** Passkey sign-in and sign-up options, each a stored challenge. */
  challenges: rateLimit({ tries: 30, windowMs: MINUTE_MS }),
  /** Single sign-on, which stores a challenge and calls the provider. */
  oidcStart: rateLimit({ tries: 20, windowMs: MINUTE_MS }),
  /** New device codes. An app asks again only when one expires. */
  deviceStart: rateLimit({ tries: 20, windowMs: 10 * MINUTE_MS }),
  /**
   * Device code polls, over all codes. Each code also holds its own
   * interval; this bounds guessing at codes that don't exist.
   */
  devicePoll: rateLimit({ tries: 120, windowMs: MINUTE_MS }),
  /** Setup token guesses. */
  setupUnlock: rateLimit({ tries: 10, windowMs: 15 * MINUTE_MS }),
} satisfies Record<string, RateLimit>

/** The 64-bit prefix of an IPv6 address, which one client usually holds. */
function ipv6Prefix(address: string): string {
  const [head = "", tail] = address.split("::")
  const left = head ? head.split(":") : []
  const right = tail ? tail.split(":") : []
  // An IPv4 address at the end takes two groups.
  const width = (groups: string[]) =>
    groups.length + (groups.at(-1)?.includes(".") ? 1 : 0)
  const missing = Math.max(0, 8 - width(left) - width(right))
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right]
  const prefix = groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
  return `${prefix.join(":")}::/64`
}

/**
 * Who a limit counts the request against: its address by the network
 * settings, so a trusted proxy's clients each count on their own, and an
 * IPv6 client by its /64, which it can pick any address from.
 */
async function clientOf(c: Context): Promise<string> {
  const { address } = connectionOf(c, await networkRules())
  if (!address) return "unknown"
  return isIPv6(address) ? ipv6Prefix(address) : address
}

/**
 * Take a try of `limit` for the client sending `c`. Seconds it has to wait
 * when it's out of tries, with `Retry-After` set; 0 when it may go ahead.
 */
export async function takeTry(c: Context, limit: RateLimit): Promise<number> {
  const wait = limit.take(await clientOf(c))
  if (wait > 0) c.header("Retry-After", String(wait))
  return wait
}

export const TOO_MANY_TRIES = "Too many tries. Wait a while and try again."
