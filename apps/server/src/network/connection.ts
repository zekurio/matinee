import { isIP, isIPv4 } from "node:net"

import { getConnInfo } from "@hono/node-server/conninfo"
import type { NetworkConnection } from "@matinee/contracts"
import type { Context } from "hono"

import type { NetworkRules } from "./settings"

/*
 * Where a request came from, by the admin's network settings. The
 * server only reads addresses: the socket's, and `X-Forwarded-For` when
 * the socket is a proxy the admin trusts. Anyone can send that header, so
 * from any other address it counts for nothing.
 */

const MAPPED = "::ffff:"

/** A valid address in its plain form, or null. */
function plain(text: string | undefined): string | null {
  const address = text?.trim() ?? ""
  // An IPv4 client on a dual-stack socket reads as `::ffff:192.168.1.2`.
  const unmapped =
    address.toLowerCase().startsWith(MAPPED) &&
    isIPv4(address.slice(MAPPED.length))
      ? address.slice(MAPPED.length)
      : address
  return isIP(unmapped) === 0 ? null : unmapped
}

function within(list: NetworkRules["local"], address: string): boolean {
  return list.check(address, isIPv4(address) ? "ipv4" : "ipv6")
}

function peerOf(c: Context): string | null {
  try {
    return plain(getConnInfo(c).remote.address)
  } catch {
    // Not a socket of the node server, as in a test that calls the app.
    return null
  }
}

/** How the server sees the request, by `rules`. */
export function connectionOf(
  c: Context,
  rules: NetworkRules,
): NetworkConnection {
  const peer = peerOf(c)
  const forwarded = c.req.header("x-forwarded-for")
  if (!peer) return { address: null, local: false, unheededProxy: false }
  if (!forwarded || !within(rules.trusted, peer)) {
    return {
      address: peer,
      local: within(rules.local, peer),
      unheededProxy: Boolean(forwarded),
    }
  }
  // Each proxy appends who it heard from, so the client is the last
  // address that isn't a trusted proxy itself. One that doesn't parse
  // ends the chain: what's left of it can't be told from made up.
  let address = peer
  for (const hop of forwarded.split(",").toReversed()) {
    const next = plain(hop)
    if (!next) break
    address = next
    if (!within(rules.trusted, next)) break
  }
  return {
    address,
    local: within(rules.local, address),
    unheededProxy: false,
  }
}
