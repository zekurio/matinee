import { BlockList, isIP } from "node:net"

import { DEFAULT_LOCAL_NETWORKS, NetworkSettings } from "@matinee/contracts"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"

/*
 * The network as an admin described it, see `NetworkSettings`. Loaded
 * once and changed only through `saveNetwork`, with the ranges built into
 * lists already, since every request asks whether it is local.
 */

const KEY = "network"

const SavedNetwork = NetworkSettings.partial()

const NETWORK_DEFAULTS: NetworkSettings = {
  localNetworks: [...DEFAULT_LOCAL_NETWORKS],
  trustedProxies: [],
  uploadBitrate: null,
}

export type NetworkRules = {
  settings: NetworkSettings
  local: BlockList
  trusted: BlockList
}

type Range = { address: string; prefix: number; family: "ipv4" | "ipv6" }

/** An address or CIDR range, or null for text that is neither. */
function parseRange(text: string): Range | null {
  const [address = "", bits, ...rest] = text.split("/")
  const version = isIP(address)
  if (version === 0 || rest.length > 0) return null
  const widest = version === 4 ? 32 : 128
  const prefix = bits === undefined ? widest : Number(bits)
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > widest) return null
  return { address, prefix, family: version === 4 ? "ipv4" : "ipv6" }
}

/** The first entry that isn't an address or a range, for telling the admin. */
export function invalidRange(settings: NetworkSettings): string | null {
  return (
    [...settings.localNetworks, ...settings.trustedProxies].find(
      (entry) => parseRange(entry) === null,
    ) ?? null
  )
}

function listOf(ranges: readonly string[]): BlockList {
  const list = new BlockList()
  for (const text of ranges) {
    const range = parseRange(text)
    // Saving checks them, so this only skips what an older version kept.
    if (range) list.addSubnet(range.address, range.prefix, range.family)
  }
  return list
}

function rulesOf(settings: NetworkSettings): NetworkRules {
  return {
    settings,
    local: listOf(settings.localNetworks),
    trusted: listOf(settings.trustedProxies),
  }
}

let rules: NetworkRules | null = null
let loading: Promise<NetworkRules> | null = null

async function readSaved(): Promise<NetworkRules> {
  const [row] = await db.select().from(setting).where(eq(setting.key, KEY))
  const parsed = SavedNetwork.safeParse(row?.value ?? {})
  if (!parsed.success) {
    log.warn(
      "Ignoring saved network settings that no longer validate",
      parsed.error,
    )
  }
  rules = rulesOf(
    parsed.success ? { ...NETWORK_DEFAULTS, ...parsed.data } : NETWORK_DEFAULTS,
  )
  return rules
}

/** The settings in use, with their ranges ready to check addresses against. */
export async function networkRules(): Promise<NetworkRules> {
  if (rules) return rules
  loading ??= readSaved().finally(() => {
    loading = null
  })
  return loading
}

export async function saveNetwork(
  input: NetworkSettings,
): Promise<NetworkRules> {
  await db
    .insert(setting)
    .values({ key: KEY, value: input })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: input, updatedAt: new Date() },
    })
  rules = rulesOf(input)
  return rules
}
