import { MIN_BITRATE_LIMIT } from "./access"
import { t } from "./schema"

/*
 * What the server is told about the network it sits in. It doesn't work
 * any of this out: an admin says which addresses are at home and which
 * proxies to believe, and how much the connection sends. From that the
 * server knows whether a player is local or remote, which so far decides
 * one thing: a watch party's remote members share the upload, and local
 * ones play as they would alone.
 */

/** An IP address, or a range of them in CIDR notation. */
export const NetworkRange = t
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[0-9A-Fa-f:.]+(\/\d{1,3})?$/,
    "Use an address or a range like 192.168.0.0/16.",
  )

/** The private, loopback, and link-local ranges, as a new server starts. */
export const DEFAULT_LOCAL_NETWORKS: readonly string[] = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "::1",
  "fc00::/7",
  "fe80::/10",
]

export const NetworkSettings = t.object({
  /** Addresses that are at home. A player from any other is remote. */
  localNetworks: t.array(NetworkRange).max(64),
  /**
   * Reverse proxies in front of the server. From these, and only these,
   * it believes `X-Forwarded-For` for who a request came from. Without
   * its proxy here, every request looks like the proxy's.
   */
  trustedProxies: t.array(NetworkRange).max(64),
  /**
   * What the connection sends, in bits per second. A watch party's
   * remote members each get an equal share of it as their bit rate
   * limit. Null for no budget.
   */
  uploadBitrate: t
    .number()
    .int()
    .min(MIN_BITRATE_LIMIT, "Pick a limit of at least 1 Mb/s.")
    .max(100_000_000_000)
    .nullable(),
})
export type NetworkSettings = t.infer<typeof NetworkSettings>

/** How the server sees the request that asked, for checking the settings. */
export const NetworkConnection = t.object({
  /** Null when the server couldn't tell, which counts as remote. */
  address: t.string().nullable(),
  local: t.boolean(),
  /**
   * The request came with `X-Forwarded-For` from an address that isn't a
   * trusted proxy, so `address` is likely a proxy and not the browser.
   */
  unheededProxy: t.boolean(),
})
export type NetworkConnection = t.infer<typeof NetworkConnection>

export const AdminNetworkSettings = t.object({
  settings: NetworkSettings,
  connection: NetworkConnection,
})
export type AdminNetworkSettings = t.infer<typeof AdminNetworkSettings>
