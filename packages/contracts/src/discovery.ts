import { t } from "./schema"

export const DISCOVERY_PORT = 8421
export const DISCOVERY_MAX_BYTES = 512

// Padding makes a reply no larger than the probe, even with a long URL.
export const DISCOVERY_PROBE = "Matinee discovery v1".padEnd(
  DISCOVERY_MAX_BYTES,
  " ",
)

/** IPv4 UDP discovery, separate from the HTTP contract and its version. */
export const DiscoveryReply = t.looseObject({
  version: t.literal(1),
  name: t.string().trim().min(1).max(64),
  url: t
    .string()
    .max(400)
    .url()
    .refine((value) => {
      const url = new URL(value)
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      )
    }),
})
export type DiscoveryReply = t.infer<typeof DiscoveryReply>
