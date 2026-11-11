import { createSocket } from "node:dgram"

import {
  DISCOVERY_MAX_BYTES,
  DISCOVERY_PORT,
  DISCOVERY_PROBE,
  DiscoveryReply,
} from "@matinee/contracts"

import { env } from "./env"
import { log } from "./log"

/** Optional LAN responder. A socket failure must not prevent HTTP startup. */
export function startDiscovery(): () => void {
  const noop = () => {}
  if (!env.MATINEE_DISCOVERY_ENABLED) return noop
  const rawHostname = new URL(env.PUBLIC_URL).hostname.toLowerCase()
  const hostname = rawHostname.endsWith(".")
    ? rawHostname.slice(0, -1)
    : rawHostname
  // A loopback URL would connect a TV to itself. Don't advertise it.
  if (
    ["localhost", "[::1]"].includes(hostname) ||
    hostname.startsWith("127.") ||
    hostname.endsWith(".localhost") ||
    hostname.startsWith("[::ffff:7f")
  ) {
    return noop
  }
  const result = DiscoveryReply.safeParse({
    version: 1,
    name: "Matinee",
    url: env.PUBLIC_URL,
  })
  if (!result.success) {
    log.warn("LAN discovery disabled: PUBLIC_URL cannot be advertised")
    return noop
  }
  const reply = Buffer.from(JSON.stringify(result.data))
  if (reply.length > DISCOVERY_MAX_BYTES) {
    log.warn("LAN discovery disabled: PUBLIC_URL makes the reply too large")
    return noop
  }
  const probe = Buffer.from(DISCOVERY_PROBE)
  // IPv4 broadcast only. IPv6 needs a multicast group and interface scopes;
  // add that as a separate protocol transport if clients need it.
  const socket = createSocket("udp4")
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      socket.close()
    } catch {
      // A failed bind may have already closed the socket.
    }
  }
  const failed = (cause: Error) => {
    if (stopped) return
    log.warn(
      `LAN discovery stopped: ${cause.message.replaceAll(/[\r\n]+/g, " ")}`,
    )
    stop()
  }
  socket.on("error", failed)
  // One reply per source IP per second, regardless of its source port.
  // Keep at most 1024 entries and 20 replies per second across all senders.
  const senders = new Map<string, number>()
  let windowStart = performance.now()
  let replies = 0
  socket.on("message", (message, sender) => {
    if (stopped || !message.equals(probe) || sender.port === 0) return
    const now = performance.now()
    if (now - windowStart >= 1000) {
      windowStart = now
      replies = 0
    }
    if (replies >= 20) return
    for (const [address, time] of senders) {
      if (now - time < 1000) break
      senders.delete(address)
    }
    if (senders.has(sender.address) || senders.size >= 1024) return
    senders.set(sender.address, now)
    replies++
    // Send failures are local network errors, not a reason to spam the log.
    socket.send(reply, sender.port, sender.address, () => {})
  })
  try {
    socket.bind(DISCOVERY_PORT, "0.0.0.0")
  } catch (cause) {
    failed(
      cause instanceof Error ? cause : new Error("Couldn't bind UDP socket"),
    )
  }
  return stop
}
